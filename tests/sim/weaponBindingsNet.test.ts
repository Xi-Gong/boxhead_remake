import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {applyCorrections} from '../../src/game/local/Net/Rollback.ts';
import {bindingsFor,queueWeaponCommand} from '../../src/game/local/WeaponBindings.ts';
import type {GameConfig,LanMessage} from '../../src/game/local/Net/protocol.ts';
const cfg:GameConfig={difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:1,
 progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',balance:'pve-balance-v1',endless:'endless-pve-v1',variants:'enemy-variants-v1',enchantment:'persistent-enchantment-v1',
 timedWaves:'timed-waves-v1',waveDraft:'wave-draft-v1',draftReady:'draft-ready-v1',tieredGrowth:'tiered-growth-v1',clearWaves:'clearable-waves-v1',combat:'combat-pve-v3',features:['empty-weapons-v1','weapon-bindings-v1']};
it('replays a late one-shot binding even when its seven-bit input was predicted correctly, without repeating it',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),sent:LanMessage[]=[],s=new NetSession(0,{send:m=>sent.push(m)});
 try{
  s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',cfg,seed:17,netcode:'rollback-v2'},g.main());expect(g.waitRunning(3000)).toBe(true);const w=g.world();
  s.onNetMessage({t:'in',tick:0,bits:0});
  expect(g.stepUntil(()=>s.tickIndex(w)>=4,100)).toBe(true);expect(bindingsFor(w,1)).toEqual({});
  s.onNetMessage({t:'in',tick:1,bits:0,weaponCommands:[{action:'bind',button:'Y',weapon:'pistol'}]});
  expect(s.correctionPending).toBe(1);applyCorrections(s,w);expect(bindingsFor(w,1)).toEqual({Y:'pistol'});
  const head=s.tickIndex(w);for(let tick=2;tick<=head+2;tick++)s.onNetMessage({t:'in',tick,bits:0});
  expect(g.stepUntil(()=>s.tickIndex(w)>head,100)).toBe(true);expect(bindingsFor(w,1)).toEqual({Y:'pistol'});
  queueWeaponCommand(w,0,{action:'bind',button:'A',weapon:'pistol'});expect(g.stepUntil(()=>bindingsFor(w,0).A==='pistol',100)).toBe(true);
  const original=sent.find((m:any)=>m.t==='in'&&m.weaponCommands?.length)as any;expect(original.weaponCommands).toEqual([{action:'bind',button:'A',weapon:'pistol'}]);
  const count=sent.length;s.onNetMessage({t:'input-gap',need:original.tick});expect(sent.slice(count)).toContainEqual(original);
  s.onNetMessage({t:'in',tick:original.tick+1,bits:0,weaponCommands:[{action:'bind',button:'A',weapon:'invalid'}]as any});
  expect((s as any).remoteWeaponCommands.has(original.tick+1)).toBe(false);
 }finally{g.quit();}
});
