import { _global, _root, flash } from '../../../engine/runtime.ts';
import { nowMs } from '../../../engine/flash/clock.ts';
import { World } from '../../packages.ts';
import { growthScoreTarget } from './GrowthHud.ts';
import { netSession } from './NetSession.ts';

export const SCORE_FLIGHT_MS = 900;
interface Flight { position: any; amount: number; owner: number; age: number; start?: { x: number; y: number }; bitmap?: any }
interface View { flights: Flight[]; at: number; paused: boolean; bitmaps: Map<number, { bitmap: any; users: number }> }
const views = new WeakMap<object, View>();
function view(hud: any): View {
  let state = views.get(hud);
  if (!state) views.set(hud, state = { flights: [], at: nowMs(), paused: false, bitmaps: new Map() });
  return state;
}
function advance(state: View): void {
  const time = nowMs(), delta = Math.max(0, time - state.at);
  if (!state.paused) for (const flight of state.flights) if (flight.start) flight.age += delta;
  state.at = time;
}

/** Called at the original AddScore point; simulation totals remain the caller's responsibility. */
export function recordGrowthScore(world: any, position: any, amount: number, owner: number, identity: string): boolean {
  const session = netSession();
  if (session && !session.rollbackV2) return false;
  const captured = position.Clone();
  const show = () => {
    if (_root._quality === 'LOW') return;
    const state = view(world.mHud);
    state.flights.push({ position: captured, amount, owner, age: 0 });
  };
  if (session) {
    if (session.soundRecordingTick !== undefined) session.scores.record(session.soundRecordingTick, owner, `kill:${identity}:${amount}`, show);
  } else show();
  return true;
}

function release(state: View, flight: Flight): void {
  if (!flight.bitmap) return;
  const cached = state.bitmaps.get(flight.amount)!;
  if (--cached.users === 0) { cached.bitmap.sBMD.dispose(); state.bitmaps.delete(flight.amount); }
}
function draw(hud: any): void {
  const state = views.get(hud);
  if (!state) return;
  advance(state);
  if (state.paused || _global.mRecordMode) return;
  const { x: width, y: height } = hud.mWorld.mScreenSize;
  for (let i = state.flights.length - 1; i >= 0; i--) {
    const flight = state.flights[i]!;
    if (flight.age >= SCORE_FLIGHT_MS) { release(state, flight); state.flights.splice(i, 1); continue; }
    const target = growthScoreTarget(hud, flight.owner);
    if (!target) continue;
    if (!flight.start) {
      const from = hud.mWorld.GetScreenPosition(flight.position);
      flight.start = { x: from.x / width, y: from.y / height };
      let cached = state.bitmaps.get(flight.amount);
      if (!cached) {
        World.CHud.mcScore.tfAmount.text = '+' + flight.amount;
        cached = { bitmap: World.CHud.RenderMovieClipAsBitmapObject(World.CHud.mcScore), users: 0 };
        state.bitmaps.set(flight.amount, cached);
      }
      cached.users++; flight.bitmap = cached.bitmap;
    }
    const t = flight.age / SCORE_FLIGHT_MS, ease = t * t * (3 - 2 * t);
    const x = flight.start.x * width * (1 - ease) + target.x * ease;
    const y = flight.start.y * height * (1 - ease) + target.y * ease;
    // Authored score art has its own origin; land its visual centre in the actual score field.
    const bm = flight.bitmap;
    hud.DrawBMObject(bm, new flash.geom.Point(x - bm.mDisp.x - bm.sBMD.width / 2,
      y - bm.mDisp.y - bm.sBMD.height / 2), t < .8 ? 100 : (1 - t) * 500);
  }
}
function clear(hud: any): void {
  const state = views.get(hud);
  if (state) for (const { bitmap } of state.bitmaps.values()) bitmap.sBMD.dispose();
  views.delete(hud);
}

export function installFloatingScores(): void {
  const proto = World.CHud.prototype as any, originalDraw = proto.Draw, pause = proto.Pause, dispose = proto.Dispose;
  proto.Draw = function(this: any, ...args: any[]): any {
    const result = originalDraw.apply(this, args); draw(this); return result;
  };
  proto.Pause = function(this: any, on: any): any {
    const state = views.get(this);
    if (state) { advance(state); state.paused = !!on; }
    return pause.call(this, on);
  };
  proto.Dispose = function(this: any): any { clear(this); return dispose.call(this); };
}
