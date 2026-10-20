import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/combat-weapons-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'Single 640x480 Chrome; prepared level-10 fixture, real fire/move keys; not ordinary progression play'};let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 await g.eval(()=>{
  const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];w.mUpgrades.ProcessTimedSpawns=()=>{};
  w.mUpgrades.lanGrowth.players[0].level=10;for(const name of ['uzi','shotgun','rocket','railgun'])p.NewWeapon(name);
  window.qaEmissions=[];const c=w.mThing_Collection,add=c.AddThing;
  c.AddThing=function(t){const result=add.call(this,t);if(t._CLASSID_.startsWith('CThing_Shot_'))window.qaEmissions.push({classID:t._CLASSID_,damage:t.mDamage,shotgun:!!t.mCombatShotgun,rocket:!!t.mCombatRocket});return result;};
 });
 report.weapons={};
 for(const name of ['uzi','shotgun','rocket','railgun']){
  await g.expr(`Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].SelectWeapon('${name}')`);
  await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(100);await g.page.keyboard.up('ArrowRight');
  await g.page.keyboard.down('Slash');await g.page.waitForTimeout(name==='uzi'?220:70);await g.page.keyboard.up('Slash');await g.page.waitForTimeout(150);
  report.weapons[name]=await g.expr('(()=>{const p=Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0],w=p.mWeapon_Current;return {name:w.mNameID,damage:w.mDamage,rate:w.mFireRate,ammo:w.mAmmo,capacity:w.mTotalAmmo};})()');
  assert.equal(report.weapons[name].name,name);assert(report.weapons[name].capacity<1000);
 }
 report.emissions=await g.eval(()=>window.qaEmissions);assert(report.emissions.some(x=>x.shotgun));assert(report.emissions.some(x=>x.rocket));
 assert(report.weapons.shotgun.damage<51);assert(report.weapons.rocket.rate>=13);assert(report.weapons.railgun.rate>=10);
 await g.expr('(m.mcWorld.mUpgrades.timedWave.remainingTicks=1)');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));
 await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
 await g.shot(out+'/weapon-stats.png',false);
 assert((await g.expr('m.mcWorld._WaveDraftHud._Player0._Stats._Value4.text')).includes('Railgun'));
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('COMBAT WEAPONS PASSED '+out);
