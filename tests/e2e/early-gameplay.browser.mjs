// Production renderer: real options and held keyboard fire, with a normally initialized nearby target.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.BOXHEAD_QA_OUT??'generated/reports/v036/early-gameplay';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'One hidden 640x480 production renderer at a time. Real difficulty buttons and held pistol input; prepared player/target positions and disabled further random spawns, with unmodified HP, damage, cooldown and collision.',cases:[]};let g;
try{
 for(const difficulty of [0,1,2,3]){
  await g?.close();g=await openGame(browser);await toMainMenu(g);
  await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
  for(let n=0;n<18&&await g.expr('P.CMain.mSaveData.mLevelIndex_Single')!==0;n++)await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.bLeft');
  assert.equal(await g.expr('P.CMain.mSaveData.mLevelIndex_Single'),0);
  await g.clickClip('m.mcScreen._Game_Options');assert(await g.waitExpr('m.mcScreen.mcWindow_Options._visible'));
  await g.clickClip('m.mcScreen.mcWindow_Options.'+['_Level_Beginner','_Level_Intermediate','_Level_Expert','_Level_Nightmare'][difficulty]);
  assert.equal(await g.expr('P.CMain.mSaveData.mDifficulty'),difficulty);
  await g.clickClip('m.mcScreen.mcWindow_Options._Button_Close');await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');
  assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
  const initial=await g.expr(`(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];w.Spawn_Zombie=w.Spawn_Devil=()=>false;
   p.Move(new P.Thing.Math.CThing_Position(10.5,8.5,0));p.SetCollideDirection(p.mPosition,P.World.Map.CMap_Cell.mCollide_Player);p.mAngle.__set__mDirection(0);
   const e=new P.Thing.Creature.CThing_Creature_Zombie(new P.Thing.Math.CThing_Position(12.5,8.5,0));w.mThing_Collection.AddThing(e);e.Process_Init();
   window.qaEarly={enemy:e,shots:[],damage:p.mWeapon_Current.mDamage};const fire=p.mWeapon_Current.Fire;p.mWeapon_Current.Fire=function(...args){window.qaEarly.shots.push(w.mTick);return fire.apply(this,args);};
   return {room:w.mWorldLibLink,wave:w.mUpgrades.mLevelIndex,level:w.mUpgrades.lanGrowth.players[0].level,health:e.mMaxLife,damage:p.mWeapon_Current.mDamage,objective:w.mUpgrades.timedWave.clear.zombies,concurrent:w.mUpgrades.Level.Zombie_Count};})()`);
  report.pending={difficulty,initial};writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));assert.equal(initial.room,'ROOM_Single_0001');
  assert.equal(initial.wave,1);assert.equal(initial.level,1);assert.equal(initial.damage,26);assert.equal(initial.objective,[9,11,14,18][difficulty]);assert.equal(initial.concurrent,2);
  await g.page.keyboard.down('Slash');assert(await g.waitExpr('window.qaEarly.enemy.mLife<=0',5000));await g.page.keyboard.up('Slash');
  const actual=await g.eval(()=>({shots:window.qaEarly.shots,life:window.qaEarly.enemy.mLife,state:window.qaEarly.enemy.mStateID}));
  assert.equal(actual.shots.length,2,'two successful pistol emissions kill a first-wave ordinary zombie');assert(initial.health>26&&initial.health<=52);
  await g.page.waitForTimeout(300);
  assert(await g.waitExpr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];if(p.mInvincible&&p.mInvincible%2)return false;w.Process=()=>{};w.Draw();return true;})()'));
  await g.page.waitForTimeout(150);await g.shot(`${out}/difficulty-${difficulty}.png`,false);assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);
  report.cases.push({difficulty,initial,actual});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 }delete report.pending;report.ok=true;
}catch(error){report.error=String(error);await g?.shot(`${out}/failed.png`,false).catch(()=>{});throw error;}
finally{await g?.page.keyboard.up('Slash').catch(()=>{});await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('EARLY GAMEPLAY TWO-HIT PISTOL CHECKS PASSED');
