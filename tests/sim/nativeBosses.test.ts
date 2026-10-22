import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing,World} from '../../src/game/packages.ts';
import {clearWaveCombat,timedWave,attemptTimedSpawn} from '../../src/game/local/TimedWaves.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {getRandomState} from '../../src/engine/flash/rng.ts';
import {bossHealthLayout,drawBossHealth} from '../../src/game/local/BossHealthUi.ts';
import {DrawPrimitive} from '../../src/game/packages.ts';

it('matches the raised native Boss strip to the authored player health height',()=>{
 const g=createHeadlessGame(),w=g.world();try{
  clearWaveCombat(w);w.mUpgrades.__set__mLevel(5);expect(attemptTimedSpawn(w,'Devil','boss')).toBe(true);g.tick(1);
  const boss=timedWave(w)!.boss!.members![0]!,enemy=w.mThing_Collection.mThings[boss.id!];enemy.Move(g.players()[0].mPosition.Clone());enemy.SetState('State_GotoPlayer');
  DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.RenderStack_Process(0,Infinity);
  const layout=bossHealthLayout(w,boss)!;expect(layout).toBeDefined();
  const head=w.mHud.mcPlayers[0],life=head.mcLife.getBounds(head);expect(layout.width).toBe(36);expect(layout.height).toBe(life.yMax-life.yMin);
  expect(layout.y+layout.height+3).toBeLessThanOrEqual(layout.headTop);
  drawBossHealth(w,timedWave(w)!.boss!,true);const bar=w._BossHealthHud._Boss0,b=bar.getBounds(bar);expect(b.yMax-b.yMin).toBe(layout.height);expect(b.xMax-b.xMin).toBe(layout.width);
 }finally{g.quit();}
});

it('spawns only native families at high waves, with no variant bookkeeping or extra charger loot draw',()=>{
 const g=createHeadlessGame(),w=g.world();try{
  clearWaveCombat(w);w.mUpgrades.__set__mLevel(36);w.Spawn_ValidPosition=()=>({mPosition:g.players()[0].mPosition.Clone()});Object.assign(timedWave(w)!.clear!,{zombies:1000,devils:1000});
  for(const family of ['Zombie','Devil'])for(let n=0;n<40;n++){w.mUpgrades.Level['m'+family+'Count']=0;expect(World.CWorld.prototype['Spawn_'+family].call(w)).toBe(true);}
  expect(g.things().filter(e=>/CThing_Creature_(Zombie|Devil)$/.test(e._CLASSID_)).every(e=>!e.mEnemyVariant&&!e.mCombatKind)).toBe(true);
  expect([w.mUpgrades.enemyVariantState.zombie,w.mUpgrades.enemyVariantState.devil]).toEqual([0,0]);
 }finally{g.quit();}
 const results=[];for(const stale of [false,true]){const game=createHeadlessGame({seed:4242});try{
  const world=game.world(),e:any=new Thing.Creature.CThing_Creature_Zombie(game.players()[0].mPosition.Clone());world.mThing_Collection.AddThing(e);e.Process_Init();if(stale)e.mEnemyVariant='charger';e.mLife=0;world.LogKill(e);results.push(getRandomState());
 }finally{game.quit();}}expect(results[0]).toBe(results[1]);
});
it.each([0,1]as const)('uses 1–3 native Bosses when devils=%s, with no charger and only two ordinary adds',devils=>{
 const g=createHeadlessGame({classicFeatures:['horde-balance-v1'],options:{devils}}),w=g.world();try{
  for(const [wave,count]of [[5,1],[15,2],[25,3]]){
   clearWaveCombat(w);w.mUpgrades.__set__mLevel(wave);const boss=timedWave(w)!.boss!;expect(boss.members!.map(m=>m.kind)).toEqual(Array(count).fill(devils?'devil':'zombie'));
   for(let n=0;n<count;n++){w.mUpgrades.ProcessTimedSpawns();g.tick(1);}
   const enemies=g.things().filter(e=>e.Process&&e.mLife>0&&e.mBossKind);expect(enemies).toHaveLength(count);expect(enemies.every(e=>!e.mEnemyVariant&&!e.mCombatKind)).toBe(true);
   for(let n=0;n<80;n++){boss.reinforcementTicks=1;w.mUpgrades.ProcessTimedSpawns();g.tick(1);}
   expect(g.things().filter(e=>e.Process&&e.mLife>0&&e._CLASSID_==='CThing_Creature_Zombie'&&!e.mBossKind),`wave ${wave}, cap ${w.mUpgrades.Level.Zombie_Count}, living ${w.mUpgrades.Level.mZombieCount}`).toHaveLength(2);
  }
 }finally{g.quit();}
});
it('independently buffs movement, attack progression and damage while preserving projectile speed and range',()=>{
 let base:any;for(const modern of [false,true]){
  const g=createHeadlessGame({classicFeatures:modern?['horde-balance-v1']:['native-bosses-v1','horde-balance-v1']}),w=g.world();try{
   clearWaveCombat(w);w.mUpgrades.__set__mLevel(10);expect(attemptTimedSpawn(w,'Devil','boss')).toBe(true);g.tick(1);const e=g.things().find(e=>e.Process&&e.mBossKind)!;
   if(!modern)base={speed:e.mSpeed,damage:e.mAttackDamage,projectile:e.mAttackSpeed,range:e.mAttackRange,step:Math.min(.2*(e.mSpeed*25*1.5),1)};
   else{expect(e.mSpeed).toBeCloseTo(base.speed*1.15);expect(e.mAttackDamage).toBeCloseTo(base.damage*1.10);expect(e.mAttackSpeed).toBe(base.projectile);expect(e.mAttackRange).toBe(base.range);
    let step=0;e.mXSI_Animation.Animate_RetObj=(n:number)=>(step=n,{mNewFrame:false,mAnimEnd:false});e.State_Attack();expect(step).toBeCloseTo(Math.min(1,base.step*1.15));expect(e.mSpeed).toBeCloseTo(base.speed*1.15);}
  }finally{g.quit();}
 }
});
it.each([0,1]as const)('converts saved charger Boss members once preserving HP fraction, slots, clocks and RNG (devils=%s)',devils=>{
 const old=createHeadlessGame({classicFeatures:['native-bosses-v1','horde-balance-v1'],options:{devils}}),w=old.world();let saved:any;
 try{clearWaveCombat(w);w.mUpgrades.__set__mLevel(25);for(let n=0;n<3;n++){w.mUpgrades.ProcessTimedSpawns();old.tick(1);}for(const e of old.things().filter(e=>e.mBossKind)){e.mLife=e.mMaxLife*.3;}timedWave(w)!.remainingTicks=1234;saved=capture(w);}finally{old.quit();}
 const g=createHeadlessGame({classicFeatures:['horde-balance-v1'],options:{devils}});try{
  expect(applyToWorld(g.world(),saved)).toBe(true);expect(timedWave(g.world())!.remainingTicks).toBe(1234);expect(getRandomState()).toBe(saved.rngState);
  const members=timedWave(g.world())!.boss!.members!;expect(members.map(m=>m.kind)).toEqual(Array(3).fill(devils?'devil':'zombie'));
  for(const [index,m]of members.entries()){const e=g.world().mThing_Collection.mThings[m.id!];expect(e.mBossSlot).toBe(index);expect(e.mLife/e.mMaxLife).toBeCloseTo(.3);expect(e.mEnemyVariant).toBeUndefined();expect(e.mVariantPhase).toBeUndefined();}
  const next=capture(g.world());expect(applyToWorld(g.world(),next)).toBe(true);expect(capture(g.world()).variants!.enemies.map(e=>e.kind)).toEqual(Array(3).fill(devils?'devil':'zombie'));
 }finally{g.quit();}
});
