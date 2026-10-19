import { expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { noSpawn } from './fxkit.ts';
import { hudMessageRows } from '../../src/game/local/Net/HudMessages.ts';
import { advanceVirtual } from '../../src/engine/flash/clock.ts';
import { makeSnapCtx, captureWorldSnap, restoreWorldSnap } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';

it('bounds the display stack, identifies players, and ages it independently of drawing frequency',()=>{
  const g=createHeadlessGame({mode:'Single'});noSpawn(g);const w=g.world(),h=w.mHud;
  for(let n=1;n<=4;n++)h.AddMessage_Info('ammo '+n,0);
  expect(h.mMessages).toHaveLength(0);
  expect(hudMessageRows(h).map(r=>r.text)).toEqual(['P1: ammo 2','P1: ammo 3','P1: ammo 4']);
  advanceVirtual(160);w.Draw();const settled=hudMessageRows(h);
  expect(settled.map(r=>r.y)).toEqual([-44,-22,0]);
  for(let n=0;n<20;n++)w.Draw();expect(hudMessageRows(h)).toEqual(settled);
  advanceVirtual(2500);w.Draw();expect(hudMessageRows(h).every(r=>r.alpha===68)).toBe(true);
  advanceVirtual(400);w.Draw();expect(hudMessageRows(h)).toEqual([]);g.quit();
});
it('snapshot correction cannot rewind message motion or reset its lifetime',()=>{
  const g=createHeadlessGame({mode:'Single'});noSpawn(g);const w=g.world(),h=w.mHud;
  h.AddMessage_Info('All ammo full!',0);const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false);
  const slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  advanceVirtual(80);w.Draw();const before=hudMessageRows(h).at(-1)!;
  restoreWorldSnap(w,slot,ctx);advanceVirtual(40);w.Draw();const after=hudMessageRows(h).at(-1)!;
  expect(after.age).toBe(before.age+40);expect(after.y).toBeLessThan(before.y);
  expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(simulationDigest(data));g.quit();
});
it('pause freezes display time and disposal releases the queue',()=>{
  const g=createHeadlessGame({mode:'Single'});noSpawn(g);const w=g.world(),h=w.mHud;
  h.AddMessage_Info('Health full!',0);advanceVirtual(100);w.Draw();h.Pause(true);const paused=hudMessageRows(h);
  advanceVirtual(5000);w.Draw();expect(hudMessageRows(h)).toEqual(paused);
  h.Pause(false);advanceVirtual(100);w.Draw();expect(hudMessageRows(h).at(-1)!.age).toBe(paused.at(-1)!.age+100);
  h.Dispose();expect(hudMessageRows(h)).toEqual([]);g.quit();
});
it('only confirms the final replayed notification once',()=>{
  const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(0,{send(){}});
  s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:3000,netcode:'rollback-v2',cfg:{
    progression:'personal-growth-v1',difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0}},g.main());
  expect(g.waitRunning()).toBe(true);const h=g.world().mHud;
  s.messages.begin(0);s.soundRecordingTick=0;h.AddMessage_Info('wrong prediction',1);s.messages.discardFrom(0);
  s.messages.begin(0);h.AddMessage_Info('Shotgun ammo full!',1);s.soundRecordingTick=undefined;
  expect(hudMessageRows(h).some(r=>r.text.includes('Shotgun'))).toBe(false);
  s.messages.confirm(0);
  expect(hudMessageRows(h).filter(r=>r.text==='P2: Shotgun ammo full!')).toHaveLength(1);
  expect(hudMessageRows(h).some(r=>r.text.includes('wrong prediction'))).toBe(false);
  expect(s.messages.confirmedCount).toBe(1);g.quit();
});
