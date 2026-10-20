import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {CMain} from '../../src/game/packages.ts';
import {beginWaveDraft,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {statsOpen,toggleStats,statsKeys,beginStatsBinding} from '../../src/game/local/DraftStatsInput.ts';
import {capturePlayerStats} from '../../src/game/local/PlayerStats.ts';
import {capture} from '../../src/game/local/Resume.ts';
import {queueDraftCommand} from '../../src/game/local/WaveDraftInput.ts';
import {DRAFT_CONFIRM,encodeDraftSelection} from '../../src/game/local/WaveDraftRules.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {rewardPreview} from '../../src/game/local/WaveDraftUi.ts';

it('opens sheets independently and prevents fire/navigation while inspecting without changing simulation state',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();beginWaveDraft(w);const save=capture(w);
 g.keyDown(9);g.keyUp(9);expect(statsOpen(w,0)).toBe(true);expect(statsOpen(w,1)).toBe(false);
 expect(capture(w)).toEqual(save);
 g.keyDown(KEYS.P1.DOWN);g.keyDown(KEYS.P1.FIRE);g.tick(1);expect(waveDraft(w)!.round!.selected).toEqual([0,0]);
 expect(waveDraft(w)!.round!.confirmed).toEqual([false,false]);
 g.keyDown(KEYS.P2.DOWN);g.tick(1);g.keyUp(KEYS.P2.DOWN);expect(waveDraft(w)!.round!.selected[1]).toBe(1);
 toggleStats(w,0);g.tick(1);expect(waveDraft(w)!.round!.confirmed[0]).toBe(false);
 g.keyUp(KEYS.P1.DOWN);g.keyUp(KEYS.P1.FIRE);g.tick(1);g.keyDown(KEYS.P1.FIRE);g.tick(1);
 expect(waveDraft(w)!.round!.confirmed[0]).toBe(true);g.quit();
});
it('keeps mouse selection distinct from readiness and queues both actions in order',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();beginWaveDraft(w);
 queueDraftCommand(w,1,encodeDraftSelection(2),1);queueDraftCommand(w,1,DRAFT_CONFIRM,1);
 g.tick(1);expect(waveDraft(w)!.round!.selected[1]).toBe(2);expect(waveDraft(w)!.round!.confirmed[1]).toBe(false);
 g.tick(1);expect(waveDraft(w)!.round!.confirmed).toEqual([false,true]);g.quit();
});
it('persists an inspection shortcut and rejects gameplay key conflicts',()=>{
 const g=createHeadlessGame(),w=g.world();beginWaveDraft(w);toggleStats(w,0);beginStatsBinding(w,0);
 g.keyDown(KEYS.P1.FIRE);g.keyUp(KEYS.P1.FIRE);expect(statsKeys()[0]).toBe(9);
 g.keyDown(84);g.keyUp(84);expect(statsKeys()[0]).toBe(84);
 g.keyDown(84);g.keyUp(84);expect(statsOpen(w,0)).toBe(false);g.quit();
});
it('captures actual finite weapon stats and keeps LAN sheets on confirmed values',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(1,{send(){}});
 s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:17,netcode:'rollback-v2',cfg:{
  difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:1,
  progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',
  balance:'pve-balance-v1',endless:'endless-pve-v1',timedWaves:'timed-waves-v1',waveDraft:'wave-draft-v1',draftReady:'draft-ready-v1'}},g.main());
 expect(g.waitRunning(3000)).toBe(true);const w=g.world(),p=g.players()[1];
 const before=s.confirmedPlayerStats!.find(x=>x.index===1)!.life;p.mLife=77;
 const tick=s.tickIndex(w);s.tickMeta.set(tick,{});s.executeWorldStep(w,tick);
 expect(s.confirmedPlayerStats!.find(x=>x.index===1)!.life).toBe(before);
 expect(s.tickMeta.get(tick).playerStats.find((x:any)=>x.index===1).life).toBeLessThan(78);
 s.confirmTick=tick;s.commitConfirmed(w);expect(s.confirmedPlayerStats!.find(x=>x.index===1)!.life).toBeLessThan(78);
 p.NewWeapon('uzi');p.mWeapon_Current=p.mWeapons.uzi.mThing;
 const stats=capturePlayerStats(w).find(x=>x.index===1)!;expect(stats.capacity).toBe(p.mWeapon_Current.mTotalAmmo);expect(stats.damage).toBe(p.mWeapon_Current.mDamage);
 beginWaveDraft(w);g.keyDown(9);g.keyUp(9);expect(statsOpen(w,1)).toBe(true);expect(statsOpen(w,0)).toBe(false);g.quit();
});
it('does not label finite sentinel-sized magazines infinite and keeps shortcut defaults off rebound controls',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];p.NewWeapon('uzi');p.mWeapon_Current=p.mWeapons.uzi.mThing;
 p.mWeapon_Current.mTotalAmmo=999999;const s=capturePlayerStats(w)[0]!;
 expect(s.infinite).toBe(false);expect(rewardPreview(s,'capacity',1)).not.toMatch(/\bINF\b|FINITE WEAPONS/);
 CMain.mInput.KEY_FIRE2=CMain.mInput.mKey_List[82];expect(statsKeys()[1]).not.toBe(82);g.quit();
});
