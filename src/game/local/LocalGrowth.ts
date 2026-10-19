// LOCAL_PERSONAL_GROWTH: the LAN simulation's personal progression, without a network session.
import { CMain, World } from '../packages.ts';
import { balancedStartLevel, difficultyIndex, DIFFICULTY_START_WAVES } from './BalanceRules.ts';
import { grantGrowthLoadout, growthOf, MAX_LEVEL, newGrowth } from './Net/Growth.ts';
import { netActive } from './Net/NetSession.ts';
import { settleVitals } from './SurvivalRules.ts';
import { endlessWorld } from './Endless.ts';
import { endlessStartLevel } from './EndlessRules.ts';

const classicFixtures = new WeakSet<object>();
/** Explicit oracle fixture; never exposed in player settings or saves. */
export function setClassicGrowthFixture(main: object): void { classicFixtures.add(main); }
export function classicGrowthFixture(main:object):boolean{return classicFixtures.has(main);}
export function localGrowthEnabled(): boolean {
  return !netActive() && World.CWorld.mGameMode !== 'DeathMatch' && !classicFixtures.has(CMain._this);
}

/** Called AFTER an old save has restored its original upgrades, inventory and health. */
export function initializeLocalGrowth(world: any, restored: boolean): void {
  if (!localGrowthEnabled()) return;
  const existing=growthOf(world),endless=endlessWorld(world);
  if(existing){if(endless)for(const p of existing.players)p.endless=true;return;}
  const upgrades = world.mUpgrades, single = World.CWorld.mGameMode === 'Single';
  const difficulty = difficultyIndex(CMain.mSaveData.__get__mDifficulty());
  const wave = Math.max(upgrades.mLevelIndex, DIFFICULTY_START_WAVES[difficulty]!);
  const level = (endless?endlessStartLevel:balancedStartLevel)(wave, !!CMain.mSaveData.__get__mDevilsActive(), single ? 1 : 2);
  const state = upgrades.lanGrowth = newGrowth(level, true,endless);
  if (restored) {
    // No new weapons or refill on migration. Owned weapons supply a lower bound even if the old multiplier decayed.
    for (const player of Object.values(world.mThing_Collection.mPlayerThings) as any[]) {
      let required = Math.max(level, upgrades.mMultiplierIndex);
      for (let n = 1; n <= MAX_LEVEL; n++) for (const item of upgrades.mMultipliers[n] ?? []) {
        if (item.mClassID === 'CThing_Creature_Player' && player.mWeapons[item.mValue]?.mActive) required = Math.max(required, n);
      }
      state.players[player.mPlayerIndex]!.level = endless?required:Math.min(MAX_LEVEL, required);
      for (const entry of Object.values(player.mWeapons) as any[]) if (entry.mThing) {
        const ammo = entry.mThing.mAmmo;
        upgrades.ApplyUpgrade_Weapon(entry.mThing);
        entry.mThing.mAmmo = ammo;
      }
    }
    const total = world.mHud.nTotalScore;
    state.players[0].score = single ? total : Math.ceil(total / 2);
    state.players[1].score = single ? 0 : Math.floor(total / 2);
  } else grantGrowthLoadout(world);
  settleVitals(world, restored);
}
