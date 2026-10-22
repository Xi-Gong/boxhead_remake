import {it} from 'vitest';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHeadlessGame} from './harness.ts';
import {CMain,Thing} from '../../src/game/packages.ts';
import {recordWaveReached} from '../../src/game/local/WaveUnlock.ts';
import {setSelectedStartWave} from '../../src/game/local/StartWave.ts';
import {enchantHeldWeapon,enchantmentDamage} from '../../src/game/local/EnchantmentRules.ts';
import {pos} from './fxkit.ts';
it('bounds enchantment gains across four difficulty profiles and normal selected-wave builds',()=>{
const report={ok:false,method:'Serial headless normal selected-wave builds and real Weapon.Update emissions after a neutral Update settles upgrades; no win-rate or performance claim. v0.3.4 feature fixture compared with v0.3.5. No scripted damage, health, level or reward bonuses.',cases:[] as any[]};
for(const difficulty of [0,1,2,3])for(const wave of [5,15,25,100]){
 const pair=[];
 for(const modern of [false,true]){
  const g=createHeadlessGame({menuOnly:'Select',classicFeatures:modern?[]:['enchant-power-v1']});try{
   CMain.mSaveData.mDifficulty=difficulty;recordWaveReached(wave);setSelectedStartWave(wave);
   const s=g.main().mcScreen;s.ChangeLevel(s.mcSubScreen.mcLevel_Selection,0);s.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button.onRelease();assert(g.waitRunning());
   const w=g.world(),p=g.players()[0],z=new Thing.Creature.CThing_Creature_Zombie(pos(8.5,8.5));w.mThing_Collection.AddThing(z);z.Process_Init();
   p.SelectWeapon('uzi');const gun=p.mWeapon_Current;assert.equal(gun.mNameID,'uzi');gun.Update({IsDown:()=>false,IsPressed:()=>false,IsReleased:()=>false});const ordinary=gun.mDamage;assert(enchantHeldWeapon(p));
   const old=new Set(g.things());gun.Update({IsDown:()=>true,IsPressed:()=>true,IsReleased:()=>false,mTimeDown:0});const shot=g.things().find(t=>!old.has(t)&&t._CLASSID_==='CThing_Shot_Bullet')!;
   assert(shot.mEnchanted);assert(Math.abs(shot.mDamage/ordinary-enchantmentDamage(w))<1e-8);
   pair.push({modern,level:w.mUpgrades.lanGrowth.players[0].level,bonuses:w.mUpgrades.waveDraft.bonuses[0],health:p.mMaxLife,ordinary,enchanted:shot.mDamage,period:gun.mFireRate,multiplier:shot.mDamage/ordinary,zombieHP:z.mMaxLife,zombieDamage:z.mDamage,zombieSpeed:z.mSpeed,shotsToKill:Math.ceil(z.mMaxLife/shot.mDamage)});
  }finally{g.quit();}
 }
 const [before,after]=pair;assert.equal(before.zombieHP,after.zombieHP);assert.equal(before.zombieDamage,after.zombieDamage);assert.equal(before.zombieSpeed,after.zombieSpeed);assert(after.multiplier/before.multiplier<=1.45/1.15+1e-8);report.cases.push({difficulty,wave,before,after,relativeEnchantedDPS:(after.enchanted/after.period)/(before.enchanted/before.period)});
}
report.ok=true;if(process.env.BOXHEAD_QA_BALANCE_OUT)writeFileSync(process.env.BOXHEAD_QA_BALANCE_OUT,JSON.stringify(report,null,2));

},30000);
