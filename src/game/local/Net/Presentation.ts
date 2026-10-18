import { nowMs, withTimerValue } from '../../../engine/flash/clock.ts';
import { CMain, Thing } from '../../packages.ts';
import { predictCollide } from './Predict.ts';
import type { NetSession } from './NetSession.ts';

interface Pose { x: number; y: number; z: number }
const poses = (world: any): Map<any, Pose> => new Map(Object.values(world.mThing_Collection.mThings)
  .filter((t: any) => t?.mPosition).map((t: any) => [t, { x: t.mPosition.mX, y: t.mPosition.mY, z: t.mPosition.mZ }]));

/** Session-owned render history. Never supplies positions back to collision/AI or the snapshot engine. */
export class NetPresentation {
  external = false;
  private previous = new Map<any, Pose>();
  private current = new Map<any, Pose>();
  private tickAt = 0;
  private drawnTick = -1;
  private renderedAt = 0;
  private localDisplay: Pose | undefined;
  private offset = { x: 0, y: 0 };
  private camera: any;
  private brightnessFilters: any[] = [];
  advancing = false;
  get displayedLocal(): Readonly<Pose> | undefined { return this.localDisplay; }

  capture(world: any): void {
    this.previous = this.current;
    this.current = poses(world);
    this.tickAt = nowMs();
  }

  corrected(session: NetSession, world: any): void {
    const me: any = Object.values(world.mThing_Collection.mPlayerThings).find((p: any) => p?.mPlayerIndex === session.role);
    if (me && this.localDisplay) {
      const dx = this.localDisplay.x - me.mPosition.mX, dy = this.localDisplay.y - me.mPosition.mY;
      this.offset = Math.hypot(dx, dy) <= 1 && me.mStateID === 'State_PlayerControl' ? { x: dx, y: dy } : { x: 0, y: 0 };
    }
    this.current = poses(world);
    this.previous = this.current;
  }

  track(world: any, original: () => any): any {
    const previous = world.mTrackPosition, last = world.lTrackPosition;
    if (this.camera) world.mTrackPosition = world.lTrackPosition = this.camera;
    try { return original(); } finally { world.mTrackPosition = previous; world.lTrackPosition = last; }
  }

  brightness(world: any, original: () => any[]): any[] {
    if (this.advancing) this.brightnessFilters = original();
    return this.brightnessFilters;
  }

  draw(session: NetSession, world: any, original: () => void): void {
    const time = nowMs(), tickMs = 1000 / CMain.mFPS;
    const dt = this.renderedAt ? Math.max(0, Math.min(100, time - this.renderedAt)) : tickMs;
    this.renderedAt = time;
    const alpha = Math.max(0, Math.min(1, (time - this.tickAt) / tickMs));
    this.advancing = this.drawnTick !== world.mTick;
    this.drawnTick = world.mTick;
    const restore: (() => void)[] = [];
    this.offset.x *= Math.max(0, 1 - dt / 80);
    this.offset.y *= Math.max(0, 1 - dt / 80);
    for (const [thing, current] of this.current) {
      if (!world.mThing_Collection.mThings[thing.sUniqueID]) continue;
      const previous = this.previous.get(thing) ?? current;
      const position = thing.mPosition, alias = thing.mP;
      let x = current.x, y = current.y, z = current.z;
      if (thing.mPlayerIndex === session.role && thing.mStateID === 'State_PlayerControl') {
        const collide = world.mMap.mCollide, flag = collide.mCollideFlag;
        try {
          const p = predictCollide(collide, x, y, (thing.mDelta?.mX ?? 0) * alpha, (thing.mDelta?.mY ?? 0) * alpha, thing.mRadius);
          x = p.x; y = p.y;
        } finally { collide.mCollideFlag = flag; }
        x += this.offset.x; y += this.offset.y;
        this.localDisplay = { x, y, z };
        const target = new (Thing.Math as any).CThing_Position(x, y, z);
        const blend = 1 - Math.exp(-dt / 80);
        if (!this.camera || this.camera.Distance2D(target) > 2) this.camera = target;
        else this.camera = this.camera.Add(target.Subtract(this.camera).ScaleN(blend));
      } else if (Math.hypot(current.x - previous.x, current.y - previous.y) <= 1) {
        x = previous.x + (current.x - previous.x) * alpha;
        y = previous.y + (current.y - previous.y) * alpha;
        z = previous.z + (current.z - previous.z) * alpha;
      }
      thing.mPosition = new (Thing.Math as any).CThing_Position(x, y, z);
      if (alias === position) thing.mP = thing.mPosition;
      restore.push(() => { thing.mPosition = position; if (alias === position) thing.mP = alias; });
    }
    // HUD motion advances once per simulation tick; extra presentations cannot accelerate its timers.
    const hud = world.mHud, scores = hud.mScores, messages = hud.mMessages;
    if (!this.advancing) {
      const clone = (rows: any[]) => rows.map(row => ({ ...row, mPosition: row.mPosition?.clone(), mDelta: row.mDelta?.clone() }));
      hud.mScores = clone(scores); hud.mMessages = clone(messages);
      restore.push(() => { hud.mScores = scores; hud.mMessages = messages; });
    }
    try { withTimerValue(session.virtualNow(), original); }
    finally { for (let i = restore.length - 1; i >= 0; i--) restore[i]!(); this.advancing = false; }
  }
}
