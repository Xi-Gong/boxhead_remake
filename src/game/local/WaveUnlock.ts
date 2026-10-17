// LOCAL wave-unlock bookkeeping (deviation START_WAVE_SELECTOR, v0.2.4): the historical highest wave the player has
// ENTERED, persisted in the game's own save (SharedObject "BXHD_2PLAY_6", member mMaxWaveReached - the local/
// Highscores.ts pattern: written only when it grows, immediate flush through SaveData()). The START WAVE cyclers
// wrap within [1..maxUnlockedWave()], so a fresh save is pinned at wave 1 (the campaign is fought up from the start)
// and the best-so-far can be jumped back to on any later session; the LAN setup cycler is capped by the HOST's value.
//
// Recorded on every run (local Single/Coop AND both LAN peers - each end writes its own save; the write is a
// synchronous storage put at the same deterministic sim event, no RNG / net traffic / checksum state, so lockstep is
// untouched) at two points, both inside scope.ts wrappers:
//   - every mid-run wave advance (CUpgrades.__set__mLevel, same mLoaded/!isSuppressing guard as the wave checkpoint);
//   - every world build (CWorld.InitFinished, right after recordRunStartWave) - starting AT wave N counts as
//     entering N (a LAN guest starting at the host's higher wave unlocks it locally).
import { CSaveData } from '../packages.ts';

export const SAVE_MEMBER = 'mMaxWaveReached';

/**
 * The highest wave ever entered (1..100; a fresh save = 1). Read from the save on EVERY call - deliberately no
 * module cache, so test-harness resets (resetProcessState wipes the SharedObject) and QA seeding need no
 * invalidation.
 */
export function maxUnlockedWave(): number {
  const v = CSaveData.mSharedObject?.data?.[SAVE_MEMBER];
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 1;
  return Math.min(Math.max(n, 1), 100);
}

/** Record that wave n was entered; writes + flushes ONLY when it grows (idempotent max). */
export function recordWaveReached(n: number): void {
  const w = Math.min(Math.max(Math.floor(n), 1), 100);
  if (w <= maxUnlockedWave()) return;
  const save = CSaveData._this;
  if (!save || !CSaveData.mSharedObject) return;
  CSaveData.mSharedObject.data[SAVE_MEMBER] = w;
  save.SaveData();
}
