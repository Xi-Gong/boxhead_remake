// LAN multiplayer wire protocol (deviation LAN_MULTIPLAYER, v0.1.3). Pure TypeScript, no Electron / node imports:
// shared by the Electron MAIN process transport (electron/lan.ts), the renderer NetSession and the unit tests.
//
//   transport : TCP (node:net) with 4-byte little-endian length-prefixed JSON frames (this file's framing);
//               one host, one client. Host = player 1, client = player 2.
//   discovery : UDP datagrams (one JSON beacon per second, host -> per-interface directed broadcast);
//               manual IPv4 entry is the fallback when broadcast does not cross a subnet.
//   liveness  : application-level heartbeat every 1 s (both directions echo `hb`); a link is declared dead after
//               3.5 s of silence - a TCP half-open failure can take 15-20 s to surface on its own.
//
// The game itself runs deterministic lockstep (see NetSession.ts): each tick both peers exchange only their own
// player's 7-bit input bitmap; `sum` (a cheap state checksum) rides along every LAN_CHECKSUM_EVERY ticks to detect
// divergence.
export const LAN_PROTOCOL_VERSION = 1;
/** UDP beacon magic - datagrams without it are ignored. */
export const LAN_MAGIC = 'BXHD2P:LAN1';
/** UDP port the JOINING side listens on for host beacons. */
export const LAN_DISCOVERY_PORT = 47630;
/** Host TCP listener port range (first free port wins; manual-IP join scans the whole range). */
export const LAN_TCP_PORT_FIRST = 47631;
export const LAN_TCP_PORT_LAST = 47640;
/** Hard cap for one framed TCP message. */
export const LAN_FRAME_MAX = 1 << 16;
export const LAN_HEARTBEAT_MS = 1000;
export const LAN_LINK_DEAD_MS = 3500;
/** A discovered host disappears from the list after this much beacon silence. */
export const LAN_HOST_STALE_MS = 3200;
export const LAN_CHECKSUM_EVERY = 50;
/** Lockstep input delay in ticks (LAN RTT is far below one 40 ms tick). */
export const LAN_INPUT_DELAY = 1;

export type LanMode = 'Coop' | 'DeathMatch';
export type LanRole = 0 | 1; // 0 = host (player 1), 1 = client (player 2)

/** Host configuration shown in the lobby; pushed to the client whenever it changes. */
export interface LobbyConfig {
  mode: LanMode;
  /** 0-based room index (0..17). */
  roomIdx: number;
  /** 0..3 difficulty. */
  difficulty: number;
  /** 0..3 index into the Death Match kill limits [5,10,20,50]. */
  killsIdx: number;
}

/** The CSaveData fields the host's StartGame imposes on the client (they shape the simulation; see PARITY §9). */
export interface GameConfig {
  difficulty: number;
  gameSpeed: number; // 0 slow / 1 normal / 2 fast - CMain.mFPS = 25 * (0.5, 1, 2), read by sim code
  devils: boolean;
  collisions: boolean;
  damage: boolean;
  gameAmount: number; // 0..3 index into [5,10,20,50]
  detail: boolean; // LOW quality changes the zombie cap and bullet-spark RNG gate
  charP2: number; // client's character (0..3), chosen in the lobby
}

/** Cheap divergence checksum (quantised); exchanged every LAN_CHECKSUM_EVERY ticks. */
export interface LanChecksum {
  tick: number;
  score: number;
  things: number;
  zombies: number;
  /** [p1x, p1y, p1life, p2x, p2y, p2life] quantised (floor(v * 16)). */
  q: number[];
}

export type LanMessage =
  // client -> host, first frame on the wire (transport-level handshake; main process replies `welcome`).
  | { t: 'hello'; proto: number; app: string; name: string; sid?: string; char: number; capTick?: number }
  // host -> client handshake reply. `ok:false` + reason closes the connection (version mismatch, busy).
  | { t: 'welcome'; ok: boolean; reason?: string; proto: number; app: string; name: string; sid: string }
  // host -> client: current lobby configuration (also right after a successful connect).
  | { t: 'lobby'; cfg: LobbyConfig }
  // host -> client: build the world and enter lockstep. `resumeTick` set = rebuild from that net checkpoint
  // (reconnect inside the 30 s window, or a later 续局 continuation) instead of a fresh start.
  | { t: 'start'; mode: LanMode; roomLink: string; cfg: GameConfig; seed: number; resumeTick?: number }
  // both -> both: this peer's player input bitmap for `tick` (bit 0 UP, 1 DOWN, 2 LEFT, 3 RIGHT, 4 FIRE,
  // 5 NEXT_WEAPON, 6 PREV_WEAPON), checksum piggybacked every LAN_CHECKSUM_EVERY ticks.
  | { t: 'in'; tick: number; bits: number; sum?: LanChecksum }
  // both -> both, echoed back once (`echo` marks the reply; RTT probe + liveness).
  | { t: 'hb'; ts: number; echo?: true }
  // both -> both: orderly exit. 'quit' = left the lobby; 'forfeit' = conceded after a link-loss timeout.
  | { t: 'leave'; reason: 'quit' | 'forfeit' }
  // informational divergence report (each side already acts on its own checksum mismatch).
  | { t: 'desync'; tick: number; mine: string; theirs: string };

/** One UDP beacon (host -> broadcast, once per second). */
export interface BeaconMsg {
  magic: string;
  proto: number;
  app: string;
  name: string;
  status: 'lobby' | 'playing';
  port: number;
}

/** A host as shown in the join list (beacon + the datagram's source address). */
export interface HostInfo {
  ip: string;
  name: string;
  app: string;
  status: 'lobby' | 'playing';
  port: number;
  lastSeen: number;
}

// ---------------------------------------------------------------------------------------------- TCP framing

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Encode one message as a length-prefixed frame. */
export function encodeFrame(msg: unknown): Uint8Array {
  const body = encoder.encode(JSON.stringify(msg));
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, true);
  out.set(body, 4);
  return out;
}

/** Incremental frame parser: push socket chunks, get complete messages back. Throws on oversize/broken frames. */
export class FrameDecoder {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength);
    const msgs: unknown[] = [];
    let off = 0;
    for (;;) {
      if (merged.length - off < 4) break;
      const len = view.getUint32(off, true);
      if (len > LAN_FRAME_MAX) {
        this.buf = new Uint8Array(0);
        throw new Error(`LAN frame too large (${len})`);
      }
      if (merged.length - off < 4 + len) break;
      const body = merged.subarray(off + 4, off + 4 + len);
      off += 4 + len;
      msgs.push(JSON.parse(decoder.decode(body)));
    }
    this.buf = off === 0 ? merged : merged.slice(off);
    return msgs;
  }
}

// ---------------------------------------------------------------------------------------------- UDP beacons

export function encodeBeacon(b: Omit<BeaconMsg, 'magic' | 'proto'> & Partial<BeaconMsg>): string {
  return JSON.stringify({ magic: LAN_MAGIC, proto: LAN_PROTOCOL_VERSION, ...b });
}

/** Parse a datagram; null when it is not one of ours (wrong magic / bad JSON / foreign protocol). */
export function decodeBeacon(text: string): BeaconMsg | null {
  let b: any;
  try { b = JSON.parse(text); } catch { return null; }
  if (!b || b.magic !== LAN_MAGIC || b.proto !== LAN_PROTOCOL_VERSION || typeof b.port !== 'number') return null;
  if (b.status !== 'lobby' && b.status !== 'playing') return null;
  return { magic: b.magic, proto: b.proto, app: String(b.app ?? ''), name: String(b.name ?? '?'), status: b.status, port: b.port };
}

// ---------------------------------------------------------------------------------------------- liveness

/**
 * Pure link watchdog: the transport feeds `heard()` on every incoming message and ticks its timer with `check(now)`;
 * after LAN_LINK_DEAD_MS of silence the link is declared dead once. Kept pure so the tests can drive a fake clock.
 */
export class LinkWatchdog {
  private lastHeard: number;
  private dead = false;
  private readonly now: () => number;
  private readonly deadAfter: number;

  constructor(now: () => number = Date.now, deadAfter: number = LAN_LINK_DEAD_MS) {
    this.now = now;
    this.deadAfter = deadAfter;
    this.lastHeard = now();
  }

  heard(): void {
    this.lastHeard = this.now();
    this.dead = false;
  }

  /** Returns true exactly once when the link has gone silent. */
  check(): boolean {
    if (this.dead) return false;
    if (this.now() - this.lastHeard >= this.deadAfter) {
      this.dead = true;
      return true;
    }
    return false;
  }
}
