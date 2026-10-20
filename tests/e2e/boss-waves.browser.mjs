import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v031/boss-waves/run-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,shots:[]};let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');
 assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 assert.equal(await g.expr('m.mcScreen._WaveLimit.text'),'SURVIVE 3:00 / BOSS 4:00');
 await g.page.waitForTimeout(700);await g.shot(`${out}/selection.png`,false);report.shots.push('selection.png');
 await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));
 await g.expr('(m.mcWorld.mUpgrades.AdvanceTimedWave(),m.mcWorld.mUpgrades.__set__mLevel(5))');
 assert(await g.waitExpr('Object.values(m.mcWorld.mThing_Collection.mThings).some(e=>e.mBossKind&&e.mMaxLife>1000)'));
 await g.page.keyboard.down('ArrowRight');await g.page.waitForTimeout(100);await g.page.keyboard.up('ArrowRight');
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 await g.eval(()=>{
  const w=window.__game.main().mcWorld;
  const e=Object.values(w.mThing_Collection.mThings).find(t=>t.mBossKind);
  e.mLife=e.mMaxLife/2;e.mChargeX=1;e.mChargeY=0;e.SetState('State_VariantCharge');
  w.mHud.Pause(false);w.mPaused=false;w.mUpgrades.Process();w.Draw();w.mPaused=true;
 });
 await g.page.waitForTimeout(120);await g.shot(`${out}/tyrant.png`,false);report.shots.push('tyrant.png');
 const geometry=await g.centreOf('m.mcWorld._BossWaveHud');assert(geometry.x-geometry.w/2>=0&&geometry.x+geometry.w/2<=640&&geometry.y+geometry.h/2<150);
 const png=PNG.sync.read(readFileSync(`${out}/tyrant.png`));let fill=0;
 for(let y=101;y<107;y++)for(let x=198;x<442;x++){const i=(y*png.width+x)*4;if(png.data[i]>150&&png.data[i+1]>140&&png.data[i+2]<190)fill++;}
 assert(fill>600&&fill<900,'half-health bar must match the visible filled pixels');report.bar={geometry,fill};
 await g.expr('(()=>{const w=m.mcWorld,e=Object.values(w.mThing_Collection.mThings).find(t=>t.mBossKind);e.mLife=0;e.lanFatalSlot=0;e.CheckForDead();w.mUpgrades.Process();w.mPaused=false;w.Draw();w.mPaused=true;})()');
 assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.round.multiplier'),2);
 await g.page.waitForTimeout(100);await g.shot(`${out}/double-reward.png`,false);report.shots.push('double-reward.png');
 await g.expr('m.mcWorld.mPaused=false');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');
 assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===6'));
 assert.equal(await g.expr('m.mcWorld.mUpgrades.waveDraft.bonuses[0].damage'),2);
 await g.expr('(m.mcWorld.mUpgrades.AdvanceTimedWave(),m.mcWorld.mUpgrades.__set__mLevel(10))');
 assert(await g.waitExpr('Object.values(m.mcWorld.mThing_Collection.mThings).some(e=>e.mBossKind==="priest"&&e.mMaxLife>1000)'));
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));
 await g.expr('(()=>{const w=m.mcWorld,e=Object.values(w.mThing_Collection.mThings).find(t=>t.mBossKind),p=Object.values(w.mThing_Collection.mPlayerThings)[0];e.ClearCollideCell();const q=p.mPosition.Clone();q.mX-=4;e.Move(q);e.SetCollideDirection(q,P.World.Map.CMap_Cell.mCollide_Creature);e.mVariantCooldown=0;e.SetState("State_GotoPlayer");e.State_GotoPlayer();w.mHud.Pause(false);w.mPaused=false;w.Draw();w.mPaused=true;})()');
 assert.equal(await g.expr('m.mcWorld.mUpgrades.enemyVariantState.zones.length'),3);
 await g.page.waitForTimeout(100);await g.shot(`${out}/ember-lord.png`,false);report.shots.push('ember-lord.png');
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('BOSS WAVES LIGHT BROWSER PASSED '+out);
