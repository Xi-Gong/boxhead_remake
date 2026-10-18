// GROWING_SURVIVAL: keep the port's affect order/damage path; suppress only a protected enemy hit's reaction.
import { Thing } from '../packages.ts';
import { survivalEnabled } from './SurvivalRules.ts';
const fields = ['mStateCount', 'mDelta', 'mHitAngle'] as const;
interface Reaction { fields: (PropertyDescriptor | undefined)[]; angle: number }
interface Batch { pending?: Reaction; lethal: boolean }
// Synchronous call scope only: never survives ProcessAffects or enters rollback snapshots.
const batches = new WeakMap<object, Batch>();
export function protectEnemyHit(victim: any, affect: any, shield: number): void {
  const batch = batches.get(victim);
  if (!batch || shield <= 0 || victim.mLife <= 0 || !survivalEnabled(victim.mWorld)) return;
  const type = affect.mType, A = Thing.Affect.CThing_Affect;
  if (type !== A.mAffect_ZombieAttack && type !== A.mAffect_DevilAttack && type !== A.mAffect_FireBall) return;
  batch.pending = { fields: fields.map(key => Object.getOwnPropertyDescriptor(victim,key)), angle: victim.mAngle.mRadians };
}
export function installShieldResilience(): void {
  const player = Thing.Creature.CThing_Creature_Player.prototype as any;
  const process = player.ProcessAffects, setState = player.SetState;
  player.ProcessAffects = function(this: any): any {
    if (!survivalEnabled(this.mWorld)) return process.call(this);
    const batch: Batch = { lethal: false }; batches.set(this,batch);
    try {
      const result = process.call(this);
      // PlayerControl has no death check; a fatal protected hit must enter the normal death state after the batch.
      if (batch.lethal && this.mLife <= 0) this.CheckForDead();
      return result;
    } finally { batches.delete(this); }
  };
  player.SetState = function(this: any, state: any): any {
    const batch = batches.get(this), saved = batch?.pending;
    if (saved && (state === 'State_BulletHit' || state === 'State_ZombieHit')) {
      batch!.pending = undefined;
      fields.forEach((key,i) => {
        const descriptor = saved.fields[i];
        if (descriptor) Object.defineProperty(this,key,descriptor); else delete this[key];
      });
      this.mAngle.mRadians = saved.angle;
      batch!.lethal ||= this.mLife <= 0;
      return;
    }
    return setState.call(this,state);
  };
}
