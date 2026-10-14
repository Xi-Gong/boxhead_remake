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
}

export class LanTransport {
  private readonly identity: string; // proto/app build string both sides must share
  private readonly hostName: string;
  private eventCb: ((e: LanEvent) => void) | undefined;
  private messageCb: ((msg: LanMessage) => void) | undefined;

  // discovery (join side)
  private discoverSock: UdpSocket | undefined;
  private hosts = new Map<string, HostInfo>();
  private pruneTimer: NodeJS.Timeout | undefined;

  // hosting
  private server: Server | undefined;
  private serverPort = 0;
  private beaconSock: UdpSocket | undefined;
  private beaconTimer: NodeJS.Timeout | undefined;
  private beaconStatus: 'lobby' | 'playing' = 'lobby';

  // peer link (either side)
  private peer: Peer | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private readonly linkDeadMs: number;

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
      const fail = (err: Error): void => { this.discoverSock = undefined; reject(err); };
      sock.once('error', fail);
      sock.bind(LAN_DISCOVERY_PORT, () => {
        sock.off('error', fail);
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
    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [k, h] of this.hosts) if (now - h.lastSeen > LAN_HOST_STALE_MS) { this.hosts.delete(k); changed = true; }
      if (changed) this.emitHosts();
    }, 1000);
    this.emitHosts();
  }

  stopDiscovery(): void {
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
    this.beaconStatus = status;
    const server = createServer((socket) => this.onServerConnection(socket));
    let port = LAN_TCP_PORT_FIRST;
    for (;; port++) {
      if (port > LAN_TCP_PORT_LAST) throw new Error('no free LAN port (47631-47640 all in use)');
      // NOTE: the 'error' handler must resolve false - resolve(err) would be a truthy "success" (bit us once).
      const ok = await new Promise<boolean>((resolve) => {
        const onErr = (): void => { server.off('error', onErr); resolve(false); };
        server.once('error', onErr);
        server.listen({ port, host: '0.0.0.0' }, () => { server.off('error', onErr); resolve(true); });
      });
      if (ok) break;
    }
    this.server = server;
    this.serverPort = port;
    this.beaconSock = createSocket({ type: 'udp4' });
    this.beaconTimer = setInterval(() => this.sendBeacon(), LAN_HEARTBEAT_MS);
    this.sendBeacon();
    return port;
  }

  setHostStatus(status: 'lobby' | 'playing'): void {
    this.beaconStatus = status;
    this.sendBeacon();
  }

  private beaconBody(): Omit<BeaconMsg, 'magic' | 'proto'> {
    return { app: this.identity, name: this.hostName, status: this.beaconStatus, players: this.hasPeer ? 2 : 1, port: this.serverPort };
  }

  private sendBeacon(): void {
    if (!this.beaconSock) return;
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
    for (const target of targets) this.beaconSock.send(payload, LAN_DISCOVERY_PORT, target);
  }

  stopHost(): void {
    this.closePeer();
    if (this.beaconTimer) { clearInterval(this.beaconTimer); this.beaconTimer = undefined; }
    if (this.beaconSock) { this.beaconSock.close(); this.beaconSock = undefined; }
    if (this.server) {
      const s = this.server;
      this.server = undefined;
      s.close();
    }
  }

  private onServerConnection(socket: TcpSocket): void {
    // Exactly one peer. A second connection is answered with welcome ok:false 'busy' after its hello.
    socket.setNoDelay(true);
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
    const ports = port ? [port] : Array.from({ length: LAN_TCP_PORT_LAST - LAN_TCP_PORT_FIRST + 1 }, (_, i) => LAN_TCP_PORT_FIRST + i);
    let lastReason = 'no-answer';
    for (const p of ports) {
      const r = await this.connectOne(ip, p, hello);
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
        socket.destroy();
        resolve(r);
      };
      const socket = tcpConnect({ host: ip, port });
      socket.setNoDelay(true);
      socket.setTimeout(1500); // per-port patience; a closed port refuses instantly, a filtered one times out
      const decoder = new FrameDecoder();
      socket.on('connect', () => {
        this.rawSend(socket, { t: 'hello', proto: LAN_PROTOCOL_VERSION, app: this.identity, name: hello.name, sid: hello.sid, char: hello.char, capTick: hello.capTick });
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
    peer.watchdog.heard();
    for (const m of msgs) {
      const msg = m as LanMessage;
      if (msg?.t === 'hb') {
        // Echo the peer's probe; our own returning echo is surfaced so the renderer can compute RTT (now - ts).
        if (!msg.echo) this.rawSend(peer.socket, { ...msg, echo: true });
        else this.fire(msg);
        continue;
      }
      this.fire(msg);
    }
  }

  /** Install the long-lived peer: message forwarding, heartbeat, watchdog. */
  private attachPeer(socket: TcpSocket, decoder: FrameDecoder): void {
    const peer: Peer = { socket, decoder, watchdog: new LinkWatchdog(undefined, this.linkDeadMs) };
    this.peer = peer;
    socket.setTimeout(0);
    // The pre-handshake handlers of the connecting side are spent; only their side effects remain (guarded no-ops).
    socket.removeAllListeners('data');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
    socket.removeAllListeners('timeout');
    socket.on('data', (chunk: Buffer) => {
      let msgs: unknown[];
      try { msgs = peer.decoder.push(chunk); } catch { this.endPeer('protocol'); return; }
      this.handlePeerMessages(peer, msgs);
    });
    socket.on('error', () => this.endPeer('error'));
    socket.on('close', () => this.endPeer('closed'));
    this.heartbeatTimer = setInterval(() => {
      if (this.peer !== peer) return;
      this.rawSend(socket, { t: 'hb', ts: Date.now() });
      if (peer.watchdog.check()) this.endPeer('lost');
    }, LAN_HEARTBEAT_MS);
    this.emit({ kind: 'peer', connected: true });
  }

  private endPeer(reason: string): void {
    const peer = this.peer;
    if (!peer) return;
    this.peer = undefined;
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined; }
    peer.socket.destroy();
    this.emit({ kind: 'peer', connected: false, reason });
  }

  private rawSend(socket: TcpSocket, msg: LanMessage): void {
    if (socket.destroyed) return;
    socket.write(encodeFrame(msg));
  }

  send(msg: LanMessage): void {
    if (this.peer) this.rawSend(this.peer.socket, msg);
  }

  /** Drop the peer link but keep hosting (between games / while waiting for a reconnect). */
  closePeer(): void {
    this.endPeer('closed');
  }

  shutdown(): void {
    this.stopDiscovery();
    this.stopHost();
    this.closePeer();
  }
}
