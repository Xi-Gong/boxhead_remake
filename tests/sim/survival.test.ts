import { expect, it } from 'vitest';
import { createHeadlessGame, KEYS } from './harness.ts';
import { noSpawn, addZombie, placePlayer, recordAdds } from './fxkit.ts';
import { CMain, Thing } from '../../src/game/packages.ts';
import { growthOf } from '../../src/game/local/Net/Growth.ts';
import { playerMaximum, survivalEnabled, syncVitals } from '../../src/game/local/SurvivalRules.ts';
import { armorMaximum, armorValue, refillArmor } from '../../src/game/local/Supplies.ts';
import { capture, applyToWorld } from '../../src/game/local/Resume.ts';
import { captureWorldSnap, makeSnapCtx, restoreWorldSnap } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import { getRandomState } from '../../src/engine/flash/rng.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';

function boot() {
  const game=createHeadlessGame({mode:'Coop'});noSpawn(game);const p=placePlayer(game,6.5,8.5,0);
  p.mInvincible=0;return {game,p,w:game.world()};
}
function attack(p:any,damage:number,fire=false){
  const enemy={mPosition:p.mPosition.Add(new Thing.Math.CThing_Position(1,0,0)),mAngle:new Thing.Math.CThing_Angle(0)};
  return fire?new Thing.Affect.CThing_Affect_FireBall(enemy,enemy,damage,enemy.mAngle):new Thing.Affect.CThing_Affect_ZombieAttack(enemy,damage);
}
it.each([[1,200],[50,396],[125,696]])('level %i has health and armor cap %i; pickups never heal', (level,max)=>{
  const {game,p,w}=boot();growthOf(w)!.players[0].level=level!;syncVitals(p,'full');
  expect([p.mMaxLife,p.mLife,playerMaximum(p),armorMaximum(p)]).toEqual([max,max,max,max]);
  p.mLife=73;refillArmor(p);expect(p.mArmor).toBe(max);expect(p.mLife).toBe(73);game.quit();
});
it('actual fresh difficulty starts get full scaled health while old saves keep current health',()=>{
  const g=createHeadlessGame({mode:'Single',difficulty:2}),p=g.players()[0];
  expect(p.mMaxLife).toBe(468);expect(p.mLife).toBe(468);expect(p.mArmor).toBeUndefined();
  const snap=capture(g.world());delete snap.survival;snap.players[0]!.life=73;snap.players[0]!.maxLife=200;
  expect(applyToWorld(g.world(),snap)).toBe(true);expect(p.mMaxLife).toBe(468);expect(p.mLife).toBe(73);g.quit();
});
it('living upgrades add only the health-cap delta, dead upgrades never resurrect and shield does not refill',()=>{
  const {game,p,w}=boot(),state=growthOf(w)!;state.players[0].xp=4;p.mLife=73;p.mArmor=37;
  const kill=()=>{const z=addZombie(game,12.5,8.5);z.Process_Init();z.mLife=0;z.lanFatalSlot=0;w.LogKill(z);z.Delete();};
  kill();expect(state.players[0].level).toBe(2);expect([p.mLife,p.mMaxLife,p.mArmor]).toEqual([77,204,37]);
  state.players[0].xp=4;p.mLife=-5;kill();expect([p.mLife,p.mMaxLife,p.mArmor]).toEqual([-5,208,37]);game.quit();
});
it.each([false,true])('protected %s fireball attack does not interrupt, turn, stagger or knock back even when breaking shield',fire=>{
  const {game,p}=boot();p.mLife=137;p.mArmor=20;p.mStateCount=7;
  const before={state:p.mStateID,returnState:p.mReturnStateID,delta:p.mDelta,angle:p.mAngle.mRadians,fState:p.fState,cell:p.mNewCell};
  p.mAffectors=[attack(p,50,fire)];const rng=getRandomState();p.ProcessAffects();
  expect([p.mLife,p.mArmor]).toEqual([107,0]);expect(p.mStateID).toBe(before.state);expect(p.fState).toBe(before.fState);
  expect(p.mReturnStateID).toBe(before.returnState);expect(p.mDelta).toBe(before.delta);expect(p.mAngle.mRadians).toBe(before.angle);
  expect(p.mStateCount).toBe(7);expect(p.mNewCell).toBe(before.cell);expect(p.mAffectors).toEqual([]);expect(getRandomState()).toBe(rng);
  p.mAffectors=[attack(p,10,fire)];p.ProcessAffects();expect(p.mStateID).toBe(fire?'State_BulletHit':'State_ZombieHit');game.quit();
});
it('each affect rechecks shield within one batch; later unshielded hits use original reactions',()=>{
  const {game,p}=boot();p.mLife=137;p.mArmor=20;p.mAffectors=[attack(p,30),attack(p,30)];p.ProcessAffects();
  expect([p.mLife,p.mArmor]).toEqual([97,0]);expect(p.mStateID).toBe('State_ZombieHit');game.quit();
});
it('a protected fatal hit still uses the normal death route and kill bookkeeping once',()=>{
  const {game,p,w}=boot();p.mLife=5;p.mArmor=5;const count=w.mUpgrades.mPlayerCount;
  p.mAffectors=[attack(p,50,true)];p.ProcessAffects();expect(p.mLife).toBe(-40);expect(p.mStateID).toBe('State_Dying');
  expect(w.mUpgrades.mPlayerCount).toBe(count-1);expect(p.mAffectors).toEqual([]);expect(game.errors).toEqual([]);game.quit();
});
it('invincibility and friendly weapon reactions retain their separate original rules',()=>{
  const {game,p}=boot();refillArmor(p);p.mLife=137;p.mInvincible=3;p.mAffectors=[attack(p,50)];p.ProcessAffects();
  expect([p.mLife,p.mArmor,p.mStateID]).toEqual([137,200,'State_PlayerControl']);p.mInvincible=0;
  const enemy=attack(p,30).mOwner;p.mAffectors=[new Thing.Affect.CThing_Affect_Bullet(enemy,enemy,30,enemy.mAngle)];p.ProcessAffects();
  expect([p.mLife,p.mArmor,p.mStateID]).toEqual([137,170,'State_BulletHit']);game.quit();
});
it('keeps shooting and moving while repeated shielded enemy hits arrive',()=>{
  const {game,p,w}=boot();growthOf(w)!.players[0].level=50;syncVitals(p,'full');refillArmor(p);p.NewWeapon('uzi');p.SelectWeapon('uzi');
  const adds=recordAdds(game),start=p.mPosition.mX;game.keyDown(KEYS.P1.FIRE);game.keyDown(KEYS.P1.RIGHT);
  for(let i=0;i<12;i++){p.mAffectors.push(attack(p,10,i%2===0));game.tick(1);expect(p.mStateID).toBe('State_PlayerControl');}
  expect(p.mPosition.mX).toBeGreaterThan(start);expect(p.mArmor).toBe(276);
  expect(adds.filter(t=>t._CLASSID_==='CThing_Shot_Bullet').length).toBeGreaterThan(2);expect(game.errors).toEqual([]);game.quit();
});
it('retains the original regeneration formula at the new health cap',()=>{
  const {game,p,w}=boot();growthOf(w)!.players[0].level=50;syncVitals(p,'full');p.mLife=73;p.mArmor=13;
  for(let i=0;i<20;i++)p.State_PlayerControl();expect(p.mLife).toBeCloseTo(73+20*396/(CMain.mFPS*30),10);expect(p.mArmor).toBe(13);game.quit();
});
it('cooperative respawn keeps level and restores full scaled health with empty shield',()=>{
  const {game,p,w}=boot();growthOf(w)!.players[0].level=50;syncVitals(p,'full');p.mArmor=12;p.mLife=-5;
  p.SetState('State_Dying');p.SetState('State_Respawn');p.mStateCount=0;p.State_Respawn();
  expect(p.mStateID).toBe('State_PlayerControl');expect([p.mLife,p.mMaxLife,armorValue(p.mArmor)]).toEqual([396,396,0]);
  expect(growthOf(w)!.players[0].level).toBe(50);game.quit();
});
it('saves and rolls back high shield values and protected reaction state without truncation',()=>{
  const {game,p,w}=boot();growthOf(w)!.players[0].level=125;syncVitals(p,'full');p.mLife=523;p.mArmor=650;
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  const before=simulationDigest(data);p.mAffectors=[attack(p,50)];p.ProcessAffects();expect(p.mArmor).toBe(600);
  restoreWorldSnap(w,slot,ctx);expect(p.mArmor).toBe(650);expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(before);
  const snap=capture(w);expect(snap.survival).toBe('survival-v1');expect(snap.players[0]!.armor).toBe(650);
  p.mArmor=0;p.mLife=4;expect(applyToWorld(w,snap)).toBe(true);expect([p.mLife,p.mMaxLife,p.mArmor]).toEqual([523,696,650]);game.quit();
});
it.each([false,true])('LAN survival capability %s keeps old peers unchanged and enables modern scaled vitals',modern=>{
  const game=createHeadlessGame({menuOnly:'Main'}),session=new NetSession(0,{send(){}});
  session.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,wave:20,netcode:'rollback-v2',
    cfg:{progression:'personal-growth-v1',supplies:'armor-ammo-v1',balance:'pve-balance-v1',...(modern?{survival:'survival-v1' as const}:{}),
      difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},game.main());
  expect(game.waitRunning(3000)).toBe(true);const p=game.players()[0];refillArmor(p);expect(survivalEnabled(game.world())).toBe(modern);
  expect([p.mMaxLife,p.mLife,p.mArmor]).toEqual(modern?[380,380,380]:[200,200,100]);
  expect(session.netCheckpoint?.snap.survival).toBe(modern?'survival-v1':undefined);
});
it('deathmatch and explicit classic fixtures retain the original health and shield rules',()=>{
  for(const options of [{mode:'DeathMatch' as const},{mode:'Coop' as const,classicGrowth:true}]){
    const game=createHeadlessGame({...options,difficulty:3});expect(survivalEnabled(game.world())).toBe(false);expect(game.players()[0].mMaxLife).toBe(200);game.quit();
  }
});
