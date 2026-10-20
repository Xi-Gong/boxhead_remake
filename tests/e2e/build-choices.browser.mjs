import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/build-choices-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,method:'Single low-resolution Chrome; prepared card fixture, real clicks and stat shortcuts'};let g;
const end=async offers=>{
 await g.expr('(m.mcWorld.mUpgrades.timedWave.remainingTicks=1)');assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));
 await g.eval(offers=>{window.__game.main().mcWorld.mUpgrades.waveDraft.round.offers=offers;},offers);await g.page.waitForTimeout(150);
};
const choose=async(i,c)=>{await g.clickClip(`m.mcWorld._WaveDraftHud._Player${i}._Card${c}`);assert(await g.waitExpr(`m.mcWorld.mUpgrades.waveDraft.round.selected[${i}]===${c}`));await g.clickClip(`m.mcWorld._WaveDraftHud._Player${i}._Ready`);};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcCoopPlay');assert(await g.waitScreen('State_SelectWorld_Coop','Screen_SelectWorld'));
 await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 await g.eval(()=>{const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex);p[0].NewWeapon('shotgun');p[0].SelectWeapon('shotgun');p[1].NewWeapon('uzi');p[1].SelectWeapon('uzi');});
 await end([['haste','health','mobility'],['penetration','armor','scavenging']]);
 for(let i=0;i<2;i++)for(let c=0;c<3;c++)assert(await g.expr(`m.mcWorld._WaveDraftHud._Player${i}._Card${c}._Preview.textWidth<m.mcWorld._WaveDraftHud._Player${i}._Card${c}._Preview._width`));
 await g.shot(out+'/new-cards.png',false);await choose(0,2);await choose(1,2);assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));
 await end([['haste','health','capacity'],['penetration','armor','ammo']]);await choose(0,0);await choose(1,0);assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===3'));
 report.values=await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex).map(p=>({speed:p.mSpeed,pen:p.mArmorPenetration,supply:p.mSupplyEfficiency,delay:p.mWeapon_Current.mFireRate}))');
 assert(report.values[0].speed>.16);assert(report.values[0].delay<18);assert(report.values[1].pen>0);assert(report.values[1].supply>0);
 await end([['damage','health','mobility'],['penetration','armor','scavenging']]);
 await g.page.keyboard.press('Tab');await g.page.keyboard.press('KeyR');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible&&m.mcWorld._WaveDraftHud._Player1._Stats._visible'));
 await g.shot(out+'/build-stats.png',false);assert((await g.expr('m.mcWorld._WaveDraftHud._Player1._Stats._Value7.text')).includes('10% / +9%'));
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));
 await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
 const restored=await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex).map(p=>({speed:p.mSpeed,pen:p.mArmorPenetration,supply:p.mSupplyEfficiency,delay:p.mWeapon_Current.mFireRate}))');
 assert.deepEqual(restored,report.values);assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('BUILD CHOICES PASSED '+out);
