import {expect,it} from 'vitest';
import {LanTransport} from '../../../electron/lan.ts';
import type {LanMessage} from '../../../src/game/local/Net/protocol.ts';
const cfg={difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0};
const snapshot=()=>({version:2,gameMode:'Coop',roomLibLink:'ROOM_Single_0001',wave:1,tick:1,rngState:42,score:0,multiplierIndex:1,multiplierTick:50,multiplierTickTotal:50,multipleKillsIndex:0,multipleKillsTick:0,multipleKillsTickTotal:0,
 waveCounters:{spawnZombie:1,spawnDevil:1,zombieCount:2,zombieTotal:0,devilCount:0,devilTotal:0,playerCount:2},players:[],
 objects:Array.from({length:600},(_,i)=>({classID:'CThing_Object_SupplyCrate',origin:'placed',x:5.5,y:5.5,angle:0,supply:{kind:'armor',id:'s'+i}}))});
it('transfers a checkpoint with 600 permanent crates intact over the real negotiated TCP link',async()=>{
 const host=new LanTransport({identity:'large-test'}),client=new LanTransport({identity:'large-test'}),received:LanMessage[]=[];
 client.onMessage(m=>received.push(m));try{
  const port=await host.startHost();expect((await client.connect('127.0.0.1',{name:'client',char:0},port)).ok).toBe(true);
  const message:LanMessage={t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',cfg,seed:42,resumeTick:0,snap:snapshot()};
  host.send(message);
  for(let n=0;n<100&&!received.some(m=>m.t==='start');n++)await new Promise(r=>setTimeout(r,20));
  expect(received.find(m=>m.t==='start')).toMatchObject(message);expect(host.hasPeer&&client.hasPeer).toBe(true);
 }finally{host.shutdown();client.shutdown();}
});
it.each([[false,true],[true,false],[false,false]])('retains the legacy single-frame path when either endpoint lacks the capability (%s/%s)',async(hostCap,clientCap)=>{
 const host=new LanTransport({identity:'large-legacy',largeFrames:hostCap}),client=new LanTransport({identity:'large-legacy',largeFrames:clientCap});
 const received:LanMessage[]=[],errors:string[]=[];client.onMessage(m=>received.push(m));host.onEvent(e=>{if(e.kind==='error')errors.push(e.message!);});
 try{
  const port=await host.startHost();expect((await client.connect('127.0.0.1',{name:'client',char:0},port)).ok).toBe(true);
  host.send({t:'in',tick:0,bits:16});for(let n=0;n<100&&!received.length;n++)await new Promise(r=>setTimeout(r,10));
  expect(received).toEqual([{t:'in',tick:0,bits:16}]);
  expect(()=>host.send({t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',cfg,seed:42,resumeTick:0,snap:snapshot()})).not.toThrow();
  expect(errors).toEqual(['LAN message exceeds negotiated transfer limit']);expect(host.hasPeer).toBe(false);
 }finally{host.shutdown();client.shutdown();}
});
