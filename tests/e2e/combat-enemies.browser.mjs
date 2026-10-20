import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/combat-enemies-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch();let g;const report={ok:false,method:'One low-resolution production browser, prepared armor scene and real pause/input'};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 report.values=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,u=w.mUpgrades,p=Object.values(w.mThing_Collection.mPlayerThings)[0];
  u.AdvanceTimedWave();u.__set__mLevel(5);u.ProcessTimedSpawns();w.mThing_Collection.Process();
  const boss=Object.values(w.mThing_Collection.mThings).find(e=>e.mBossKind),at=p.mPosition.Clone();at.mX+=3;at.mY+=2;
  boss.ClearCollideCell();boss.Move(at);boss.SetCollideDirection(at,P.World.Map.CMap_Cell.mCollide_Creature);boss.mEnemyArmor/=2;boss.mLife/=2;
  const q=p.mPosition.Clone();q.mX-=3;q.mY+=2;const devil=new P.Thing.Creature.CThing_Creature_Devil(q);w.mThing_Collection.AddThing(devil);devil.Process_Init();devil.mEnemyArmor/=2;
  return {bossHP:boss.mMaxLife,bossArmor:boss.mEnemyArmorMaximum,devilHP:devil.mMaxLife,devilArmor:devil.mEnemyArmorMaximum};
 });
 assert.equal(report.values.bossHP,12000);assert.equal(report.values.bossArmor,4800);assert.equal(report.values.devilHP,2000);assert.equal(report.values.devilArmor,600);
 await g.page.waitForTimeout(300);const buffer=await g.page.screenshot();writeFileSync(out+'/armor.png',buffer);
 const png=PNG.sync.read(buffer);let cyan=0;for(let i=0;i<png.data.length;i+=4)if(png.data[i]>100&&png.data[i]<170&&png.data[i+1]>185&&png.data[i+2]>195)cyan++;assert(cyan>20);report.cyanPixels=cyan;
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.keyboard.press('KeyP');assert(await g.waitExpr('!m.mcWorld.mPaused'));
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('COMBAT ENEMIES PASSED '+out);
