// Lane Q: scripted input bots for the headless harness. A bot only presses its player's keys (P1 arrows + '/' + ',' '.',
// P2 WASD + Space + Q E, digits in Single) — it never touches game objects. Per world tick it:
//   - flees (moves away) when the nearest enemy is closer than `fleeDist`;
//   - fires when it faces the enemy on the 8-direction grid and the enemy is near that line (non-auto weapons get a
//     press/release cycle, grenades are held `grenadeHold` ticks and released, auto weapons are held);
//   - otherwise steps one tick towards the enemy direction (turns the player: the angle follows the move delta);
//   - every `cycleEvery` ticks cycles weapons (NEXT / PREV on release, or a digit key in Single when `digits`).
// Enemies: zombies and devils (Single / Coop), the other player (Death Match).
import { Thing, World } from '../../src/game/packages.ts';
import { KEYS, playerList, thingList, type HeadlessGame, type PlayerKeys } from './harness.ts';

export interface BotOptions {
  fleeDist?: number;
  /** Ticks between weapon changes (0 = never). */
  cycleEvery?: number;
  /** Single only: select weapons with the digit keys instead of NEXT/PREV. */
  digits?: boolean;
  grenadeHold?: number;
  /** Stand still (no movement keys) — a punching bag for death / game-over tests. */
  passive?: boolean;
  /** Random-ish wander when no enemy (deterministic: derived from the tick). */
  wander?: boolean;
}

const DIR_KEYS = (k: PlayerKeys, d: number): number[] => {
  // 0 = east, clockwise (y down): E SE S SW W NW N NE
  const dx = [1, 1, 0, -1, -1, -1, 0, 1][d & 7]!;
  const dy = [0, 1, 1, 1, 0, -1, -1, -1][d & 7]!;
  const out: number[] = [];
  if (dx > 0) out.push(k.RIGHT);
  if (dx < 0) out.push(k.LEFT);
  if (dy > 0) out.push(k.DOWN);
  if (dy < 0) out.push(k.UP);
  return out;
};

const S2 = Math.SQRT1_2;
/** Unit vectors of the 8 directions (0 = east, clockwise, y down). */
const UNIT: [number, number][] = [[1, 0], [S2, S2], [0, 1], [-S2, S2], [-1, 0], [-S2, -S2], [0, -1], [S2, -S2]];
const GUN_FWD = 0.6;
const GUN_SIDE = 0.33;

const dirOf = (dx: number, dy: number): number => Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7;

export class Bot {
  readonly index: number;
  readonly keys: PlayerKeys;
  readonly opts: Required<BotOptions>;
  private fireDown = false;
  private hold = 0;
  private cycleCount = 0;
  private cyclePhase = 0;
  private digitIndex = 0;
  shots = 0;

  constructor(index: number, opts: BotOptions = {}) {
    this.index = index;
    this.keys = index === 0 ? KEYS.P1 : KEYS.P2;
    this.opts = { fleeDist: 1.4, cycleEvery: 0, digits: false, grenadeHold: 10, passive: false, wander: true, ...opts };
  }

  /** Every key this bot may press. */
  managed(): number[] {
    const k = this.keys;
    const list: number[] = [k.UP, k.DOWN, k.LEFT, k.RIGHT, k.FIRE, k.NEXT, k.PREV];
    if (this.opts.digits) list.push(...KEYS.DIGIT);
    return list;
  }

  /** Keys to hold during the next world tick. */
  decide(game: HeadlessGame): number[] {
    const w = game.world();
    const k = this.keys;
    const me = playerList(w).find((p) => p.mPlayerIndex === this.index);
    if (!me || this.opts.passive) return [];
    if (me.mFlags & Thing.CThing.mFlag_DEAD || me.mStateID !== 'State_PlayerControl') {
      this.fireDown = false;
      this.hold = 0;
      return [];
    }
    const out: number[] = [];
    // weapon cycling (switch happens on key release)
    if (this.opts.cycleEvery > 0) {
      if (this.cyclePhase > 0) {
        this.cyclePhase--;
        if (this.cyclePhase === 1) {
          if (this.opts.digits && game.mode === 'Single') {
            this.digitIndex = (this.digitIndex + 1) % 10;
            out.push(KEYS.DIGIT[(this.digitIndex + 1) % 10]!); // weapon i has key (i + 1) % 10
          } else {
            out.push((this.cycleCount & 1) ? k.PREV : k.NEXT);
          }
          return out;
        }
      } else if (++this.cycleCount % this.opts.cycleEvery === 0) {
        this.cyclePhase = 2;
      }
    }
    const target = this.nearestEnemy(game, me);
    const weapon = me.mWeapon_Current;
    if (!target) {
      this.fireDown = false;
      if (this.opts.wander && w.mTick % 40 < 10) out.push(...DIR_KEYS(k, (w.mTick / 40 + this.index * 3) & 7));
      return out;
    }
    const dx = target.mPosition.mX - me.mPosition.mX;
    const dy = target.mPosition.mY - me.mPosition.mY;
    const dist = Math.hypot(dx, dy);
    const facing = me.mAngle.__get__mDirection();
    // The gun is held in the right hand: a bullet starts GUN_FWD ahead and GUN_SIDE to the right of the player
    // (CThing_Creature_Player.GetWeaponPosition, XSI GunPosition_Right). Pick the 8-direction whose bullet line
    // passes within ALIGN of the target; otherwise strafe so that the row/column of the gun meets the target.
    const ALIGN = 0.3;
    const px = me.mPosition.mX, py = me.mPosition.mY;
    const moved = Math.hypot(px - this.lastX, py - this.lastY) > 0.02;
    this.lastX = px; this.lastY = py;
    // a movement attempt that did not move the player (cornered / blocked): stop dodging, fight for a while
    if (this.moving && !moved) this.fightTicks = 30;
    this.moving = false;
    if (this.fightTicks > 0) this.fightTicks--;
    let shootDir = -1;
    let bestPerp = Infinity;
    for (let d = 0; d < 8; d++) {
      const [fx, fy] = UNIT[d]!;
      const [rx, ry] = UNIT[(d + 2) & 7]!;
      const gx = px + fx * GUN_FWD + rx * GUN_SIDE, gy = py + fy * GUN_FWD + ry * GUN_SIDE;
      const tx = target.mPosition.mX - gx, ty = target.mPosition.mY - gy;
      const along = tx * fx + ty * fy;
      const perp = Math.abs(tx * rx + ty * ry);
      if (along > -0.2 && perp < ALIGN && perp < bestPerp) { bestPerp = perp; shootDir = d; }
    }
    if (shootDir < 0 && this.fightTicks > 0 && dist < 3) shootDir = dirOf(dx, dy); // point blank, roughly aimed
    // gun line offsets of the 4 straight directions: E: y + SIDE, S: x - SIDE, W: y - SIDE, N: x + SIDE
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const strafe: number[] = [];
    if (ax >= ay) {
      const want = target.mPosition.mY - (dx > 0 ? GUN_SIDE : -GUN_SIDE) - py; // shoot E/W: move the gun row
      if (Math.abs(want) > 0.08) strafe.push(want > 0 ? k.DOWN : k.UP);
    } else {
      const want = target.mPosition.mX - (dy > 0 ? -GUN_SIDE : GUN_SIDE) - px; // shoot S/N: move the gun column
      if (Math.abs(want) > 0.08) strafe.push(want > 0 ? k.RIGHT : k.LEFT);
    }
    if (shootDir >= 0 && facing === shootDir && dist < 7.5) {
      if (weapon?.mOnRelease) {
        // grenade: hold, then release to throw
        if (++this.hold <= this.opts.grenadeHold) out.push(k.FIRE);
        else this.hold = 0;
      } else if (weapon?.mAuto) {
        out.push(k.FIRE);
      } else {
        this.fireDown = !this.fireDown;
        if (this.fireDown) out.push(k.FIRE);
      }
      this.shots++;
      return out;
    }
    // flee from a close enemy we cannot shoot yet, unless fleeing does not move the player (cornered: fight)
    if (dist < this.opts.fleeDist && game.mode !== 'DeathMatch' && this.fightTicks <= 0) {
      this.moving = true;
      this.fireDown = false;
      this.hold = 0;
      out.push(...DIR_KEYS(k, dirOf(dx, dy) + 4));
      return out;
    }
    if (shootDir >= 0 && dist < 7.5) {
      // one tick towards the target turns the player (the angle follows the move delta)
      this.fireDown = false;
      this.hold = 0;
      out.push(...DIR_KEYS(k, shootDir));
      return out;
    }
    this.fireDown = false;
    this.hold = 0;
    this.moving = true;
    if (shootDir >= 0) out.push(...DIR_KEYS(k, shootDir)); // on a line but too far: close in
    else if (strafe.length) out.push(...strafe);
    else out.push(...DIR_KEYS(k, dirOf(dx, dy))); // on the gun line already: turn towards it
    return out;
  }

  private target: any;
  private lastX = NaN;
  private lastY = NaN;
  private moving = false;
  private fightTicks = 0;

  private nearestEnemy(game: HeadlessGame, me: any): any {
    const w = game.world();
    let best: any;
    let bd = Infinity;
    const DEAD = Thing.CThing.mFlag_DEAD;
    const list = game.mode === 'DeathMatch'
      ? playerList(w).filter((p) => p !== me && p.mStateID === 'State_PlayerControl')
      : thingList(w).filter((t) => (t._CLASSID_ === 'CThing_Creature_Zombie' || t._CLASSID_ === 'CThing_Creature_Devil') && t.mStateID !== 'State_EnterMap');
    for (const t of list) {
      if (t.mFlags & DEAD) continue;
      const d = Math.hypot(t.mPosition.mX - me.mPosition.mX, t.mPosition.mY - me.mPosition.mY);
      if (d < bd) { bd = d; best = t; }
    }
    // stick to the current target unless a much closer one shows up (no flip-flopping between two)
    const cur = this.target;
    if (cur && best && cur !== best && list.includes(cur) && !(cur.mFlags & DEAD)) {
      const dc = Math.hypot(cur.mPosition.mX - me.mPosition.mX, cur.mPosition.mY - me.mPosition.mY);
      if (dc < bd * 1.5 + 0.5) best = cur;
    }
    this.target = best;
    return best;
  }
}

/**
 * Run the bots for `ticks` world ticks (or until the world is gone / `until` returns true). Each world tick: every
 * bot decides its keys, then the game runs enterFrames until the world ticked once. `onTick` runs after each tick.
 */
export function runBots(game: HeadlessGame, bots: Bot[], ticks: number, onTick?: (tick: number) => boolean | void): number {
  let done = 0;
  for (; done < ticks; done++) {
    const w = game.world();
    if (!w || game.state() !== 'State_RunWorld') break;
    for (const b of bots) game.setKeys(b.decide(game), b.managed());
    if (game.tick(1) === 0) break;
    if (onTick?.(done) === true) { done++; break; }
  }
  return done;
}

export { World };

/**
 * Walk player `index` to the cell (x, y) by holding direction keys (8-direction steering; when blocked for a few ticks
 * it side-steps for a while). Returns true when the player stands in that cell.
 */
export function walkTo(game: HeadlessGame, index: number, x: number, y: number, maxTicks = 600): boolean {
  const k = index === 0 ? KEYS.P1 : KEYS.P2;
  const managed = [k.UP, k.DOWN, k.LEFT, k.RIGHT];
  let lastX = NaN, lastY = NaN, stuck = 0, side = 0;
  for (let i = 0; i < maxTicks; i++) {
    const me = playerList(game.world()).find((p) => p.mPlayerIndex === index);
    if (!me) return false;
    const px = me.mPosition.mX, py = me.mPosition.mY;
    if (Math.floor(px) === Math.floor(x) && Math.floor(py) === Math.floor(y)) { game.setKeys([], managed); return true; }
    if (Math.hypot(px - lastX, py - lastY) < 0.01) stuck++; else stuck = 0;
    lastX = px; lastY = py;
    if (stuck > 3) { side = 12; stuck = 0; }
    const dx = x - px, dy = y - py;
    let d = dirOf(dx, dy);
    if (side > 0) { side--; d = (d + 2) & 7; }
    game.setKeys(DIR_KEYS(k, d), managed);
    if (game.tick(1) === 0) return false;
  }
  game.setKeys([], managed);
  return false;
}
