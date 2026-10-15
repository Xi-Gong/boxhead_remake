// LOCAL deviation START_WAVE_SELECTOR (v0.1.9): pick the starting wave (LEVEL n) before a game; the player starts
// with the capability the original's own difficulty head start would grant at that wave. NOT persisted: the choice
// resets to wave 1 every time the selection screen is entered ("didn't touch it = start from the beginning").
//
// Two states:
//   selected - what the selection screens show (reset on every CScreen_SelectWorld construction; Coop LAN setup
//              seeds it to 1);
//   armed    - the one-shot value a game start (local LoadLevel or LAN startLocalGame) hands to the
//              CUpgrades.SetDifficulty scope wrapper, which applies it at world build time - BEFORE tick 0, so both
//              lockstep peers compute it identically - and consumes it. Default 1 = exactly the original behaviour.
import { World } from '../packages.ts';

/**
 * Starting wave -> starting multiplier. Anchors = the original difficulty pairs of CUpgrades.SetDifficulty
 * (wave/multiplier: 1/1, 10/10, 20/30, 35/50), piecewise-linear between them, the last segment's slope (20/15)
 * extended beyond wave 35, floored, clamped to [1, 125] (the upgrade table's highest threshold).
 */
export function anchorInterp(wave: number): number {
  const w = Math.min(Math.max(Math.floor(wave), 1), 100);
  let m: number;
  if (w <= 10) m = w; // 1..10: slope 1
  else if (w <= 20) m = 10 + (w - 10) * 2; // 10..20: +2 per wave
  else m = 30 + (w - 20) * (20 / 15); // 20..35 and beyond: the last segment's slope
  return Math.min(Math.max(Math.floor(m), 1), 125);
}

let selected = 1;
let armed = 1;

/** The selection screens' cycler value (1..100, wrapping). Reset to 1 on every screen entry. */
export function getSelectedStartWave(): number { return selected; }
export function setSelectedStartWave(n: number): void { selected = Math.min(Math.max(Math.floor(n), 1), 100); }
export function cycleSelectedStartWave(delta: number): number {
  setSelectedStartWave(((selected - 1 + delta) % 100 + 100) % 100 + 1);
  return selected;
}
export function resetSelectedStartWave(): void { selected = 1; }

/** Hand the chosen wave to the SetDifficulty wrapper (called right before the world is built). */
export function armStartWave(n: number): void { armed = Math.min(Math.max(Math.floor(n), 1), 100); }

/** Take the armed wave (default 1 = original behaviour) and clear it. */
export function consumeArmedWave(): number {
  const w = armed;
  armed = 1;
  return w;
}

/**
 * Consume the armed wave and apply it to a just-difficulty-initialized CUpgrades. Mirrors SetDifficulty itself:
 * silent HUD, one __set__mLevel call (wave-table properties are per-index overwrites and nothing lives at build
 * time, so up and down are both a single call), then the multiplier stepped one index at a time so every crossed
 * threshold unlocks its tier - only ever upward (tiers are never revoked). Death Match ignores it (no waves);
 * the override is consumed either way.
 */
export function consumeArmedWaveOn(upgrades: any): void {
  const wave = consumeArmedWave();
  if (wave <= 1 || World.CWorld.mGameMode === 'DeathMatch') return;
  const hud = upgrades.mWorld?.mHud;
  const silent = hud?.mSilentMessages;
  if (hud) hud.mSilentMessages = true;
  try {
    if (upgrades.mLevelIndex !== wave) upgrades.__set__mLevel(wave);
    const target = Math.max(anchorInterp(wave), upgrades.mMultiplierIndex);
    while (upgrades.mMultiplierIndex < target) upgrades.__set__mMultiplier(upgrades.mMultiplierIndex + 1);
  } finally {
    if (hud) hud.mSilentMessages = silent === true;
  }
}

export function _resetForTests(): void {
  selected = 1;
  armed = 1;
}
