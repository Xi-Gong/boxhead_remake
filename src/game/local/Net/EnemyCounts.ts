/** Original wave totals include enemies still waiting to spawn; the original LogKill reduces each total. */
export interface EnemyCounts { zombies: number; devils: number }
export function remainingEnemies(world: any): EnemyCounts {
  const level=world?.mUpgrades?.Level;
  const count=(value: unknown): number=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
  if(!world?.mUpgrades?.timedWave)return {zombies:count(level?.Zombie_TotalCount),devils:count(level?.Devil_TotalCount)};
  if(world.mUpgrades.timedWave.phase==='draft')return {zombies:0,devils:0};
  const c=world.mUpgrades.timedWave.clear;
  if(c)return {zombies:count(c.zombies-c.killedZombies),devils:count(c.devils-c.killedDevils)};
  // Bosses share DEVIL in the HUD, while their original family counters continue driving skills/spawn caps.
  const boss=world.mUpgrades.timedWave.boss,members=boss?.members??(boss?[boss]:[]);
  const chargers=members.filter((m:any)=>{
    const e=world.mThing_Collection?.mThings[m.id];
    return (m.kind==='charger'||m.kind==='zombie')&&e?.Process&&e.mLife>0&&!e.lanKillLogged;
  }).length;
  return {zombies:Math.max(0,count(level?.mZombieCount)-chargers),devils:count(level?.mDevilCount)+chargers};
}
