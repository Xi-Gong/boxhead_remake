// Local-player display prediction (v0.2.1 L3, deviation LAN_MULTIPLAYER). The lockstep sim stays authoritative
// and byte-identical on both peers; this module only computes where the LOCAL player will be D-1 ticks from now,
// so the draw layer can render them at zero perceived input latency - like a local game. The lead is legitimate:
// afterTick has ALREADY sampled and stored the local input frames for those ticks (the wire is only ever waiting
// on the PEER), so the prediction replays known information.
//
// HARD CONSTRAINTS (netlockstep tests pin them):
//   - RNG-neutral: math + map reads only (the player Draw path and CThing_Angle.__set__mDelta are pure);
//   - never mutates sim state: the thing-vs-thing push (CMap_Collide.Collide_Mapwho) is deliberately NOT
//     replicated - it writes mCollidedWithID on real things and would diverge per machine. The push it would
//     predict is exactly what reconciliation absorbs (snap on >1 cell divergence, ease below);
//   - draw-layer only: the Draw wrapper swaps mPosition/mAngle around the original call and restores them, and
//     the camera wrapper biases the tracking anchor for the duration of Process_Tracking (which runs at DRAW
//     time, from Draw_PlayerPlane - mDrawPosition and lTrackPosition are render state, not checksummed).
import { Thing, World } from '../../packages.ts';
import { unpackBit } from './NetSlot.ts';
import type { NetSession } from './NetSession.ts';

export interface ShadowState {
  /** Predicted cell position of the local player, `lead` ticks ahead of the authoritative sim. */
  x: number;
  y: number;
  /** Facing: the last non-zero INPUT movement delta (the original keeps it across idle ticks too). */
  dx: number;
  dy: number;
  /** False outside State_PlayerControl (bullet hit / dying / respawn): draw at the sim position. */
  valid: boolean;
  /** How often reconciliation had to SNAP (divergence > 1 cell: teleports, pushes the prediction cannot know). */
  corrections: number;
  /** Last pre-blend reconciliation divergence, in pixels (observability). */
  lastDivergencePx: number;
  /** The prediction made for the NEXT tick (the first lead step): what auth(t+1) gets compared against. */
  predX: number;
  predY: number;
}

export function newShadow(): ShadowState {
  return { x: 0, y: 0, dx: 1, dy: 0, valid: false, corrections: 0, lastDivergencePx: 0, predX: 0, predY: 0 };
}

/** Both players sorted by index (the checksum's accessor pattern). */
export function playersOf(world: any): any[] {
  const tc = world.mThing_Collection;
  return (Object.keys(tc.mPlayerThings).map((k) => tc.mPlayerThings[k]).filter((p: any) => p != undefined) as any[])
    .sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
}

/**
 * CMap_Collide.PlayerCollide minus the thing-vs-thing push: the static-impassable current-cell guard, then the
 * original 3-iteration wall slide via the real Collide_Map with the player radius (0.85x). Collide_Map is
 * read-only (QCollide_Map only gathers cell refs); mCollideFlag is the helper's own scratch, written by the real
 * PlayerCollide every tick as well.
 */
export function predictCollide(collide: any, x: number, y: number, dX: number, dY: number, radius: number): { x: number; y: number } {
  if (collide.mCells[y & 65535]?.[x & 65535]?.mCollide & World.Map.CMap_Cell.mCollide_StaticImpassable) {
    return { x, y };
  }
  const p = new Thing.Math.CThing_Position(x, y, 0);
  const d = new Thing.Math.CThing_Position(dX, dY, 0);
  let out = p;
  for (let i = 3; i; i--) {
    collide.mCollideFlag = false;
    out = collide.Collide_Map(p, d, radius * 0.85);
    if (!collide.mCollideFlag) break;
  }
  return { x: out.mX, y: out.mY };
}

/**
 * Called at the very end of NetSession.afterTick: reconcile the tick that just ran against the prediction made
 * FOR it (not against the leading display value - the authoritative sim legitimately lags the shadow by `lead`
 * ticks; comparing those two would fight the lead), then re-lead D-1 ticks from the reconciled base.
 */
export function advanceShadow(session: NetSession, world: any): void {
  const s = session.shadow;
  const players = playersOf(world);
  const me = players[session.role];
  if (!me || me.mStateID !== 'State_PlayerControl') {
    s.valid = false; // respawn / bullet-hit knockback / dying: the sim position is the truth, draw it
    return;
  }
  const ax = me.mPosition.mX;
  const ay = me.mPosition.mY;
  const lead = Math.max(0, session.inputDelay - 1);
  // Reconcile: the prediction stored last advance was for THIS tick.
  let bx = ax;
  let by = ay;
  if (s.valid && lead > 0) {
    const div = Math.hypot(s.predX - ax, s.predY - ay);
    s.lastDivergencePx = div * World.Map.CMap_Cell.mSize.x;
    if (div > 1.0) {
      s.corrections++; // a push/teleport the prediction cannot know about: snap, never chase
    } else if (div > 0.01) {
      bx = ax + (s.predX - ax) / 2; // small drift (thing pushes): keep half the error so the display eases
      by = ay + (s.predY - ay) / 2;
    }
  }
  // Lead: replay the next D-1 ticks with the local input frames that are already sampled.
  let { dx, dy } = s;
  let x = bx;
  let y = by;
  const t = session.tickIndex(world);
  for (let u = t + 1; u <= t + lead; u++) {
    const bits = session.peekLocalBits(u);
    if (bits === undefined) break; // frame not sampled yet (cannot happen right after afterTick; belt only)
    const dirX = unpackBit(bits, 'LEFT') ? -1 : unpackBit(bits, 'RIGHT') ? 1 : 0;
    const dirY = unpackBit(bits, 'UP') ? -1 : unpackBit(bits, 'DOWN') ? 1 : 0;
    let dX = dirX * me.mSpeed;
    let dY = dirY * me.mSpeed;
    if (dirX || dirY) {
      dx = dX; // facing follows the raw INPUT delta
      dy = dY;
    }
    // LAN removes the shared-screen tether (NetScope KeepDistance wrapper). The display predictor must
    // follow that same movement contract; retaining the offline clamp caused lag/jitter when peers split up.
    const next = predictCollide(world.mMap.mCollide, x, y, dX, dY, me.mRadius);
    x = next.x;
    y = next.y;
    if (u === t + 1) {
      s.predX = x; // the prediction for the NEXT tick (what its reconciliation compares against)
      s.predY = y;
    }
  }
  if (lead === 0) {
    s.predX = bx; // nothing to predict at D=1: the next comparison is against a standing base
    s.predY = by;
  }
  s.x = x;
  s.y = y;
  s.dx = dx;
  s.dy = dy;
  s.valid = true;
}

/** Non-null only for the LOCAL player while in control of a live game: where to draw them instead of mPosition. */
export function shadowDrawOverride(session: NetSession | null, player: any): { x: number; y: number; dx: number; dy: number } | null {
  if (!session || session.phase !== 'playing' || session.netPaused) return null;
  const s = session.shadow;
  const world = session.currentWorld();
  if (!s?.valid || !player || player.mWorld !== world) return null;
  if (player !== playersOf(world)[session.role]) return null;
  return { x: s.x, y: s.y, dx: s.dx, dy: s.dy };
}

/**
 * The full (shadow - authoritative) delta in cells, for the draw-time camera bias. During a lockstep stall the
 * shadow is frozen with the world (advanceShadow only runs on executed ticks), so the bias stays put and the
 * frozen frame stays self-consistent; reconnect/desync phases drop the bias (the override above too).
 */
export function cameraBias(session: NetSession | null, world: any): { dx: number; dy: number } | null {
  if (!session || session.phase !== 'playing' || session.netPaused) return null;
  const s = session.shadow;
  if (!s?.valid || world !== session.currentWorld()) return null;
  const me = playersOf(world)[session.role];
  if (!me || me.mStateID !== 'State_PlayerControl') return null;
  return { dx: s.x - me.mPosition.mX, dy: s.y - me.mPosition.mY };
}
