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
/**
 * v0.2.3 rollback: the RING size (how far back a correction can restore), in ticks (D4; Rollback.ts).
 */
export const ROLLBACK_WINDOW_TICKS = 16;
/**
 * v0.2.3 rollback: how many ticks ahead of the confirmed frontier PREDICTION may run. SHIPPED AT 0: on
 * real async links every tested depth (1..8) showed a small persistent-state drift between the peers by the
 * 2nd-4th checksum tick (player x off by 1-3/16 cell - see PARITY R10+). The full prediction+rollback
 * machinery (WorldSnap/Rollback/ring/sound queue) ships READY but idle; the adaptive input delay D (one
 * tick better than v0.1.7 at every class) + the v0.2.1 display shadow carry the experience, and a stall
 * never costs a cadence slot. Depth is a one-constant change once the replay drift is fixed.
 */
export const PREDICT_MAX_LAG_TICKS = 0;
/** Lockstep input delay in ticks (LAN RTT is far below one 40 ms tick). */
export const LAN_INPUT_DELAY = 1;

/**
 * Lockstep input delay in ticks for a measured link (v0.1.7; statistic hardened in v0.2.1). The input frame for
 * tick T is sampled right after tick T-D ran and must arrive within D ticks (D * tickMs); the wire distance is
 * ONE way (~ RTT/2 + the renderer IPC hops), so half the p90 of the recently sampled heartbeat RTTs plus a fixed
 * margin covers jitter and path asymmetry. v0.2.1: p90 instead of the raw worst - the lobby samples for minutes,
 * and a SINGLE pre-START heartbeat hiccup (renderer GC, a busy EF) used to add +1..2 D for an entire game; with
 * a 20-sample window p90 drops the worst two outliers, while small windows still resolve to the max (nothing to
 * drop yet - every pinned band below is unchanged). gameSpeed follows GameConfig (0 slow / 1 normal / 2 fast ->
 * 80 / 40 / 20 ms ticks), so fast games scale the tick count up.
 */
export function computeInputDelay(rttSamples: readonly number[] | undefined, gameSpeed: number): number {
  if (!rttSamples || rttSamples.length === 0) return LAN_INPUT_DELAY;
  const tickMs = 1000 / (25 * (gameSpeed === 0 ? 0.5 : gameSpeed));
  const sorted = [...rttSamples].sort((a, b) => a - b);
  const ref = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)];
  return Math.max(1, Math.min(8, Math.ceil((ref / 2 + 35) / tickMs)));
}

/** v0.2.1 L1: the largest schedule debt (in ticks) a net stall may bank before slots are surrendered for good. */
export const MAX_NET_CATCHUP_TICKS = 3;

/**
 * v0.2.1 L1 bounded stall catch-up. When the lockstep gate skips a tick (a peer frame is late), CMain.ProcessFrames
 * has ALREADY consumed that tick's 40 ms time slice - before v0.2.1 the slot was simply lost (dropped ticks were
 * never caught up: every late frame was a visible hole in the 25 fps cadence). This hands the just-consumed slice
 * back so the schedule retries the SAME tick as soon as the frame lands, while clamping the debt (now - slice) at
 * maxDebtTicks so a long starvation cannot bank an unbounded fast-forward burst. Pure: the net State_RunWorld
 * wrapper applies it to mTimeSlice whenever a playing-phase tick stalls (reconnect/desync freezes are excluded -
 * those phases must freeze truly).
 */
export function netStallRewind(sliceMs: number | undefined, nowMs: number, tickMs: number, maxDebtTicks: number): number | undefined {
  if (sliceMs === undefined || sliceMs > nowMs) return sliceMs; // never started / schedule ahead of now: untouched
  return Math.max(sliceMs - tickMs, nowMs - maxDebtTicks * tickMs);
}

export type LanMode = 'Coop' | 'DeathMatch';
export type LanRole = 0 | 1; // 0 = host (player 1), 1 = client (player 2)
export interface RoomSettings { gameSpeed: number; devils: boolean; collisions: boolean; damage: boolean }

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
  /** START_WAVE_SELECTOR (v0.1.9): chosen starting wave 1..maxWave (Coop only on the setup screen; the choice itself is never persisted - every setup entry starts at wave 1). */
  wave: number;
  /** START_WAVE_SELECTOR (v0.2.4): the HOST's historical highest wave ever entered (WaveUnlock) - the setup cycler's cap, shown as BEST on both setup screens. Host-authored; absent (older peer) = uncapped. */
  maxWave?: number;
  settings?: RoomSettings;
}

/** The CSaveData fields the host's StartGame imposes on the client (they shape the simulation; see PARITY §9). */
export interface GameConfig {
  /** Unlimited personal progression and stat-scaled bounded wave budgets; requires modern PvE rules. */
  endless?: 'endless-pve-v1';
  timedWaves?: 'timed-waves-v1';
  waveDraft?: 'wave-draft-v1';
  bossWaves?: 'boss-waves-v1';
  variants?: 'enemy-variants-v1';
  /** Weapon enchantment survives replenishment until empty; requires enemy variants. */
  enchantment?: 'persistent-enchantment-v1';
  /** Preserve inherited weapon capacity and synchronize supply eligibility; requires modern loot. */
  refill?: 'reliable-supplies-v1';
  /** Player-owned shots skip teammates in cooperative games; old peers keep original hit selection. */
  teamPass?: 'team-pass-v1';
  /** Optional, enabled only after the joining peer advertises the same growth rules. */
  progression?: 'personal-growth-v1';
  /** Optional PvE armor/ammunition loot rules; absent peers retain the original simulation. */
  supplies?: 'armor-ammo-v1';
  /** Level-scaled health/armor and protected enemy-hit resilience; requires growth and supplies. */
  survival?: 'survival-v1';
  /** Permanent three-way devil supplies and scheduled/red-box rewards; requires modern survival. */
  loot?: 'supply-crates-v2';
  /** Optional difficulty/growth curve; requires personal growth and supply capabilities. */
  balance?: 'pve-balance-v1';
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
  /** v2 exact gameplay sections; legacy quantised fields remain unchanged. */
  full?: Record<string, string>;
}

export type LanMessage =
  | { t: 'input-gap'; need: number }
  | { t: 'recover'; stage: 'offer' | 'ready' | 'commit' | 'reject'; generation: number; seed: number; need: number; head: number; epoch?: string }
  | { t: 'pause-request'; paused: boolean }
  | { t: 'pause-barrier'; stage: 'freeze' | 'ready' | 'commit' | 'resume'; id: number; tick: number }
  | { t: 'input-path'; version: 1; port: number; token: string }
  // client -> host, first frame on the wire (transport-level handshake; main process replies `welcome`).
  | { t: 'hello'; proto: number; app: string; name: string; sid?: string; char: number; capTick?: number; netcodes?: string[]; features?: string[] }
  // host -> client handshake reply. `ok:false` + reason closes the connection (version mismatch, busy).
  | { t: 'welcome'; ok: boolean; reason?: string; proto: number; app: string; name: string; sid: string }
  // host -> client: (back) in the room view (also right after a successful connect; sent after backing out of
  // the setup screen so the client mirrors the return).
  | { t: 'lobby'; sel?: SetupSelection }
  // client -> host: the client player's ready flag in the room (the host's START is gated on it).
  | { t: 'ready'; ready: boolean }
  // host -> client: enter / mirror the net setup screen with the host's current selection (sent on entry and on
  // every host-side change; the client renders it read-only).
  | { t: 'setup'; sel: SetupSelection }
  // host -> client: build the world and enter lockstep. `resumeTick` set = rebuild from that net checkpoint
  // (reconnect inside the 30 s window, or a later 续局 continuation) instead of a fresh start. `snap` carries the
  // checkpoint itself when the client reported none (a crashed and restarted client has lost its in-memory copy).
  // `inputDelay` = lockstep input delay in ticks (the host picks it from the worst recent RTT samples via
  // computeInputDelay; default LAN_INPUT_DELAY when absent). `rollback` (v0.2.3) = prediction+rollback mode:
  // the peer may execute a tick with a PREDICTED remote bitmap and re-simulate when the true frame lands (see
  // Rollback.ts); with it set the host pins inputDelay 1 (LAN_INPUT_DELAY).
  | { t: 'start'; mode: LanMode; roomLink: string; cfg: GameConfig; seed: number; inputDelay?: number; resumeTick?: number; wave?: number; snap?: unknown; rollback?: boolean; netcode?: 'rollback-v2'; epoch?: string }
  // both -> both: this peer's player input bitmap for `tick` (bit order = NetSlot.SLOT_ORDER: UP, DOWN, LEFT,
  // RIGHT, FIRE, NEXT_WEAPON, PREV_WEAPON), checksum piggybacked every LAN_CHECKSUM_EVERY ticks.
  | { t: 'in'; tick: number; bits: number; sum?: LanChecksum }
  // both -> both, echoed back once (`echo` marks the reply; RTT probe + liveness).
  | { t: 'hb'; ts: number; echo?: true; rttMs?: number }
  // both -> both: orderly exit. 'quit' = left the lobby; 'forfeit' = conceded. `via` says why a forfeit happened
  // ('timeout' = the 30 s reconnect window ran out; 'concede' = the pause-screen QUIT) so both peers route to the
  // same end screen (timeout -> main menu, concede -> the regular Debrief/Winner screens).
  | { t: 'leave'; reason: 'quit' | 'forfeit'; via?: 'timeout' | 'concede' }
  // client -> host, v0.2.1: the client pressed RETRY (Debrief screen / room strip). The host drives the
  // coordinated restart through the normal 'start' path (checkpoint resume, else a fresh run at the failed wave).
  | { t: 'retry' }
  // informational divergence report (each side already acts on its own checksum mismatch).
  | { t: 'desync'; tick?: number; mine?: string; theirs?: string }
  // both -> both, v0.2.3: pause state sync. Either side's P key freezes BOTH peers on the same lockstep tick
  // with the identical original PAUSED! overlay; either side may resume. TCP ordering keeps these with the
  // input frames, so the freeze/continue ticks line up on both peers.
  | { t: 'pause' }
  | { t: 'unpause' };

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

  constructor(now: () => number = () => performance.now(), deadAfter: number = LAN_LINK_DEAD_MS) {
    this.now = now;
    this.deadAfter = deadAfter;
    this.lastHeard = now();
  }

  heard(): void {
    this.lastHeard = this.now();
    this.dead = false;
  }
  get silenceMs(): number { return Math.max(0, this.now() - this.lastHeard); }

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
