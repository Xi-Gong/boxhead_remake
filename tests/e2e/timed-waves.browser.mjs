import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v031/timed-waves/run-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[]};let g;
try{
  g=await openGame(browser);await toMainMenu(g);
  await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
  await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
  assert.equal(await g.expr('m.mcScreen._WaveLimit.text'),'SURVIVE 3:00 / BOSS 4:00');
  await g.page.waitForTimeout(700);await g.shot(`${out}/selection.png`,false);report.shots.push('selection.png');
  const selector=await g.centreOf('m.mcScreen._WaveLimit');assert(selector.x-selector.w/2>=0&&selector.x+selector.w/2<=640);
  await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
  await g.page.waitForTimeout(800);
  const start=await g.expr('({ticks:m.mcWorld.mUpgrades.timedWave.remainingTicks,enemies:m.mcWorld.mUpgrades.Level.mZombieCount,warnings:m.mcWorld.mUpgrades.timedWave.warnings.length})');
  assert(start.ticks<4500&&start.ticks>4400);assert(start.enemies+start.warnings>0);
  await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(120);await g.page.keyboard.up('ArrowRight');
  await g.shot(`${out}/combat.png`,false);report.shots.push('combat.png');
  const geometry=await g.centreOf('m.mcWorld._TimedWaveHud');assert(geometry.y-geometry.h/2>=50&&geometry.x-geometry.w/2>=0&&geometry.x+geometry.w/2<=640);
  const png=PNG.sync.read(readFileSync(`${out}/combat.png`));let light=0;
  for(let y=56;y<76;y++)for(let x=264;x<376;x++){const i=(y*png.width+x)*4;if(png.data[i]>215&&png.data[i+1]>215&&png.data[i+2]>215)light++;}
  assert(light>80,'countdown must contain readable light text pixels');report.countdown={geometry,light,start};
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  const paused=await g.expr('m.mcWorld.mUpgrades.timedWave.remainingTicks');await g.page.waitForTimeout(200);
  assert.equal(await g.expr('m.mcWorld.mUpgrades.timedWave.remainingTicks'),paused);
  await g.eval(()=>{
    const w=window.__game.main().mcWorld;w.mSpawnPoint_Zombie=[];
    for(const t of Object.values(w.mThing_Collection.mThings))if(t._CLASSID_==='CThing_Creature_Zombie'){t.ClearCollideCell();t.Delete();}
    w.mUpgrades.Level.mZombieCount=0;w.mUpgrades.timedWave.warnings=[];w.mUpgrades.timedWave.zombieTicks=0;
    w.mUpgrades.Process();w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;
  });
  assert(await g.expr('m.mcWorld.mUpgrades.timedWave.warnings.length>0'));
  await g.page.waitForTimeout(100);await g.shot(`${out}/arrival-warning.png`,false);report.shots.push('arrival-warning.png');
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('TIMED WAVES LIGHT BROWSER PASSED '+out);
