import './headless.ts';
import '../../src/game/allClasses.ts';
import {expect,it} from 'vitest';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';

function session(){
 const s=new NetSession(0,{send(){}});
 (s as any).world={mTick:100};(s as any).startTick=0;
 s.startOpts={mode:'Coop',roomLink:'ROOM_Single_0001',seed:0,cfg:{difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0,features:['weapon-bindings-v1']}};
 return s;
}
it('does not retain unbounded ancient or far-future remote inputs, commands and checksums while simulation is frozen',()=>{
 const s=session();try{
  for(let n=0;n<5000;n++)s.onNetMessage({t:'in',tick:1e6+n,bits:0,weaponCommands:[{action:'select',button:'A'}],sum:{tick:2e6+n,score:0,things:0,zombies:0,q:[0,0,0,0,0,0]}});
  s.onNetMessage({t:'in',tick:0,bits:0});
  expect((s as any).remoteFrames.size).toBe(0);expect((s as any).remoteWeaponCommands.size).toBe(0);expect((s as any).remoteSums.size).toBe(0);
  s.onNetMessage({t:'in',tick:100,bits:16});s.onNetMessage({t:'in',tick:101,bits:0});
  expect([...(s as any).remoteFrames]).toEqual([[100,16],[101,0]]);
 }finally{s.dispose();}
});
it('validates UDP/direct-session input and bounds piggybacked checksum ticks independently',()=>{
 const s=session();try{
  for(const message of [{t:'in',tick:-1,bits:0},{t:'in',tick:NaN,bits:0},{t:'in',tick:100,bits:128},{t:'in',tick:100,bits:'0'}])s.onNetMessage(message as any);
  expect((s as any).remoteFrames.size).toBe(0);
  s.onNetMessage({t:'in',tick:100,bits:0,sum:{tick:1e9,score:0,things:0,zombies:0,q:[0,0,0,0,0,0]}});
  expect((s as any).remoteFrames.get(100)).toBe(0);expect((s as any).remoteSums.size).toBe(0);
 }finally{s.dispose();}
});
