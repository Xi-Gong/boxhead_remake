// LAN transport for the Electron MAIN process (deviation LAN_MULTIPLAYER, v0.1.3). Pure node (dgram + net): no
// Electron import, so the unit tests can drive real sockets on localhost. The IPC glue that hands this to the
// renderer lives in electron/lanIpc.ts.
//
//   discovery : UDP beacons once per second - one directed broadcast per IPv4 interface (255.255.255.255 misses
//               multi-homed / VPN machines) plus a 127.0.0.1 unicast so two instances on one machine find each
//               other (that is how the packaged playtest discovers its host).
//   hosting   : one TCP server on the first free port of LAN_TCP_PORT_FIRST..LAST; exactly ONE client at a time.
//   handshake : the client's first frame must be `hello`; the transport itself checks proto/app (same build only)
//               and replies `welcome`; every later frame is forwarded to the renderer verbatim.
//   liveness  : 1 s heartbeat both ways (hb echoes), LinkWatchdog declares the link dead after 3.5 s of silence -
//               a half-open TCP failure would otherwise take 15-20 s to notice. On loss the client may reconnect
//               (same sid); the host keeps its server listening.
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { connect as tcpConnect, createServer, type Server, type Socket as TcpSocket } from 'node:net';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import { FastInputPath } from './fastInput.ts';
import {
  decodeBeacon, encodeBeacon, encodeFrame, FrameDecoder, LinkWatchdog,
  LAN_DISCOVERY_PORT, LAN_HEARTBEAT_MS, LAN_HOST_STALE_MS, LAN_LINK_DEAD_MS, LAN_PROTOCOL_VERSION, LAN_TCP_PORT_FIRST, LAN_TCP_PORT_LAST,
  type BeaconMsg, type HostInfo, type LanMessage,
} from '../src/game/local/Net/protocol.ts';

export interface LanEvent {
  kind: 'peer' | 'hosts' | 'error';
  /** 'peer': the single peer link changed. connected=true after a successful handshake. */
  connected?: boolean;
  /** Why the link ended / failed ('lost' | 'closed' | 'busy' | 'version' | reason text). */
  reason?: string;
  hosts?: HostInfo[];
  message?: string;
  diagnostic?: Record<string, number | string>;
}

export interface LanHello {
  name: string;
  sid?: string;
  char: number;
  capTick?: number;
}

interface Peer {
  socket: TcpSocket;
  decoder: FrameDecoder;
  watchdog: LinkWatchdog;
  fast?: FastInputPath;
  probes?: Map<number, number>;
}

// --boxhead-net-delay=<ms> (v0.2.1 smoothness QA): delay every TCP send by N ms (one way) so localhost
// dual-instance runs behave like a real link of that class (the UDP discovery beacons are untouched). The
// heartbeat RTT then measures the injected delay and computeInputDelay picks the same input delay the real
// link would.
const NET_DELAY_MS = (() => {
  const a = process.argv.find((s) => s.startsWith('--boxhead-net-delay='));
  const n = a ? Number(a.split('=')[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

export class LanTransport {
  private readonly identity: string; // proto/app build string both sides must share
  private readonly hostName: string;
  private eventCb: ((e: LanEvent) => void) | undefined;
  private messageCb: ((msg: LanMessage) => void) | undefined;

  // discovery (join side)
  private discoverSock: UdpSocket | undefined;
  private hosts = new Map<string, HostInfo>();
  private pruneTimer: NodeJS.Timeout | undefined;
  private cancelDiscovery: (() => void) | undefined;

  // hosting
  private server: Server | undefined;
  private serverPort = 0;
  private beaconSock: UdpSocket | undefined;
  private beaconTimer: NodeJS.Timeout | undefined;
  private beaconErrorReported = false;
  private beaconStatus: 'lobby' | 'playing' = 'lobby';
  private hostGeneration = 0;
  private startingHost: Promise<number> | undefined;
  private readonly handshakes = new Set<TcpSocket>();

  // peer link (either side)
  private peer: Peer | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private readonly linkDeadMs: number;
  private connectGeneration = 0;
  private cancelConnect: (() => void) | undefined;

  constructor(opts: { identity: string; hostName?: string; linkDeadMs?: number }) {
    this.identity = opts.identity;
    this.hostName = opts.hostName ?? os.hostname();
    this.linkDeadMs = opts.linkDeadMs ?? LAN_LINK_DEAD_MS;
  }

  onEvent(cb: (e: LanEvent) => void): void { this.eventCb = cb; }
  onMessage(cb: (msg: LanMessage) => void): void { this.messageCb = cb; }
  get hosting(): boolean { return this.server !== undefined; }
  get hasPeer(): boolean { return this.peer !== undefined; }

  private emit(e: LanEvent): void { this.eventCb?.(e); }
  private fire(msg: LanMessage): void { this.messageCb?.(msg); }

  // ---------------------------------------------------------------------------------------------- discovery (join side)

  /** Listen for host beacons on the discovery port; hosts surface through the 'hosts' event. */
  async startDiscovery(): Promise<void> {
    if (this.discoverSock) return;
    const sock = createSocket({ type: 'udp4', reuseAddr: false });
    this.discoverSock = sock;
    await new Promise<void>((resolve, reject) => {
      this.cancelDiscovery = resolve;
      const fail = (err: Error): void => {
        if (this.discoverSock === sock) { this.discoverSock = undefined; this.cancelDiscovery = undefined; }
        reject(err);
      };
      sock.once('error', fail);
      sock.bind(LAN_DISCOVERY_PORT, () => {
        sock.off('error', fail);
        if (this.discoverSock !== sock) { resolve();return; }
        this.cancelDiscovery = undefined;
        sock.on('error', () => {}); // a later error must not crash the process
        sock.on('message', (data, rinfo) => {
          const b = decodeBeacon(data.toString('utf8'));
          if (!b || rinfo.family !== 'IPv4') return;
          this.hosts.set(`${rinfo.address}:${b.port}`, {
            ip: rinfo.address, name: b.name, app: b.app, status: b.status, players: b.players, port: b.port, lastSeen: Date.now(),
          });
          this.emitHosts();
        });
        resolve();
      });
    });
    if (this.discoverSock !== sock) return; // stopped while bind was pending
    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [k, h] of this.hosts) if (now - h.lastSeen > LAN_HOST_STALE_MS) { this.hosts.delete(k); changed = true; }
      if (changed) this.emitHosts();
    }, 1000);
    this.emitHosts();
  }

  stopDiscovery(): void {
    this.cancelDiscovery?.();this.cancelDiscovery = undefined;
    if (this.pruneTimer) { clearInterval(this.pruneTimer); this.pruneTimer = undefined; }
    if (this.discoverSock) { this.discoverSock.close(); this.discoverSock = undefined; }
    this.hosts.clear();
  }

  private emitHosts(): void {
    this.emit({ kind: 'hosts', hosts: [...this.hosts.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  }

  // ---------------------------------------------------------------------------------------------- hosting

  /** Start the TCP server (first free port) and announce ourselves via UDP beacons. Resolves with the port. */
  async startHost(status: 'lobby' | 'playing' = 'lobby'): Promise<number> {
    if (this.server) return this.serverPort;
    if (this.startingHost) return this.startingHost;
    const pending = this.listenHost(status, this.hostGeneration);
    this.startingHost = pending;
    try { return await pending; }
    finally { if (this.startingHost === pending) this.startingHost = undefined; }
  }

  private async listenHost(status: 'lobby' | 'playing', generation: number): Promise<number> {
    this.beaconStatus = status;
    const server = createServer((socket) => {
      if (generation !== this.hostGeneration) socket.destroy();else this.onServerConnection(socket);
    });
    let port = LAN_TCP_PORT_FIRST;
    for (;; port++) {
      if (port > LAN_TCP_PORT_LAST) throw new Error('no free LAN port (47631-47640 all in use)');
      // NOTE: the 'error' handler must resolve false - resolve(err) would be a truthy "success" (bit us once).
      const ok = await new Promise<boolean>((resolve) => {
        const onErr = (): void => { server.off('error', onErr); resolve(false); };
        server.once('error', onErr);
        server.listen({ port, host: '0.0.0.0' }, () => { server.off('error', onErr); resolve(true); });
      });
      if (generation !== this.hostGeneration) {
        if (server.listening) server.close();
        throw new Error('hosting cancelled');
      }
      if (ok) break;
    }
    this.server = server;
    this.serverPort = port;
    const socket = createSocket({ type: 'udp4' });
    this.beaconSock = socket;
    this.beaconErrorReported = false;
    socket.on('error', error => this.reportBeaconError(socket, error));
    // send() binds implicitly. Enable directed broadcasts as soon as that bind completes.
    socket.on('listening', () => {
      if (this.beaconSock !== socket || generation !== this.hostGeneration) return;
      try { socket.setBroadcast(true); } catch (error) { this.reportBeaconError(socket, error); }
    });
    this.beaconTimer = setInterval(() => {
      if (this.beaconSock === socket && generation === this.hostGeneration) this.sendBeacon();
    }, LAN_HEARTBEAT_MS);
    this.sendBeacon();
    return port;
  }

  setHostStatus(status: 'lobby' | 'playing'): void {
    this.beaconStatus = status;
    this.sendBeacon();
  }

  /** This machine's non-internal IPv4 addresses (the room view shows them so player 2 can join by IP). */
  hostAddresses(): string[] {
    const out = new Set<string>();
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.add(i.address);
    }
    return [...out];
  }

  private beaconBody(): Omit<BeaconMsg, 'magic' | 'proto'> {
    return { app: this.identity, name: this.hostName, status: this.beaconStatus, players: this.hasPeer ? 2 : 1, port: this.serverPort };
  }

  private sendBeacon(): void {
    const socket = this.beaconSock;
    if (!socket) return;
    const payload = Buffer.from(encodeBeacon(this.beaconBody()), 'utf8');
    const targets = new Set<string>(['127.0.0.1']);
    for (const list of Object.values(os.networkInterfaces())) {
      for (const i of list ?? []) {
        if (i.family !== 'IPv4' || i.internal) continue;
        if (!i.netmask) continue; // netmask needs node >= 18.4
        const parts = (a: string): number[] => a.split('.').map(Number);
        const ip = parts(i.address);
        const mask = parts(i.netmask);
        const broadcast = ip.map((o, idx) => (o | ~mask[idx]) & 255).join('.');
        targets.add(broadcast);
      }
    }
    for (const target of targets) {
      // A send/error/quit callback may re-enter room shutdown. Never use a cleared or replacement socket.
      if (this.beaconSock !== socket) return;
      try {
        socket.send(payload, LAN_DISCOVERY_PORT, target, error => {
          if (error) this.reportBeaconError(socket, error);
        });
      } catch (error) { this.reportBeaconError(socket, error); }
    }
  }

  private reportBeaconError(socket: UdpSocket, error: unknown): void {
    if (this.beaconSock !== socket || this.beaconErrorReported) return;
    this.beaconErrorReported = true;
    // Discovery is best-effort: one unavailable interface must not terminate an established TCP room.
    this.emit({ kind: 'error', message: `LAN discovery: ${error instanceof Error ? error.message : String(error)}` });
  }

  stopHost(): void {
    ++this.hostGeneration;
    this.startingHost = undefined;
    if (this.beaconTimer) { clearInterval(this.beaconTimer); this.beaconTimer = undefined; }
    const beacon = this.beaconSock;
    this.beaconSock = undefined; // Invalidate before close can run callbacks.
    if (beacon) {
      try { beacon.close(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_SOCKET_DGRAM_NOT_RUNNING') throw error; }
    }
    if (this.server) {
      const s = this.server;
      this.server = undefined;
      s.close();
    }
    this.closePeer();
    for (const socket of this.handshakes) socket.destroy();
    this.handshakes.clear();
  }

  private onServerConnection(socket: TcpSocket): void {
    // Exactly one peer. A second connection is answered with welcome ok:false 'busy' after its hello.
    socket.setNoDelay(true);
    this.handshakes.add(socket);
    socket.once('close', () => this.handshakes.delete(socket));
    socket.setTimeout(1500, () => socket.destroy());
    const decoder = new FrameDecoder();
    let handshaked = false;
    socket.on('data', (chunk: Buffer) => {
      let msgs: unknown[];
      try { msgs = decoder.push(chunk); } catch { socket.destroy(); return; }
      if (!handshaked) {
        const idx = msgs.findIndex((m) => (m as LanMessage)?.t === 'hello');
        if (idx === -1) { if (msgs.length) socket.destroy(); return; } // garbage before the handshake
        const hello = msgs[idx] as Extract<LanMessage, { t: 'hello' }>;
        const reject = (reason: string): void => {
          this.rawSend(socket, { t: 'welcome', ok: false, reason, proto: LAN_PROTOCOL_VERSION, app: this.identity, name: this.hostName, sid: hello.sid ?? '' });
          socket.end();
        };
        if (this.peer) { reject('busy'); return; }
        if (hello.proto !== LAN_PROTOCOL_VERSION || hello.app !== this.identity) { reject('version'); return; }
        const sid = hello.sid ?? randomUUID();
        this.rawSend(socket, { t: 'welcome', ok: true, proto: LAN_PROTOCOL_VERSION, app: this.identity, name: this.hostName, sid });
        handshaked = true;
        this.handshakes.delete(socket);
        this.attachPeer(socket, decoder);
        this.fire({ ...hello, sid }); // the renderer needs char / capTick / sid
        // Frames that arrived in the same TCP segment as the hello belong to the live link, not the handshake.
        this.handlePeerMessages(this.peer!, msgs.slice(idx + 1));
      }
    });
    socket.on('error', () => socket.destroy());
  }

  // ---------------------------------------------------------------------------------------------- peer link

  /**
   * Client side: connect to a host. Scans LAN_TCP_PORT_FIRST..LAST when no port is given (manual-IP entry).
   * Resolves {ok:false, reason} when the host answered with a rejection or nothing answered at all.
   */
  async connect(ip: string, hello: LanHello, port?: number): Promise<{ ok: boolean; reason?: string }> {
    this.closePeer();
    const generation = this.connectGeneration;
    const ports = port ? [port] : Array.from({ length: LAN_TCP_PORT_LAST - LAN_TCP_PORT_FIRST + 1 }, (_, i) => LAN_TCP_PORT_FIRST + i);
    let lastReason = 'no-answer';
    for (const p of ports) {
      const r = await this.connectOne(ip, p, hello);
      if (generation !== this.connectGeneration) return { ok: false, reason: 'cancelled' };
      if (r.ok) return r;
      lastReason = r.reason ?? lastReason;
      if (r.reason === 'version' || r.reason === 'busy') return r; // the host is there and refused - stop scanning
    }
    return { ok: false, reason: lastReason };
  }

  private connectOne(ip: string, port: number, hello: LanHello): Promise<{ ok: boolean; reason?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (r: { ok: boolean; reason?: string }): void => {
        if (settled) return;
        settled = true;
        if (this.cancelConnect === cancel) this.cancelConnect = undefined;
        socket.destroy();
        resolve(r);
      };
      const socket = tcpConnect({ host: ip, port });
      const cancel = (): void => done({ ok: false, reason: 'cancelled' });
      this.cancelConnect = cancel;
      socket.setNoDelay(true);
      socket.setTimeout(1500); // per-port patience; a closed port refuses instantly, a filtered one times out
      const decoder = new FrameDecoder();
      socket.on('connect', () => {
        this.rawSend(socket, { t: 'hello', proto: LAN_PROTOCOL_VERSION, app: this.identity, name: hello.name, sid: hello.sid, char: hello.char, capTick: hello.capTick, netcodes: ['rollback-v2'], features: ['personal-growth-v1','armor-ammo-v1','pve-balance-v1','team-pass-v1','survival-v1','supply-crates-v2','reliable-supplies-v1','endless-pve-v1','enemy-variants-v1','persistent-enchantment-v1','timed-waves-v1','wave-draft-v1','boss-waves-v1','boss-encounters-v1'] });
      });
      socket.on('data', (chunk: Buffer) => {
        let msgs: unknown[];
        try { msgs = decoder.push(chunk); } catch { done({ ok: false, reason: 'protocol' }); return; }
        const idx = msgs.findIndex((m) => (m as LanMessage)?.t === 'welcome');
        if (idx === -1) return;
        const welcome = msgs[idx] as Extract<LanMessage, { t: 'welcome' }>;
        if (!welcome.ok) { done({ ok: false, reason: welcome.reason ?? 'refused' }); return; }
        if (settled) return;
        settled = true;
        if (this.cancelConnect === cancel) this.cancelConnect = undefined;
        socket.setTimeout(0);
        this.attachPeer(socket, decoder);
        resolve({ ok: true });
        // Frames pipelined behind the welcome in the same segment belong to the live link.
        this.handlePeerMessages(this.peer!, msgs.slice(idx + 1));
      });
      socket.on('timeout', () => done({ ok: false, reason: 'timeout' }));
      socket.on('error', (err: NodeJS.ErrnoException) => done({ ok: false, reason: err.code ?? 'error' }));
      socket.on('close', () => done({ ok: false, reason: 'closed' }));
    });
  }

  /** Route already-parsed frames of the live link: heartbeats echo ONCE, everything else reaches the renderer. */
  private handlePeerMessages(peer: Peer, msgs: unknown[]): void {
    if (this.peer !== peer) return;
    peer.watchdog.heard();
    for (const m of msgs) {
      if (this.peer !== peer) return;
      const msg = m as LanMessage;
      if (msg?.t === 'input-path') { peer.fast?.accept(msg); continue; }
      if (msg?.t === 'start') peer.fast?.begin(msg.netcode === 'rollback-v2' ? msg.epoch : undefined);
      if (msg?.t === 'recover' && msg.stage === 'commit') peer.fast?.begin(msg.epoch);
      if (msg?.t === 'hb') {
        // Echo the peer's probe; our own returning echo is surfaced so the renderer can compute RTT (now - ts).
        if (!msg.echo) this.rawSend(peer.socket, { ...msg, echo: true });
        else {
          const sent = peer.probes?.get(msg.ts);
          peer.probes?.delete(msg.ts);
          this.fire({ ...msg, rttMs: sent === undefined ? undefined : Math.max(0, performance.now() - sent) });
        }
        continue;
      }
      this.fire(msg);
    }
  }

  /** Install the long-lived peer: message forwarding, heartbeat, watchdog. */
  private attachPeer(socket: TcpSocket, decoder: FrameDecoder): void {
    const peer: Peer = { socket, decoder, watchdog: new LinkWatchdog(undefined, this.linkDeadMs), probes: new Map() };
    this.peer = peer;
    if (socket.remoteAddress) peer.fast = new FastInputPath(socket.remoteAddress,
      message => { if (this.peer === peer) this.rawSend(socket, message); },
      message => { if (this.peer === peer) { peer.watchdog.heard(); this.fire(message); } }, NET_DELAY_MS);
    socket.setTimeout(0);
    // The pre-handshake handlers of the connecting side are spent; only their side effects remain (guarded no-ops).
    socket.removeAllListeners('data');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
    socket.removeAllListeners('timeout');
    socket.on('data', (chunk: Buffer) => {
      if (this.peer !== peer) return;
      let msgs: unknown[];
      try { msgs = peer.decoder.push(chunk); } catch { this.endPeer('protocol', peer); return; }
      this.handlePeerMessages(peer, msgs);
    });
    socket.on('error', () => this.endPeer('error', peer));
    socket.on('close', () => this.endPeer('closed', peer));
    this.heartbeatTimer = setInterval(() => {
      if (this.peer !== peer) return;
      const ts = Date.now();
      peer.probes!.set(ts, performance.now());
      while (peer.probes!.size > 8) peer.probes!.delete(peer.probes!.keys().next().value!);
      this.rawSend(socket, { t: 'hb', ts });
      if (peer.watchdog.check()) this.endPeer('lost', peer);
    }, LAN_HEARTBEAT_MS);
    this.emit({ kind: 'peer', connected: true });
  }

  private endPeer(reason: string, expected = this.peer): void {
    const peer = this.peer;
    if (!peer || peer !== expected) return;
    this.peer = undefined;
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined; }
    peer.socket.destroy();
    peer.fast?.close();
    this.emit({ kind: 'peer', connected: false, reason, diagnostic: { silenceMs: peer.watchdog.silenceMs,
      pendingBytes: peer.socket.writableLength, udpReceived: peer.fast?.stats.received ?? 0, udpRejected: peer.fast?.stats.rejected ?? 0 } });
  }

  private rawSend(socket: TcpSocket, msg: LanMessage): void {
    if (socket.destroyed) return;
    const buf = encodeFrame(msg);
    if (NET_DELAY_MS > 0) setTimeout(() => { if (!socket.destroyed) socket.write(buf); }, NET_DELAY_MS);
    else socket.write(buf);
  }

  send(msg: LanMessage): void {
    const peer = this.peer;
    if (!peer) return;
    if (msg.t === 'start') {
      msg = { ...msg, epoch: msg.netcode === 'rollback-v2' ? randomUUID() : undefined };
      peer.fast?.begin(msg.epoch);
    }
    if (msg.t === 'recover' && msg.stage === 'commit') {
      msg = { ...msg, epoch: randomUUID() };
      peer.fast?.begin(msg.epoch);
    }
    if (msg.t === 'in') peer.fast?.send(msg);
    this.rawSend(peer.socket, msg);
  }

  /** Drop the peer link but keep hosting (between games / while waiting for a reconnect). */
  closePeer(): void {
    ++this.connectGeneration;
    this.cancelConnect?.();
    this.endPeer('closed');
  }

  shutdown(): void {
    this.stopDiscovery();
    this.stopHost();
    this.closePeer();
  }
}
