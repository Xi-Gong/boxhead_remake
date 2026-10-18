import { CMain, Thing, World } from '../packages.ts';
import { netSession } from './Net/NetSession.ts';
import { playerSource } from './Net/Growth.ts';
import { savedSwitch } from './Net/RoomSettings.ts';

const enabled = new WeakSet<object>();
export function installFriendlyFire(): void {
  const world = World.CWorld.prototype as any, ready = world.InitFinished;
  world.InitFinished = function(this: any): any {
    const session = netSession(), cfg = session?.startOpts?.cfg;
    if (World.CWorld.mGameMode === 'Coop' && (session ? cfg?.teamPass === 'team-pass-v1' && !cfg.damage : !savedSwitch(CMain.mSaveData?.mDamageActive))) enabled.add(this);
    return ready.call(this);
  };
  // Preserve original geometry, traversal order, wall hits and seeded effects. Only player-owned
  // line queries temporarily omit player affect masks; movement collision and enemy queries are untouched.
  for (const [proto, name] of [[World.Map.CMap_Collide.prototype,'Collide_Line'],[World.Map.CMap_Affect.prototype,'Affect_Line']] as const) {
    const previous = (proto as any)[name];
    (proto as any)[name] = function(this: any, source: any, ...args: any[]): any {
      const w = this.mMap.mWorld;
      if (!enabled.has(w) || playerSource(source) === undefined) return previous.call(this, source, ...args);
      const restore: (() => void)[] = [];
      for (const player of Object.values(w.mThing_Collection.mPlayerThings) as any[]) {
        if (!player) continue;
        const own = Object.getOwnPropertyDescriptor(player,'mAffectFlags');
        player.mAffectFlags = 0;
        restore.push(() => { if (own) Object.defineProperty(player,'mAffectFlags',own); else delete player.mAffectFlags; });
      }
      try { return previous.call(this,source,...args); } finally { for (const reset of restore) reset(); }
    };
  }
}
