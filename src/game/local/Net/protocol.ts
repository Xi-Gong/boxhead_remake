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

/**
 * Lockstep input delay in ticks for a measured link (v0.1.7). The input frame for tick T is sampled right after
 * tick T-D ran and must arrive within D ticks (D * tickMs); the wire distance is ONE way (~ RTT/2 + the renderer
 * IPC hops), so half the WORST recently sampled heartbeat RTT plus a fixed margin covers jitter and path
 * asymmetry. Smaller than v0.1.4's full-RTT formula (which also paid a built-in extra tick of index slack): a
 * 60-100 ms virtual-LAN link lands at D=2-3 instead of 3-4. gameSpeed follows GameConfig (0 slow / 1 normal /
 * 2 fast -> 80 / 40 / 20 ms ticks), so fast games scale the tick count up.
 */
export function computeInputDelay(rttSamples: readonly number[] | undefined, gameSpeed: number): number {
  if (!rttSamples || rttSamples.length === 0) return LAN_INPUT_DELAY;
  const tickMs = 1000 / (25 * (gameSpeed === 0 ? 0.5 : gameSpeed));
  const worst = Math.max(...rttSamples);
  return Math.max(1, Math.min(8, Math.ceil((worst / 2 + 35) / tickMs)));
}

export type LanMode = 'Coop' | 'DeathMatch';
export type LanRole = 0 | 1; // 0 = host (player 1), 1 = client (player 2)

/**
 * The host's setup-screen selection (v0.1.4): mode, BOTH characters, the level and the options that shape the run.
 * Authored on the host's net setup screen, mirrored to the client on every change (`setup`), and finalized in the
 * `start` message (level -> roomLink, options -> GameConfig).
 */
export interface SetupSelection {
  mode: LanMode;
  /** Player 1 (host) character 0..3 (SWAT, BOND, GI JOE, BAMBO; cosmetic only). */
  charP1: number;
  /** Player 2 (client) character 0..3. */
  charP2: number;
  /** 0-based level index (0..17) - every mode uses the 18 ROOM_Single_00XX rooms. */
  levelIdx: number;
  /** 0..3 difficulty. */
  difficulty: number;
  /** 0..3 index into the Death Match kill limits [5,10,20,50]. */
  gameAmount: number;
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
  charP1: number; // host's character (0..3), picked on the net setup screen (cosmetic only)
  charP2: number; // client's character (0..3), picked on the net setup screen (cosmetic only)
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
  // host -> client: (back) in the room view (also right after a successful connect; sent after backing out of
  // the setup screen so the client mirrors the return).
  | { t: 'lobby' }
  // client -> host: the client player's ready flag in the room (the host's START is gated on it).
  | { t: 'ready'; ready: boolean }
  // host -> client: enter / mirror the net setup screen with the host's current selection (sent on entry and on
  // every host-side change; the client renders it read-only).
  | { t: 'setup'; sel: SetupSelection }
  // host -> client: build the world and enter lockstep. `resumeTick` set = rebuild from that net checkpoint
  // (reconnect inside the 30 s window, or a later 续局 continuation) instead of a fresh start. `snap` carries the
  // checkpoint itself when the client reported none (a crashed and restarted client has lost its in-memory copy).
  // `inputDelay` = lockstep input delay in ticks (the host picks it from the worst recent RTT samples via
  // computeInputDelay; default LAN_INPUT_DELAY when absent).
  | { t: 'start'; mode: LanMode; roomLink: string; cfg: GameConfig; seed: number; inputDelay?: number; resumeTick?: number; snap?: unknown }
  // both -> both: this peer's player input bitmap for `tick` (bit order = NetSlot.SLOT_ORDER: UP, DOWN, LEFT,
  // RIGHT, FIRE, NEXT_WEAPON, PREV_WEAPON), checksum piggybacked every LAN_CHECKSUM_EVERY ticks.
  | { t: 'in'; tick: number; bits: number; sum?: LanChecksum }
  // both -> both, echoed back once (`echo` marks the reply; RTT probe + liveness).
  | { t: 'hb'; ts: number; echo?: true }
  // both -> both: orderly exit. 'quit' = left the lobby; 'forfeit' = conceded. `via` says why a forfeit happened
  // ('timeout' = the 30 s reconnect window ran out; 'concede' = the pause-screen QUIT) so both peers route to the
  // same end screen (timeout -> main menu, concede -> the regular Debrief/Winner screens).
  | { t: 'leave'; reason: 'quit' | 'forfeit'; via?: 'timeout' | 'concede' }
  // informational divergence report (each side already acts on its own checksum mismatch).
  | { t: 'desync'; tick: number; mine: string; theirs: string };

/** One UDP beacon (host -> broadcast, once per second). */
export interface BeaconMsg {
  magic: string;
  proto: number;
  app: string;
  name: string;
  status: 'lobby' | 'playing';
  /** 1 = waiting for player 2, 2 = room full (v0.1.4; older beacons without it read as 1). */
  players: 1 | 2;
  port: number;
}

/** A host as shown in the join list (beacon + the datagram's source address). */
export interface HostInfo {
  ip: string;
  name: string;
  app: string;
  status: 'lobby' | 'playing';
  players: 1 | 2;
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
  return {
    magic: b.magic, proto: b.proto, app: String(b.app ?? ''), name: String(b.name ?? '?'),
    status: b.status, players: b.players === 2 ? 2 : 1, port: b.port,
  };
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
