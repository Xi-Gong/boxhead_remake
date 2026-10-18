import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launch, openGame, toMainMenu } from './lib.mjs';
const out='generated/reports/v029/local-growth';mkdirSync(out,{recursive:true});
const browser=await launch(),report={ok:false,cases:[],shots:[]};let g;
try {
 for(const mode of ['Single','Coop']){
  g=await openGame(browser);await toMainMenu(g);
  await g.expr('P.CSaveData.mSharedObject.data.mMaxWaveReached=100');
  await g.clickClip(`m.mcScreen.mc${mode==='Single'?'SinglePlay':'CoopPlay'}`);
  assert(await g.waitScreen(`State_SelectWorld_${mode}`,'Screen_SelectWorld'));
  const input=g.page.getByRole('textbox',{name:'Start wave'});await input.click();
  await g.page.keyboard.press('Control+A');await g.page.keyboard.type('20');await g.page.keyboard.press('Enter');
  await g.click(380,230);assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
  await g.eval(()=>{
   const w=window.__game.main().mcWorld;w.Spawn_Zombie=()=>false;w.Spawn_Devil=()=>false;
   for(const t of Object.values(w.mThing_Collection.mThings))if(['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(t._CLASSID_))t.Delete();
   w.mHud.mSilentMessages=true;w.mHud.mMessages=[];
  });
  for(const [width,height]of[[640,480],[960,720],[1280,720],[640,889]]){
   await g.page.setViewportSize({width,height});await g.page.waitForTimeout(750);
   const sample=await g.eval(()=>{
    const P=window.__game.pkg,w=window.__game.main().mcWorld,players=Object.values(w.mThing_Collection.mPlayerThings);
    for(const p of players){
     const z=new P.Thing.Creature.CThing_Creature_Zombie(p.mPosition.Clone(),p.mAngle.Clone());
     w.mThing_Collection.AddThing(z);z.Process_Init();z.mLife=10;
     new P.Thing.Affect.CThing_Affect_Bullet(p,p,10,p.mAngle).AffectThing(z);w.LogKill(z);w.LogKill(z);z.Delete();
    }
    const rows=[];const draw=w.mHud.DrawBMObject;
    w.mHud.DrawBMObject=function(bm,p,a){rows.push({x:p.x+bm.mDisp.x+bm.sBMD.width/2,y:p.y+bm.mDisp.y+bm.sBMD.height/2,at:performance.now()});return draw.call(this,bm,p,a);};
    window.__localRows=rows;window.__originalDraw=draw;
    return {growth:structuredClone(w.mUpgrades.lanGrowth),wave:w.mUpgrades.mLevelIndex,players:players.length};
   });
   assert.equal(sample.wave,20);assert.equal(sample.players,mode==='Single'?1:2);
   await g.page.waitForTimeout(130);
   const file=`${out}/${mode}-${width}x${height}.png`;await g.shot(file,false);report.shots.push(file);
   const geometry=await g.eval(()=>{
    const w=window.__game.main().mcWorld,ui=w._LanGrowthHud,canvas=window.__game.platform.presenter.canvas.getBoundingClientRect();
    return {scorePanels:[ui._Player0,ui._Player1].filter(Boolean).map(p=>{
     const b=p.getBounds(w),s=p._Score.getBounds(w);return {bounds:b,score:s,text:p._Score.text,level:p._Level.text};
    }),scale:canvas.width/w.mScreenSize.x,left:canvas.left,top:canvas.top,stageWidth:w.mScreenSize.x};
   });
   assert.equal(geometry.scorePanels.length,sample.players);const png=PNG.sync.read(readFileSync(file));
   for(const panel of geometry.scorePanels){
    assert(panel.bounds.xMin>=0&&panel.bounds.xMax<=geometry.stageWidth);
    assert.match(panel.text,/^\d{12}$/);assert.match(panel.level,/^LV \d+$/);
    const b=panel.score;let dark=0,white=0;
    for(let y=Math.ceil(geometry.top+b.yMin*geometry.scale);y<Math.floor(geometry.top+b.yMax*geometry.scale);y++)
     for(let x=Math.ceil(geometry.left+b.xMin*geometry.scale);x<Math.floor(geometry.left+b.xMax*geometry.scale);x++){
      const i=(y*png.width+x)*4,rgb=[png.data[i],png.data[i+1],png.data[i+2]];
      if(Math.max(...rgb)<40)dark++;if(Math.min(...rgb)>240)white++;
     }
    assert(dark>30&&white>30,'score text and outline must occupy the actual score bounds');
   }
   await g.page.waitForTimeout(1000);
   const rows=await g.eval(()=>{const w=window.__game.main().mcWorld;w.mHud.DrawBMObject=window.__originalDraw;return window.__localRows;});
   assert(rows.length>10);for(const panel of geometry.scorePanels){
    const target={x:(panel.score.xMin+panel.score.xMax)/2,y:(panel.score.yMin+panel.score.yMax)/2};
    assert(rows.some(r=>Math.hypot(r.x-target.x,r.y-target.y)<5),'local flight must finish at its owner score');
   }
   await g.page.keyboard.press('p');assert(await g.waitExpr('m.mcWorld.mPaused && m.mcWorld.mHud.mcScreenPause?._PersonalUpgrades'));
   await g.page.waitForTimeout(700);const pauseFile=`${out}/${mode}-pause-${width}x${height}.png`;
   await g.shot(pauseFile,false);report.shots.push(pauseFile);
   const pause=await g.expr('[m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._Player0?.text,m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._Player1?.text]');
   assert.equal(pause.filter(Boolean).length,sample.players);
   // Header action remains reachable above the new upgrade columns.
   await g.page.keyboard.press('p');assert(await g.waitExpr('!m.mcWorld.mPaused'));
   report.cases.push({mode,width,height,...sample,geometry,flightSamples:rows.length,pause});
  }
  const saved=await g.expr('JSON.parse(JSON.stringify(m.mcWorld.mUpgrades.lanGrowth))');
  await g.page.keyboard.press('p');assert(await g.waitExpr('m.mcWorld.mPaused'));
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._SaveQuit');assert(await g.waitScreen('State_Main','Screen_Main'));
  await g.clickClip('m.mcScreen.mcContinue');assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
  assert.deepEqual(await g.expr('m.mcWorld.mUpgrades.lanGrowth'),saved);
  assert.deepEqual(await g.expr('g.errors'),[]);assert.deepEqual(g.log,[]);await g.close();g=undefined;
 }
 report.ok=true;
} finally {writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await g?.close();await browser.close();}
console.log('LOCAL GROWTH PASSED');
