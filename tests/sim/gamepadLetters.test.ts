import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn} from './fxkit.ts';
import {installGamepad} from '../../src/game/local/Gamepad.ts';
import {bindingsFor,bindingProgress} from '../../src/game/local/WeaponBindings.ts';
import {beginWaveDraft,waveDraft} from '../../src/game/local/WaveDraft.ts';
import {statsOpen} from '../../src/game/local/DraftStatsInput.ts';
const memory=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};};
for(const [name,id,manual,A,B,X,Y]of [
 ['SN30 printed letters','8BitDo SN30 Pro',false,1,0,3,2],
 ['Xbox printed letters','Xbox 360 Controller',false,0,1,2,3],
 ['SN30 generic XInput override','Xbox 360 Controller',true,1,0,3,2],
]as const){
 it(`${name}: B fires, A/Y bind, X alone inspects and A confirms`,()=>{
  const g=createHeadlessGame(),w=g.world(),p=g.players()[0];let pressed:number[]=[],time=0;
  const pad=installGamepad({player:g.player,provider:()=>[{id,index:0,connected:true,axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i)}))}],now:()=>time,layoutStorage:memory()});
  const poll=(buttons:number[],ms=0)=>{pressed=buttons;time+=ms;pad.poll(false);};
  try{
   noSpawn(g);poll([]);if(manual){pad.setLayout(0,'nintendo');poll([]);}
   p.NewWeapon('uzi');p.SelectWeapon('uzi');const before=p.mWeapon_Current.mAmmo;
   poll([B]);g.tick(1);expect(p.mWeapon_Current.mAmmo).toBe(before-1);poll([]);
   poll([A]);poll([A],800);g.tick(1);expect(p.mWeapon_Current.mAmmo).toBe(before-1);expect(bindingsFor(w,0)).toEqual({A:'uzi'});poll([]);
   p.NewWeapon('shotgun');p.SelectWeapon('shotgun');poll([Y]);poll([Y],800);g.tick(1);expect(bindingsFor(w,0)).toEqual({A:'uzi',Y:'shotgun'});poll([]);
   p.SelectWeapon('pistol');poll([Y]);poll([],100);g.tick(1);expect(p.mWeapon_Current.mNameID).toBe('shotgun');
   beginWaveDraft(w);poll([Y]);expect(statsOpen(w,0)).toBe(false);poll([]);poll([X]);expect(statsOpen(w,0)).toBe(true);poll([]);
   poll([A]);g.tick(1);expect(waveDraft(w)!.round!.confirmed[0]).toBe(false);poll([]);g.tick(1);
   poll([X]);expect(statsOpen(w,0)).toBe(false);poll([]);g.tick(1);poll([A]);g.tick(1);expect(w.mUpgrades.mLevelIndex).toBe(2);
  }finally{pad.dispose();g.quit();}
 });
 it(`${name}: the same printed A clicks the real menu`,()=>{
  const g=createHeadlessGame({menuOnly:'Main'});let pressed:number[]=[];const b=g.main().mcScreen.mcSinglePlay,mouse={x:b._x,y:b._y};
  const pad=installGamepad({player:g.player,mouse,provider:()=>[{id,index:0,connected:true,axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i)}))}],layoutStorage:memory()});
  try{pad.poll(false);if(manual){pad.setLayout(0,'nintendo');pad.poll(false);}pressed=[B];pad.poll(false);pressed=[];pad.poll(false);expect(g.stepUntil(()=>g.state()!=='State_Main',3)).toBe(false);pressed=[A];pad.poll(false);pressed=[];pad.poll(false);expect(g.stepUntil(()=>g.state()==='State_SelectWorld_Single',40)).toBe(true);}finally{pad.dispose();g.quit();}
 });
}
it('changing layout cancels a held binding and waits for release instead of firing the newly mapped B',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];let pressed=[0],time=0;
 const pad=installGamepad({player:g.player,provider:()=>[{id:'Xbox',index:0,connected:true,axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i)}))}],now:()=>time,layoutStorage:memory()});
 try{noSpawn(g);p.NewWeapon('uzi');p.SelectWeapon('uzi');const ammo=p.mWeapon_Current.mAmmo;pad.poll(false);time=400;pad.poll(false);expect(bindingProgress(w,0)?.amount).toBe(.5);pad.setLayout(0,'nintendo');time=1200;pad.poll(false);g.tick(1);expect(bindingProgress(w,0)).toBeUndefined();expect(bindingsFor(w,0)).toEqual({});expect(p.mWeapon_Current.mAmmo).toBe(ammo);pressed=[];pad.poll(false);pressed=[0];pad.poll(false);g.tick(1);expect(p.mWeapon_Current.mAmmo).toBe(ammo-1);}finally{pad.dispose();g.quit();}
});
