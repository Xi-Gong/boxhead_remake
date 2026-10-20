import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/combat-pacing-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch();let g;const report={ok:false,method:'One low-resolution production browser, real move/fire keys; short functional check'};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 report.menu=await g.expr('m.mcScreen._WaveLimit.text');await g.shot(out+'/map-limit.png',false);assert(report.menu.includes('1:20'),report.menu);
 await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 report.before=await g.expr('({profile:m.mcWorld.mUpgrades.timedWave.mapPacing,ticks:m.mcWorld.mUpgrades.timedWave.totalTicks,goal:m.mcWorld.mUpgrades.timedWave.clear.zombies,cap:m.mcWorld.mUpgrades.Level.Zombie_Count,x:Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mPosition.mX})');
 console.log(JSON.stringify(report));
 assert.equal(report.before.ticks,2000);assert.equal(report.before.cap,4);assert(report.before.goal<=61);
 await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(400);await g.page.keyboard.up('ArrowRight');
 for(let i=0;i<12;i++){await g.page.keyboard.press('Slash');await g.page.waitForTimeout(170);}
 report.after=await g.expr('({tick:m.mcWorld.mTick,left:m.mcWorld.mUpgrades.timedWave.remainingTicks,warnings:m.mcWorld.mUpgrades.timedWave.warnings.length,x:Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mPosition.mX})');
 assert(report.after.left<2000);assert.equal(report.after.warnings,0);assert.notEqual(report.after.x,report.before.x);
 await g.shot(out+'/combat.png',false);assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('COMBAT PACING PASSED '+out);
