// GROWING_SURVIVAL: immutable per-world capability; all mutable vitals live on snapshot-owned players.
export const SURVIVAL_RULE = 'survival-v1';
const worlds = new WeakSet<object>();
export function setSurvivalEnabled(world: object, enabled: boolean): void {
  if (enabled) worlds.add(world); else worlds.delete(world);
}
export function survivalEnabled(world: any): boolean { return worlds.has(world); }
export function playerMaximum(player: any): number {
  const growth=player.mWorld?.mUpgrades?.lanGrowth?.players[player.mPlayerIndex];
  const level=growth?.level??1;
  return 200 + 4 * (Math.max(1, growth?.endless?level:Math.min(125,level)) - 1);
}
export function syncVitals(player: any, mode: 'full' | 'restore' | 'level'): void {
  if (!survivalEnabled(player.mWorld)) return;
  const max = playerMaximum(player), previous = player.mMaxLife ?? 200;
  player.mMaxLife = max;
  if (mode === 'full') player.mLife = max;
  else if (mode === 'level' && player.mLife > 0) player.mLife = Math.min(max, player.mLife + max - previous);
}
export function settleVitals(world: any, restored: boolean): void {
  if (!survivalEnabled(world)) return;
  for (const player of Object.values(world.mThing_Collection.mPlayerThings)) syncVitals(player, restored ? 'restore' : 'full');
}
