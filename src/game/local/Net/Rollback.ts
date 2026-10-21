// Rollback (v0.2.3 §E): session-side prediction bookkeeping, the correction executor and the sound queue for
// GGPO-style rollback on top of the WorldSnap engine. The NetSession owns the state; these functions operate
// on it (kept out of NetSession.ts for clarity). See the rollback design doc for the full flow:
//   Snapshots belong to PRE-tick boundaries. A correction restores the earliest divergent boundary and
//   replaces every later snapshot. Empty map cells retain navigation state, too (v0.2.7).
//   beginTick resolves a tick's inputs to 'confirmed' | 'predicted' | 'stall' (NetSession);
//   predicted ticks run direct world.Process() with the sound choke point QUEUING their samples;
//   a late remote frame that differs from the prediction sets correctionPending, and the next wrapper tick
//   restores the newest ring slot before the divergence and REPLAYS to the head with true inputs - replayed
//   ticks are confirmed, their sounds pass straight through, dropped predicted-tick sounds are re-emitted
//   identically by the replay (same RNG => same sounds).
import { CMain, CSound } from '../../packages.ts';
import { LAN_CHECKSUM_EVERY, PREDICT_MAX_LAG_TICKS, ROLLBACK_WINDOW_TICKS } from './protocol.ts';
import { captureWorldSnap, restoreWorldSnap, type RingSlot, type SnapCtx } from './WorldSnap.ts';

/** Per executed tick: the remote bits used, whether they were a prediction, and recomputable artifacts. */
export interface TickMeta { remoteBits: number; predicted: boolean; sum?: string; endState?: string }
export interface SoundCall { item: any; secOffset?: any; nLoop?: any }

/**
 * A remote input frame arrived. (a) If that tick was already EXECUTED with different bits, this is a
 * divergence: remember the FIRST such tick (the correction restores to just before it). (b) Advance the
 * confirm frontier over the contiguous run of received frames. (c) Flush queued sounds of ticks that just
 * became confirmed (in tick order) unless a correction is pending - the replay will re-emit theirs.
 */
export function onRemoteFrame(session: any, tick: number, bits: number): void {
  session.peerReady = true; // the peer's world is up and its frame numbering is aligned (NetSession.peerReady)
  const meta: TickMeta | undefined = session.tickMeta.get(tick);
  if (meta && meta.remoteBits !== bits && (session.correctionPending === undefined || tick < session.correctionPending)) {
    session.correctionPending = tick;
  }
  const before = session.confirmTick;
  while (session.remoteFrames.has(session.confirmTick + 1)) session.confirmTick++;
  session.lastRemoteBits = bits;
  if (session.rollbackV2) return; // v2 commits side effects only after correction at a simulation boundary.
  // A predicted game end whose tick just CONFIRMED without divergence was real: re-apply the latch so the
  // next confirmed tick routes it (6.2). A correction pending instead discards the replayed reality anyway.
  if (session.correctionPending === undefined) {
    for (let t = before + 1; t <= session.confirmTick; t++) {
      const m: TickMeta | undefined = session.tickMeta.get(t);
      if (m?.endState !== undefined && session.world && session.world.mCompleteState === undefined) {
        session.world.mCompleteState = m.endState;
      }
    }
    flushConfirmedSounds(session);
  }
}

/** Resolve tick u's remote bits: the true frame if it landed, else the repeat-last prediction. */
export function predictedRemoteBits(session: any, tick: number): number {
  const exact = session.remoteFrames.get(tick);
  if (exact !== undefined) return exact;
  let newest = -1;
  let bits = 0;
  for (const [t, value] of session.remoteFrames as Map<number, number>) {
    if (t < tick && t > newest) { newest = t; bits = value; }
  }
  return bits;
}

/** True when tick u may execute on prediction (not yet confirmed, within the depth bound). */
export function mayPredict(session: any, tick: number): boolean {
  return tick - session.confirmTick <= (session.predictionLimit ?? PREDICT_MAX_LAG_TICKS);
}

// ------------------------------------------------------------------------------------------- sound queue

/** Queue one sample start fired during a predicted/replayed tick (NetScope's CSound choke point). */
export function queueSound(session: any, call: SoundCall): void {
  const t = session.soundRecordingTick;
  if (t === undefined) return;
  let q = session.pendingSounds.get(t);
  if (!q) session.pendingSounds.set(t, (q = []));
  q.push(call);
}

function flushConfirmedSounds(session: any): void {
  for (const t of [...session.pendingSounds.keys()].sort((a, b) => a - b)) {
    if (t > session.confirmTick) continue;
    for (const c of session.pendingSounds.get(t)!) {
      // The public path: through the SOUND SINGLETON's instance method - exactly what a sample clip's fPlay
      // closure does (pClass.PlaySound(item)) - so outer hooks (the fxkit canary wraps the instance) observe
      // the flushed call, and the NetScope prototype wrapper beneath it passes it through (no recording flag).
      const snd = (CSound as any).mSound ?? (CSound.prototype as any);
      snd.PlaySound(c.item, c.secOffset, c.nLoop);
    }
    session.pendingSounds.delete(t);
  }
}

// ------------------------------------------------------------------------------------------- ring + corrections

/** Capture before this tick's inputs are applied, on both live and replay paths. */
export function pushSlot(session: any, world: any): void {
  const ctx: SnapCtx = session.snapCtx;
  const tRel = world.mTick - session.startTick;
  const slot: RingSlot = { tRel, data: captureWorldSnap(world, ctx, !session.rollbackV2), instances: ctx.instances, sharedObjs: ctx.sharedObjs };
  const index = tRel % (ROLLBACK_WINDOW_TICKS + 1);
  releaseSlot(session.ring[index]);
  session.ring[index] = slot;
}

function releaseSlot(slot: RingSlot | undefined): void {
  const floor = slot?.data.floor;
  if (floor) slot!.sharedObjs[floor.sharedIdx]?.dispose();
}

export function resetRollback(session: any): void {
  session.peerReady = false; // per-game: the peer's first frame re-arms it
  for (const slot of session.ring ?? []) releaseSlot(slot);
  session.ring = [];
  session.tickMeta = new Map();
  session.pendingSounds = new Map();
  session.correctionPending = undefined;
  session.confirmTick = -1;
  session.lastRemoteBits = 0;
  session.soundRecordingTick = undefined;
  session.rollbackStats = { predictions: 0, corrections: 0, replayedTicks: 0, maxDepth: 0, captureMs: 0 };
}

/**
 * A correction is pending: restore the newest ring slot from BEFORE the first divergent tick and replay to
 * the head with true inputs. Replay ticks resolve inputs exactly like beginTick does (true frame if present,
 * else repeat-last), so a correction can land while later frames are still in flight. Sounds of replayed
 * ticks pass straight through (recording flag set, but the design flushes on CONFIRM - see below); sounds
 * queued for the dropped predicted ticks are discarded and re-emitted by the replay itself.
 */
export function applyCorrections(session: any, world: any): number {
  const c = session.correctionPending;
  if (c === undefined) return 0;
  const traceStart = session.responseTrace?.enabled ? performance.now() : undefined;
  session.correctionPending = undefined;
  const head = world.mTick - session.startTick; // the tick about to execute
  // Ring slots are pushed in afterTick, AFTER mTick incremented: slot.tRel is the index of the NEXT tick to
  // execute at capture time. The newest slot with tRel <= min(c, head) is the latest state from which
  // replaying reaches the head through ticks <= c with true inputs.
  let slot: RingSlot | undefined;
  for (let t = Math.min(c, head); t >= 0; t--) {
    const s = session.ring[t % (ROLLBACK_WINDOW_TICKS + 1)];
    if (s && s.tRel === t) { slot = s; break; }
  }
  if (!slot) {
    // No slot before the divergence (ancient divergence - beyond the window): treat as desync-grade stall;
    // the wrapper's stall path takes over next tick. Should not happen (window guard in beginTick).
    session.correctionPending = c;
    session.stall('peer');
    return 0;
  }
  for (const t of [...session.pendingSounds.keys()]) if (t >= slot.tRel) session.pendingSounds.delete(t);
  restoreWorldSnap(world, slot, session.snapCtx);
  for (let i = 0; i < session.ring.length; i++) {
    if (session.ring[i]?.tRel >= slot.tRel) {
      releaseSlot(session.ring[i]);
      session.ring[i] = undefined;
    }
  }
  const stats = session.rollbackStats;
  stats.corrections++;
  let replayed = 0;
  // Replay from the slot's next tick up to (excluding) the head; the head tick then executes through the
  // wrapper's normal beginTick path (true inputs, natural routing, live sounds).
  for (let u = slot.tRel; u < head; u++) {
    replayTick(session, world, u);
    replayed++;
    if (session.rollbackV2 && world.mCompleteState) {
      session.truncateFuture(session.tickIndex(world));
      break;
    }
  }
  stats.replayedTicks += replayed;
  const depth = head - slot.tRel;
  if (depth > stats.maxDepth) stats.maxDepth = depth;
  // The head tick's beginTick must see the virtual clock exactly as the original timeline would have:
  // head ticks executed => virtualTimeMs = head * tickMs (afterTick-equivalent advance).
  session.virtualTimeMs = session.tickIndex(world) * (1000 / CMain.mFPS);
  if (session.rollbackV2) session.presentation.corrected(session, world);
  if (traceStart !== undefined) session.responseTrace.record('replay', head, session.role,
    { from: slot.tRel, ticks: replayed, ms: performance.now() - traceStart });
  return replayed;
}

/** One replayed tick: virtual clock, inputs through the exact applyPlayer path, direct world.Process. */
function replayTick(session: any, world: any, u: number): void {
  pushSlot(session, world);
  session.virtualTimeMs = u * (1000 / CMain.mFPS);
  const bits0 = session.localFrames.get(u) ?? 0;
  const bits1 = predictedRemoteBits(session, u);
  session.applyPlayer(session.role, bits0, u);
  session.applyPlayer(1 - session.role, bits1, u);
  if (session.rollbackV2) {
    session.tickMeta.set(u, { remoteBits: bits1, predicted: !session.remoteFrames.has(u),remoteWeaponCommands:session.remoteWeaponCommands?.get(u) });
    session.executeWorldStep(world, u);
    return;
  }
  session.soundRecordingTick = u;
  try {
    world.Process();
  } finally {
    session.soundRecordingTick = undefined;
  }
  // Re-record the meta (the bits ACTUALLY used - a replayed tick may itself still be a prediction for
  // frames in flight) and the checksum; a wave checkpoint re-captures only on non-predicted ticks.
  const meta: TickMeta = session.tickMeta.get(u) ?? { remoteBits: bits1, predicted: false };
  meta.remoteBits = bits1;
  meta.predicted = !session.remoteFrames.has(u);
  session.tickMeta.set(u, meta);
  if (u > 0 && u % LAN_CHECKSUM_EVERY === 0) meta.sum = session.computeChecksumString(world, u);
  if (!meta.predicted) session.maybeCheckpoint(world, u);
}
