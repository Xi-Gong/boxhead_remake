// Release correctness coverage reuses the existing functional pair, transport guard and decal observer.
// Fixtures execute at a shared future simulation tick, including rollback replay; input/UI stays real.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Game} from './lib.mjs';

export async function verifyV031Lan(H,C,report,out){
 const peers=[H,C],games=peers.map(p=>new Game(p.page,p.page.context(),report.errors));
 const result=report.v031={checks:[]};
 const step=s=>{result.checks.push(s);console.log(s);};
 const both=async(code)=>{for(const g of games)assert(await g.waitExpr(code,20000),code);};
 const states=()=>Promise.all(games.map(g=>g.expr(`(()=>{const w=m.mcWorld,u=w.mUpgrades,t=u.timedWave;return {tick:w.mTick,wave:u.mLevelIndex,time:t.remainingTicks,total:t.totalTicks,phase:t.phase,boss:t.boss,damage:u.waveDraft.bonuses.map(b=>b.damage),round:u.waveDraft.round,devils:Number(w._LanGrowthHud._Wave._Devils.text),nativeDevils:u.Level.mDevilCount,growth:u.lanGrowth.players,checkpoint:g.lan().checkpoint};})()`)));
 const pause=async()=>{
  await H.page.keyboard.press('KeyP');await both('g.lan().paused');
  const rows=await Promise.all(games.map(g=>g.expr('({digest:g.__netDigest(),events:g.lan().confirmedEvents,decals:window.__functionalQA.decals})')));
  assert.deepEqual(rows[0],rows[1],'common confirmed gameplay, ordered sound and decal identities');
  (result.confirmed??=[]).push(rows[0]);return states();
 };
 const resume=async()=>{await H.page.keyboard.press('KeyP');await both('!g.lan().paused');};
 const schedule=async(source)=>{
  const target=Math.max(...await Promise.all(games.map(g=>g.expr('m.mcWorld.mTick'))))+60;
  for(const P of peers)await P.page.evaluate(({target,source})=>{
   const w=window.__game.main().mcWorld,prior=w.Process,apply=new Function('w','g','P',source);
   if(w.mTick>=target)throw new Error('fixture target passed');
   w.Process=function(...args){if(this.mTick===target)apply(this,window.__game,window.__game.pkg);return prior.apply(this,args);};
  },{target,source});
  return target;
 };
 await resume();
 await schedule(`w.mUpgrades.AdvanceTimedWave();w.mUpgrades.__set__mLevel(15);`);
 await both('m.mcWorld.mUpgrades.mLevelIndex===15&&m.mcWorld.mUpgrades.timedWave.boss.members.length===2&&m.mcWorld.mUpgrades.timedWave.boss.members.every(b=>b.id)');
 result.capabilities=await games[0].expr(`({timed:m.mcWorld.mUpgrades.timedWave.rule,clear:m.mcWorld.mUpgrades.timedWave.clearable,draft:m.mcWorld.mUpgrades.waveDraft.rule,tiered:m.mcWorld.mUpgrades.lanGrowth.players[0].tiered,variants:!!m.mcWorld.mUpgrades.enemyVariantState,members:m.mcWorld.mUpgrades.timedWave.boss.members.length})`);
 assert.equal(result.capabilities.timed,'timed-waves-v1');assert.equal(result.capabilities.tiered,'tiered-growth-v1');assert.equal(result.capabilities.members,2);assert(result.capabilities.variants);
 // Place both models within view on reachable floor, then inspect each overhead bar on the running renderer.
 await schedule(`const p=Object.values(w.mThing_Collection.mPlayerThings).find(p=>p.mPlayerIndex===0);let i=0;for(const e of Object.values(w.mThing_Collection.mThings))if(e.mBossKind&&e.mLife>0){e.Move(new P.Thing.Math.CThing_Position(p.mPosition.mX+(i++?2:-2),p.mPosition.mY+2,0));}`);
 await H.page.waitForTimeout(2800);
 for(const [i,g]of games.entries()){
  const bars=await g.expr(`(()=>{const w=m.mcWorld,layer=w._BossHealthHud;return {top:!!w._BossWaveHud,devils:w._LanGrowthHud._Wave._Devils.text,clock:w._LanGrowthHud._Wave._Clock.text,bars:[0,1].map(i=>{const b=layer['_Boss'+i],r=b?.getBounds(m._parent);return {visible:b?._visible,number:b?._Health?.text,width:r?r.xMax-r.xMin:0,height:r?r.yMax-r.yMin:0};})};})()`);
  assert.equal(bars.devils,'2');assert.match(bars.clock,/^\d+:\d{2}$/);assert(!bars.top);
  assert(bars.bars.every(b=>b.visible&&b.number===undefined&&b.width<=70&&b.height<=12));
  (result.bars??=[]).push(bars);await g.shot(join(out,`v031-two-bosses-${i}.png`),false);
 }
 for(let i=0;i<4;i++){
  const key=i%2?'ArrowLeft':'ArrowRight';await H.page.keyboard.down(key);await C.page.keyboard.down(i%2?'KeyD':'KeyA');
  await H.page.waitForTimeout(180);await H.page.keyboard.up(key);await C.page.keyboard.up(i%2?'KeyD':'KeyA');
 }
 result.twoBosses=await pause();assert(result.twoBosses.every(s=>s.wave===15&&s.boss.members.length===2&&s.devils===2));
 result.rollback=await Promise.all(games.map(g=>g.expr('g.lan().rollback')));
 assert(result.rollback.some(r=>r.predictions>0&&r.corrections>0),'delayed changing inputs must exercise rollback');
 for(const r of result.rollback){assert(r.maxDepth<=r.predictionLimit);assert(r.replayedTicks<=r.corrections*r.predictionLimit);}
 step('multiple Bosses: negotiated rules, two compact overhead bars, DEVIL count and delayed rollback agree');
 await resume();
 await schedule(`const b=w.mUpgrades.timedWave.boss;const e=w.mThing_Collection.mThings[b.members[0].id];e.mLife=0;e.lanFatalSlot=0;e.CheckForDead();const other=w.mThing_Collection.mThings[b.members[1].id];other.mLife=other.mMaxLife/2;`);
 await both('m.mcWorld.mUpgrades.timedWave.boss.members.filter(b=>b.defeated).length===1');
 await both('m.mcWorld._LanGrowthHud._Wave._Devils.text==="1"&&!m.mcWorld._BossHealthHud._Boss0._visible');
 await games[0].shot(join(out,'v031-partial-defeat.png'),false);
 result.partial=await pause();assert(result.partial.every(s=>s.phase==='combat'&&s.devils===1&&s.boss.members.filter(b=>!b.defeated).length===1));
 const surviving=result.partial[0].boss.members.find(b=>!b.defeated);
 await resume();
 for(const g of games)await g.expr('(window.__releaseRecoveryWorld=m.mcWorld,true)');
 await C.page.evaluate(()=>window.boxheadDesktop.lan.closePeer());
 await both('g.lan().diagnostics.some(d=>d.event==="history-recovered")&&g.lan().session==="playing"');
 assert((await Promise.all(games.map(g=>g.expr('window.__releaseRecoveryWorld===m.mcWorld')))).every(Boolean),'history recovery retains both original worlds');
 result.recovered=await pause();
 for(const s of result.recovered){assert(s.boss.members[0].defeated);assert.equal(s.boss.members.find(b=>!b.defeated).life,surviving.life);assert.deepEqual(s.damage,result.partial[0].damage);}
 step('real TCP disconnect/rejoin preserves partially defeated encounter, member HP and bonuses without rebuilding');
 await resume();
 await schedule(`for(const e of Object.values(w.mThing_Collection.mThings))if(e.mBossKind&&e.mLife>0){e.mLife=0;e.lanFatalSlot=0;e.CheckForDead();}`);
 await both('m.mcWorld.mUpgrades.timedWave.phase==="draft"&&m.mcWorld.mUpgrades.waveDraft.round.multiplier===2');
 // The simulation can enter draft before the LAN confirmed HUD has rendered its cards.
 for(const [i,g]of games.entries())assert(await g.waitExpr(`typeof m.mcWorld._WaveDraftHud?._Player${i}?._Card0?.onRelease==="function"`));
 await games[0].clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');
 await both('m.mcWorld.mUpgrades.waveDraft.round?.confirmed[0]');
 await games[1].clickClip('m.mcWorld._WaveDraftHud._Player1._Card0');
 await both('m.mcWorld.mUpgrades.mLevelIndex===16&&m.mcWorld.mUpgrades.timedWave.phase==="combat"');
 result.reward=await pause();
 for(const s of result.reward){assert.deepEqual(s.damage,result.partial[0].damage.map(n=>n+2));assert(s.checkpoint!==null);}
 step('all Bosses defeated: exactly one doubled selection per player and next-wave checkpoint after cleanup');
 await resume();
 await schedule(`const process=w.mThing_Collection.Process;w.mThing_Collection.Process=function(...args){for(const p of Object.values(this.mPlayerThings)){p.mFlags|=P.Thing.CThing.mFlag_DEAD;p.SetState('State_Dying');}this.Process=process;return process.apply(this,args);};`);
 await both('g.state()==="State_Debrief"&&m.mcScreen.mNormal&&m.mcScreen._Retry._visible&&g.lan().session==="ended"');
 await games[1].shot(join(out,'v031-debrief.png'),false);
 await games[1].clickClip('m.mcScreen._Retry');
 await both('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded&&g.lan().session==="playing"');
 result.retry=await pause();
 // RETRY restores the wave-start checkpoint, not the later paused inspection point.
 for(const s of result.retry){assert.equal(s.wave,16);assert.deepEqual(s.damage,result.reward[0].damage);assert.equal(s.checkpoint,result.reward[0].checkpoint);assert.equal(s.total,result.reward[0].total);assert(s.time<=s.total);assert(Math.abs(s.time-(s.total-(s.tick-s.checkpoint)))<=1,'checkpoint timer follows elapsed simulation ticks');}
 step('natural all-dead end and client RETRY restore wave 16 checkpoint without duplicating Boss reward');
 for(const g of games)assert.deepEqual(await g.scriptErrors(),[]);
 result.ok=true;
}
