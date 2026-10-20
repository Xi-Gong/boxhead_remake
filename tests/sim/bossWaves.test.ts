import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {placePlayer,pos} from './fxkit.ts';
import {CMain,Thing,DrawPrimitive} from '../../src/game/packages.ts';
import {bossKind,bossMaximum,beginBossCast} from '../../src/game/local/BossWaves.ts';
import {timedWave,clearWaveCombat,copyTimedWave} from '../../src/game/local/TimedWaves.ts';
import {beginCharge,emberZones,processEmberZones} from '../../src/game/local/EnemyVariants.ts';
import {waveDraft} from '../../src/game/local/WaveDraft.ts';
import {worldEnemyGrowth} from '../../src/game/local/Endless.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {bossHealthLayout,drawBossHealth} from '../../src/game/local/BossHealthUi.ts';

function encounter(kind:'charger'|'priest'='charger',mode:'Single'|'Coop'='Single'){
 const g=createHeadlessGame({mode,classicBossEncounters:true}),w=g.world();clearWaveCombat(w);w.mUpgrades.__set__mLevel(kind==='charger'?5:10);
 placePlayer(g,9.5,8.5,0);if(mode==='Coop')placePlayer(g,9.5,9.5,0,1);
 const C=kind==='charger'?Thing.Creature.CThing_Creature_Zombie:Thing.Creature.CThing_Creature_Devil;
 const e:any=new C(pos(5.5,8.5));e.mBossKind=e.mEnemyVariant=kind;w.mThing_Collection.AddThing(e);e.Process_Init();
 e.SetState('State_GotoPlayer');timedWave(w)!.boss!.id=e.sUniqueID;
 return {g,w,e};
}
it('schedules one alternate Boss every five waves, adding exactly one minute at every map size',()=>{
 expect([1,4,5,10,15,20].map(n=>bossKind(n))).toEqual([undefined,undefined,'charger','priest','charger','priest']);
 expect(bossKind(10,false)).toBe('charger');expect(bossMaximum(15,2,true)).toBe(28800);
 for(const room of [1,3,18]){
  const g=createHeadlessGame({room}),w=g.world(),base=timedWave(w)!.totalTicks;
  for(const n of [5,10,1000000]){w.mUpgrades.__set__mLevel(n);expect(timedWave(w)!.remainingTicks).toBe(base+60*CMain.mFPS);}
  w.mUpgrades.__set__mLevel(6);expect(timedWave(w)!.boss).toBeUndefined();expect(timedWave(w)!.remainingTicks).toBe(base);g.quit();
 }
});
it('spawns just one Boss and at most four ordinary zombie reinforcements without banking attempts',()=>{
 const g=createHeadlessGame({room:18}),w=g.world(),u=w.mUpgrades;clearWaveCombat(w);u.__set__mLevel(10);w.mSpawnPoint_Devil=[];w.mSpawnPoint_Zombie=[];
 u.Process();expect(timedWave(w)!.warnings.filter(s=>s.role==='boss')).toHaveLength(1);
 for(let i=0;i<24;i++){u.Process();w.mTick++;}
 let bosses=g.things().filter(t=>t.mBossKind);expect(bosses).toHaveLength(1);bosses[0].Process_Init();
 expect(bosses[0].mLife).toBe(bossMaximum(10,worldEnemyGrowth(w).health,false));
 for(let i=0;i<300;i++){u.Process();w.mTick++;}
 bosses=g.things().filter(t=>t.mBossKind);expect(bosses).toHaveLength(1);
 const adds=g.things().filter(t=>t._CLASSID_==='CThing_Creature_Zombie');expect(adds).toHaveLength(4);expect(adds.every(t=>!t.mEnemyVariant)).toBe(true);
 expect(timedWave(w)!.warnings).toHaveLength(0);expect(timedWave(w)!.boss!.reinforcementTicks).toBeGreaterThan(0);g.quit();
});
it('uses the Bone Tyrant on every Boss wave when devils are disabled',()=>{
 const g=createHeadlessGame({options:{devils:0},classicBossEncounters:true}),w=g.world();
 for(const wave of [5,10,20]){w.mUpgrades.__set__mLevel(wave);expect(timedWave(w)!.boss!.kind).toBe('charger');expect(w.mUpgrades.Level.Devil_Count).toBe(0);}g.quit();
});
it.each(['Single','Coop']as const)('scales %s Boss health and family damage once',mode=>{
 for(const kind of ['charger','priest']as const){const {g,w,e}=encounter(kind,mode),factor=worldEnemyGrowth(w);
  expect(e.mLife).toBe(bossMaximum(w.mUpgrades.mLevelIndex,factor.health,mode==='Coop'));
  expect(kind==='charger'?e.mDamage:e.mAttackDamage).toBe(50*factor.damage*1.5);g.quit();}
});
it('double-charges below half health with a separate warning and new locked direction',()=>{
 const {g,w,e}=encounter();e.mLife=e.mMaxLife/2;expect(beginCharge(e)).toBe(true);expect(e.mBossChargesRemaining).toBe(1);
 const first=[e.mChargeX,e.mChargeY];e.mVariantPhase='recovery';e.mVariantTicks=1;placePlayer(g,5.5,12.5,0);
 e.State_VariantCharge();expect([e.mVariantPhase,e.mVariantTicks,e.mBossChargesRemaining]).toEqual(['warning',Math.ceil(CMain.mFPS*.6),0]);
 expect([e.mChargeX,e.mChargeY]).not.toEqual(first);const second=[e.mChargeX,e.mChargeY];placePlayer(g,9.5,8.5,0);
 for(let i=0;i<Math.ceil(CMain.mFPS*.6);i++)e.State_VariantCharge();expect([e.mChargeX,e.mChargeY]).toEqual(second);
 e.mVariantPhase='recovery';e.mVariantTicks=1;e.State_VariantCharge();expect(e.mStateID).toBe('State_GotoPlayer');expect(e.mVariantCooldown).toBe(w.mTick+CMain.mFPS*6);g.quit();
});
it('casts three independent marks at eight seconds, then six below half HP, with no overlapping damage',()=>{
 const {g,w,e}=encounter('priest');expect(beginBossCast(e)).toBe(true);expect(emberZones(w)).toHaveLength(3);expect(e.mVariantCooldown-w.mTick).toBe(8*CMain.mFPS);
 expect(new Set(emberZones(w).map(z=>[z.mPosition.mX,z.mPosition.mY].join(','))).size).toBe(3);
 const p=g.players()[0],z=emberZones(w)[0]!;for(const mark of emberZones(w))mark.mPosition=p.mPosition.Clone();
 w.mTick=z.born+z.warning;processEmberZones(w);expect(p.mAffectors).toHaveLength(1);
 w.mUpgrades.enemyVariantState.zones=[];w.mTick=e.mVariantCooldown;e.mLife=e.mMaxLife/2;
 expect(beginBossCast(e)).toBe(true);expect(e.mVariantCooldown-w.mTick).toBe(6*CMain.mFPS);g.quit();
});
it('keeps skill state on ordinary hits but lets a fatal hit enter death and double rewards immediately',()=>{
 const {g,w,e}=encounter();beginCharge(e);const angle=e.mAngle.mRadians;
 const affect=(damage:number)=>({mType:Thing.Affect.CThing_Affect.mAffect_Bullet,mAffector:g.players()[0],AffectThing(v:any){v.mLife-=damage;return damage;}});
 for(let i=0;i<3;i++){e.mAffectors=[affect(10)];e.ProcessAffects();expect(e.mStateID).toBe('State_VariantCharge');expect(e.mAngle.mRadians).toBe(angle);}
 e.lanFatalSlot=0;e.mAffectors=[affect(e.mLife+1)];e.ProcessAffects();expect(e.mStateID).toBe('State_Dying');
 w.mUpgrades.Process();expect(timedWave(w)!.phase).toBe('draft');expect(waveDraft(w)!.round!.multiplier).toBe(2);
 const score=w.mHud.nTotalScore;waveDraft(w)!.round!.remainingTicks=1;w.mUpgrades.Process();expect(waveDraft(w)!.bonuses[0].damage).toBe(2);
 w.mUpgrades.Process();expect(waveDraft(w)!.bonuses[0].damage).toBe(2);expect(w.mHud.nTotalScore).toBe(score);g.quit();
});
it('awards ordinary upgrades on timeout and gives last-tick all-player death priority over a Boss kill',()=>{
 const timeout=encounter();timedWave(timeout.w)!.remainingTicks=1;timeout.w.mUpgrades.Process();expect(waveDraft(timeout.w)!.round!.multiplier).toBe(1);timeout.g.quit();
 const {g,w,e}=encounter();timedWave(w)!.remainingTicks=1;e.mLife=0;e.CheckForDead();for(const p of g.players())p.mLife=0;
 w.mUpgrades.Process();expect(timedWave(w)!.phase).toBe('combat');expect(w.mUpgrades.mLevelIndex).toBe(5);expect(waveDraft(w)!.round).toBeUndefined();g.quit();
});
it.each(['charger','priest']as const)('restores %s health/skill/identity and snapshots rewards without duplication',kind=>{
 const {g,w,e}=encounter(kind);if(kind==='charger'){e.mLife=e.mMaxLife/2;beginCharge(e);}else beginBossCast(e);
 e.mLife-=17;e.mVariantTicks=7;timedWave(w)!.remainingTicks=123;const save=capture(w);
 expect(applyToWorld(w,JSON.parse(JSON.stringify(save)))).toBe(true);
 const next=g.things().find(t=>t.mBossKind&&t.Process);expect(next.mLife).toBe(e.mLife);expect(next.mVariantTicks).toBe(7);
 expect(timedWave(w)!.boss!.id).toBe(next.sUniqueID);expect(timedWave(w)!.remainingTicks).toBe(123);
 expect(copyTimedWave(w)!.boss).not.toBe(timedWave(w)!.boss);
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
 const finish=()=>{next.mLife=0;next.CheckForDead();w.mUpgrades.Process();waveDraft(w)!.round!.remainingTicks=1;w.mUpgrades.Process();};
 finish();const digest=simulationDigest(captureWorldSnap(w,ctx,false));restoreWorldSnap(w,slot,ctx);finish();
 expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);expect(waveDraft(w)!.bonuses[0].damage).toBe(2);g.quit();
});
it('rejects Boss saves on an incapable world before mutation and preserves classic timed limits',()=>{
 const {g,w}=encounter(),save=capture(w);g.quit();const old=createHeadlessGame({classicBossWaves:true}),world=old.world(),before=capture(world);
 expect(applyToWorld(world,save)).toBe(false);expect(capture(world)).toEqual(before);const normal=timedWave(world)!.totalTicks;
 world.mUpgrades.__set__mLevel(5);expect(timedWave(world)!.boss).toBeUndefined();expect(timedWave(world)!.totalTicks).toBe(normal);old.quit();
});
it('hides timed and draft overlays immediately on pause even when the world no longer draws',()=>{
 const {g,w,e}=encounter();w.mHud.Draw(w.bmDraw);expect(w._BossHealthHud._visible).toBe(true);
 expect(w._BossWaveHud).toBeUndefined();expect(w._TimedWaveHud).toBeUndefined();
 expect(w._LanGrowthHud._Wave._Clock.text).toMatch(/^\d+:\d{2}$/);
 w.mHud.Pause(true);expect(w._BossHealthHud._visible).toBe(false);expect(w._LanGrowthHud._visible).toBe(false);
 w.mHud.Pause(false);w.mHud.Draw(w.bmDraw);expect(w._BossHealthHud._visible).toBe(true);
 e.mLife=0;e.CheckForDead();w.mUpgrades.Process();w.mHud.Draw(w.bmDraw);expect(w._WaveDraftHud._visible).toBe(true);
 w.mHud.Pause(true);expect(w._WaveDraftHud._visible).toBe(false);g.quit();
});
it('keeps LAN Boss HP in confirmed metadata, independent of speculative changes',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
 s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:17,netcode:'rollback-v2',cfg:{
  difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:1,
  progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',balance:'pve-balance-v1',
  endless:'endless-pve-v1',variants:'enemy-variants-v1',timedWaves:'timed-waves-v1',waveDraft:'wave-draft-v1',bossWaves:'boss-waves-v1'}},g.main());
 expect(g.waitRunning(3000)).toBe(true);const w=g.world();w.mUpgrades.__set__mLevel(5);const tick=s.tickIndex(w);s.tickMeta.set(tick,{});s.executeWorldStep(w,tick);
 const recorded=s.tickMeta.get(tick).timedWave.boss;expect(recorded.kind).toBe('charger');timedWave(w)!.boss!.life=234;
 expect(recorded.life).not.toBe(234);expect(s.confirmedTimedWave?.boss).toBeUndefined();g.quit();
});

it('uses a compact numeric-free bar at all health scales, keeping tiny living slivers visible',()=>{
 const {g,w}=encounter();try{const boss=timedWave(w)!.boss!;
 DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.RenderStack_Process(0,Infinity);
 for(const maximum of [6000,1e12,Number.MAX_SAFE_INTEGER]){
  const state={...boss,maximum,life:maximum/2};expect(bossHealthLayout(w,state)!.fraction).toBe(.5);
  drawBossHealth(w,{...state,life:.01},true);expect(w._BossHealthHud._visible).toBe(true);
  expect(w._BossHealthHud._Health).toBeUndefined();expect(bossHealthLayout(w,state)!.width).toBe(64);
 }
 }finally{g.quit();}
});

it.each(['charger','priest']as const)('anchors %s health above its art, follows the camera and hides on lifecycle transitions',kind=>{
 const {g,w,e}=encounter(kind);
 try{
  const boss=timedWave(w)!.boss!;e.mLife=boss.life=boss.maximum/2;
  DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.RenderStack_Process(0,Infinity);
  const ctx=makeSnapCtx(w),digest=()=>simulationDigest(captureWorldSnap(w,ctx,false));
  const before=digest(),keys=Object.keys(e),layout=bossHealthLayout(w,boss)!;
  expect(layout).toBeDefined();expect(layout.fraction).toBe(.5);
  expect(layout.y+layout.height+5).toBeLessThanOrEqual(layout.headTop);
  drawBossHealth(w,boss,true);const layer=w._BossHealthHud;
  expect(layer._visible).toBe(true);expect(layer._Health).toBeUndefined();
  expect(Object.keys(e)).toEqual(keys);expect(digest()).toEqual(before);
  const oldCamera=w.mDrawPosition.clone();w.mDrawPosition.x-=7;w.mDrawPosition.y-=9;
  const moved=bossHealthLayout(w,boss)!;
  expect([moved.x-layout.x,moved.y-layout.y]).toEqual([7,9]);
  w.mDrawPosition=oldCamera;
  w.mHud.Pause(true);expect(layer._visible).toBe(false);
  w.mHud.Pause(false);w.mHud.Draw(w.bmDraw);expect(layer._visible).toBe(true);
  const x=e.mPosition.mX;e.mPosition.mX=-100;w.mHud.Draw(w.bmDraw);expect(layer._visible).toBe(false);e.mPosition.mX=x;
  e.mLife=0;e.CheckForDead();w.mUpgrades.Process();w.mHud.Draw(w.bmDraw);expect(layer._visible).toBe(false);
 }finally{g.quit();}
});

it('renders supplied confirmed Boss HP without leaking speculative damage or a new entity identity',()=>{
 const {g,w,e}=encounter();
 try{
  const confirmed=copyTimedWave(w)!.boss!;confirmed.life=4321;
  DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.RenderStack_Process(0,Infinity);
  const ctx=makeSnapCtx(w),digest=()=>simulationDigest(captureWorldSnap(w,ctx,false)),before=digest();
  e.mLife=1;timedWave(w)!.boss!.life=1;
  drawBossHealth(w,confirmed,true);
  expect(w._BossHealthHud._visible).toBe(true);expect(w._BossHealthHud._Health).toBeUndefined();
  expect(bossHealthLayout(w,confirmed)!.fraction).toBe(4321/6000);
  const changed=digest();drawBossHealth(w,confirmed,true);expect(digest()).toEqual(changed);
  expect(changed).not.toEqual(before);
  drawBossHealth(w,{...confirmed,id:'not-this-boss'},true);expect(w._BossHealthHud._visible).toBe(false);
  drawBossHealth(w,confirmed,false);expect(w._BossHealthHud._visible).toBe(false);
 }finally{g.quit();}
});
