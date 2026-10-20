import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {installGamepad} from '../../src/game/local/Gamepad.ts';
import {beginWaveDraft,processWaveDraft,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {NetSession} from '../../src/game/local/Net/NetSession.ts';
import {CMain} from '../../src/game/packages.ts';

it('does not send hidden gamepad cursor clicks into a running wave or its draft',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();
 let clicks=0,pressed=false;
 const h=installGamepad({player:{mouseMove(){},mouseDown(){clicks++;},mouseUp(){clicks++;}},
  provider:()=>[{index:0,connected:true,axes:[0,1],buttons:Array.from({length:16},(_,i)=>({pressed:i===0&&pressed}))}]});
 try{
  h.poll(false);pressed=true;h.poll(false);
  beginWaveDraft(w);pressed=false;h.poll(false);
  expect(clicks).toBe(0);
  expect(waveDraft(w)!.round!.confirmed).toEqual([false,false]);
 }finally{h.dispose();g.quit();}
});

it('routes both keyboard sets and either assigned pad to the LAN client draft without controlling P1',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=new NetSession(1,{send(){}});
 s.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:17,netcode:'rollback-v2',cfg:{
  difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:1,
  progression:'personal-growth-v1',supplies:'armor-ammo-v1',survival:'survival-v1',loot:'supply-crates-v2',
  balance:'pve-balance-v1',endless:'endless-pve-v1',timedWaves:'timed-waves-v1',waveDraft:'wave-draft-v1'}},g.main());
 expect(g.waitRunning(3000)).toBe(true);const w=g.world();beginWaveDraft(w);
 const sample=()=>{CMain.mInput.ProcessAllKeys();const bits=(s as any).sampleLocalBits();(s as any).applyPlayer(1,bits,w.mTick);processWaveDraft(w);};
 try{
  for(const keys of [KEYS.P1,KEYS.P2]){
   g.keyDown(keys.DOWN);sample();expect(waveDraft(w)!.round!.selected[1]).toBe(1);
   g.keyUp(keys.DOWN);sample();g.keyDown(keys.UP);sample();expect(waveDraft(w)!.round!.selected[1]).toBe(0);
   g.keyUp(keys.UP);sample();
  }
  for(const swap of [false,true]){
   let direction=0;
   const h=installGamepad({player:{mouseMove(){},mouseDown(){},mouseUp(){}},provider:()=>[
    {index:0,connected:true,axes:[0,direction],buttons:[]}]});
   try{if(swap)h.swapAssignment();h.poll(false);direction=1;h.poll(false);sample();
    expect(waveDraft(w)!.round!.selected).toEqual([0,1]);
    direction=0;h.poll(false);sample();direction=-1;h.poll(false);sample();
    expect(waveDraft(w)!.round!.selected).toEqual([0,0]);
   }finally{h.dispose();sample();}
  }
 }finally{g.quit();}
});
