import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v031/wave-draft/run-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[]};let g;
try{
  g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcCoopPlay');
  assert(await g.waitScreen('State_SelectWorld_Coop','Screen_SelectWorld'));
  await g.expr('(P.CMain.mSaveData.mLevelIndex_Coop=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
  await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
  await g.page.waitForTimeout(700);await g.page.keyboard.down('Slash');
  await g.expr('(m.mcWorld.mUpgrades.timedWave.remainingTicks=2)');
  assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round&&m.mcWorld._WaveDraftHud?._visible'));
  await g.page.waitForTimeout(300);assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.confirmed'),[false,false]);
  await g.page.keyboard.up('Slash');await g.page.waitForTimeout(100);
  await g.shot(`${out}/choices.png`,false);report.shots.push('choices.png');
  const bounds=await g.centreOf('m.mcWorld._WaveDraftHud');assert(bounds.x-bounds.w/2>=0&&bounds.y+bounds.h/2<=480);
  const cards=[];
  for(let p=0;p<2;p++)for(let c=0;c<3;c++){
    const path=`m.mcWorld._WaveDraftHud._Player${p}._Card${c}`,b=await g.centreOf(path);
    assert(b.w>=270&&b.h>=59&&b.x-b.w/2>=0&&b.x+b.w/2<=640&&b.y+b.h/2<=480);cards.push(b);
    assert(await g.expr(`${path}._Detail.textWidth<${path}._Detail._width`));
  }
  const png=PNG.sync.read(readFileSync(`${out}/choices.png`));let light=0;
  for(let y=100;y<410;y++)for(let x=30;x<610;x++){const i=(y*png.width+x)*4;if(png.data[i]>215&&png.data[i+1]>215&&png.data[i+2]>215)light++;}
  assert(light>500);report.geometry={bounds,cards,light};
  await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round.confirmed[0]'));
  await g.shot(`${out}/partner-wait.png`,false);report.shots.push('partner-wait.png');
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  const saved=await g.expr('JSON.parse(JSON.stringify(m.mcWorld.mUpgrades.waveDraft.round))');
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));
  await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
  const resumed=await g.expr('m.mcWorld.mUpgrades.waveDraft.round');
  assert.deepEqual(resumed.offers,saved.offers);assert.deepEqual(resumed.confirmed,[true,false]);
  assert(resumed.remainingTicks<=saved.remainingTicks&&resumed.remainingTicks>saved.remainingTicks-15);
  report.resume={savedTicks:saved.remainingTicks,resumedTicks:resumed.remainingTicks};
  await g.page.keyboard.press('Space');assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2&&!m.mcWorld.mUpgrades.waveDraft.round'));
  assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses.map(b=>b.damage)'),[1,1]);
  await g.expr('(m.mcWorld.mUpgrades.timedWave.remainingTicks=1)');assert(await g.waitExpr('m.mcWorld.mUpgrades.waveDraft.round'));
  const offers=await g.expr('m.mcWorld.mUpgrades.waveDraft.round.offers');
  await g.page.keyboard.press('ArrowDown');await g.page.waitForTimeout(80);
  assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.selected[0]'),1);
  await g.expr('(m.mcWorld.mUpgrades.waveDraft.round.remainingTicks=1)');assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===3'));
  assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses.map(b=>b.damage)'),[2,2]);report.offers=offers;
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('WAVE DRAFT LIGHT BROWSER PASSED '+out);
