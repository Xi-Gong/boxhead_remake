/** Original wave totals include enemies still waiting to spawn; the original LogKill reduces each total. */
export interface EnemyCounts { zombies: number; devils: number }
export function remainingEnemies(world: any): EnemyCounts {
  const level=world?.mUpgrades?.Level;
  const count=(value: unknown): number=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
  return {zombies:count(level?.Zombie_TotalCount),devils:count(level?.Devil_TotalCount)};
}
