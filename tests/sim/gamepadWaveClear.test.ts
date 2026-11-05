import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {CMain} from '../../src/game/packages.ts';
import {installGamepad} from '../../src/game/local/Gamepad.ts';
import {beginWaveDraft,processWaveDraft,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {statsOpen} from '../../src/game/local/DraftStatsInput.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {confirmKeyLabel} from '../../src/game/local/WaveClearUi.ts';

it('names each actual local confirmation key, including the otherwise invisible space key',()=>{
 const g=createHeadlessGame({mode:'Coop'});try{
  expect(confirmKeyLabel(0)).toBe('/');expect(confirmKeyLabel(1)).toBe('SPACE');
  CMain.mInput.KEY_FIRE2=CMain.mInput.mKey_List[70];expect(confirmKeyLabel(1)).toBe('F');
 }finally{g.quit();}
});

function setup(mode:'Single'|'Coop',nintendo=false){
 const g=createHeadlessGame({mode}),w=g.world(),buttons:[number[],number[]]=[[],[]],present=[true,mode==='Coop'];
 const pad=installGamepad({player:g.player,provider:()=>present.map((connected,index)=>connected?{
  index,connected:true,id:nintendo?'Nintendo Switch Pro Controller':'Xbox Controller',axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:buttons[index]!.includes(i)}))}:null)});
 const poll=()=>pad.poll(false),step=(count=1)=>{for(let i=0;i<count;i++){poll();CMain.mInput.ProcessAllKeys();if(!w.mPaused)processWaveDraft(w);}};
 const tap=(slot:0|1,key:number)=>{buttons[slot]=[key];poll();buttons[slot]=[];poll();CMain.mInput.ProcessAllKeys();if(!w.mPaused)processWaveDraft(w);};
 poll();return {g,w,pad,buttons,present,poll,step,tap,A:nintendo?1:0,X:nintendo?3:2};
}

for(const nintendo of [false,true])for(const mode of ['Single','Coop']as const)it(`${nintendo?'Nintendo':'Xbox'} ${mode}: physical A stays blocked across both stages until release and explicit card selection`,()=>{
 const {g,w,pad,buttons,step,A,X}=setup(mode,nintendo);try{
  buttons[0]=[A];pad.poll(false);beginWaveDraft(w);const r=waveDraft(w)!.round!;
  buttons[0]=[A,X];step(r.intro!.remainingTicks+2);expect(r.intro!.entered.every(v=>!v)).toBe(true);expect(statsOpen(w,0)).toBe(false);
  buttons[0]=[X];step();buttons[0]=[A,X];step();
  if(mode==='Coop'){expect(r.intro!.entered).toEqual([true,false]);buttons[1]=[A];step();}
  expect(r.intro).toBeUndefined();expect(r.chosen!.every(v=>!v)).toBe(true);step(3);expect(r.confirmed.every(v=>!v)).toBe(true);expect(statsOpen(w,0)).toBe(false);
  // Deliberate navigation may choose a card, but the old physical A still cannot confirm it.
  buttons[0]=[A,X,13];step();expect(r.chosen![0]).toBe(true);expect(r.selected[0]).toBe(0);buttons[0]=[A,X];step(3);expect(r.confirmed[0]).toBe(false);
  buttons[0]=[];step();buttons[0]=[A];step();
  if(mode==='Coop'){
   expect(r.confirmed).toEqual([true,false]);buttons[1]=[A,12];step();expect(r.selected[1]).toBe(2);expect(r.confirmed[1]).toBe(false);
   buttons[1]=[];step();buttons[1]=[A];step();
  }
  expect(w.mUpgrades.mLevelIndex).toBe(2);expect(waveDraft(w)!.lastRewardWave).toBe(1);expect(g.errors).toEqual([]);
 }finally{pad.dispose();g.quit();}
});

it.each([false,true])('keeps a fresh sub-tick A after the timer as entry only, with no latent X open (Nintendo=%s)',nintendo=>{
 const {g,w,pad,step,tap,A,X}=setup('Single',nintendo);try{
  beginWaveDraft(w);const r=waveDraft(w)!.round!;tap(0,X);expect(statsOpen(w,0)).toBe(false);step(r.intro!.remainingTicks);step();
  tap(0,A);expect(r.intro).toBeUndefined();expect(r.chosen).toEqual([false]);expect(r.confirmed).toEqual([false]);step(2);expect(statsOpen(w,0)).toBe(false);
  tap(0,A);expect(r.confirmed).toEqual([false]);tap(0,13);expect(r.chosen).toEqual([true]);tap(0,A);expect(w.mUpgrades.mLevelIndex).toBe(2);
 }finally{pad.dispose();g.quit();}
});

it.each([1,6,7])('requires physical release after focus blocking with held confirm button %s on an already selected card',button=>{
 const {g,w,pad,buttons,poll,step,tap,A}=setup('Single');try{
  beginWaveDraft(w);const r=waveDraft(w)!.round!;step(r.intro!.remainingTicks);step();tap(0,A);step();tap(0,13);expect(r.chosen).toEqual([true]);
  // Press before focus loss without a simulation sample, then keep that physical button held.
  buttons[0]=[button];poll();pad.poll(true);step(3);expect(r.confirmed).toEqual([false]);
  buttons[0]=[];step(2);tap(0,button);expect(w.mUpgrades.mLevelIndex).toBe(2);
 }finally{pad.dispose();g.quit();}
});

it('discards paused, disconnected and remapped input before accepting a fresh A on a selected card',()=>{
 const {g,w,pad,buttons,present,poll,step,tap,A}=setup('Single');try{
  beginWaveDraft(w);const r=waveDraft(w)!.round!;step(r.intro!.remainingTicks);step();tap(0,A);step();tap(0,13);
  w.mPaused=true;buttons[0]=[A];step(2);w.mPaused=false;step(2);expect(r.confirmed).toEqual([false]);buttons[0]=[];step(2);
  present[0]=false;poll();present[0]=true;buttons[0]=[A];step(2);expect(r.confirmed).toEqual([false]);buttons[0]=[];step(2);
  buttons[0]=[1];poll();pad.setLayout(0,'nintendo');step(2);expect(r.confirmed).toEqual([false]);buttons[0]=[];step(2);tap(0,1);expect(w.mUpgrades.mLevelIndex).toBe(2);
 }finally{pad.dispose();g.quit();}
});

it('does not turn held keyboard fire into READY when an armed selected draft is restored into a new world',()=>{
 const old=setup('Single');let saved:any;
 try{
  beginWaveDraft(old.w);const r=waveDraft(old.w)!.round!;old.step(r.intro!.remainingTicks);old.step();old.tap(0,old.A);old.step();old.tap(0,13);
  expect(r.chosen).toEqual([true]);expect(r.armed).toEqual([true]);saved=capture(old.w);
 }finally{old.pad.dispose();old.g.quit();}
 const g=createHeadlessGame(),w=g.world();try{
  g.keyDown(KEYS.P1.FIRE);CMain.mInput.ProcessAllKeys();expect(applyToWorld(w,saved)).toBe(true);const r=waveDraft(w)!.round!;
  expect(r.armed).toEqual(saved.waveDraft.round.armed);
  for(let i=0;i<3;i++){CMain.mInput.ProcessAllKeys();processWaveDraft(w);expect(r.confirmed).toEqual([false]);}
  g.keyUp(KEYS.P1.FIRE);CMain.mInput.ProcessAllKeys();processWaveDraft(w);expect(r.confirmed).toEqual([false]);
  g.keyDown(KEYS.P1.FIRE);CMain.mInput.ProcessAllKeys();g.keyUp(KEYS.P1.FIRE);CMain.mInput.ProcessAllKeys();processWaveDraft(w);expect(w.mUpgrades.mLevelIndex).toBe(2);
 }finally{g.quit();}
});
