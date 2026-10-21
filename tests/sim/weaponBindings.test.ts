import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn} from './fxkit.ts';
import {installGamepad} from '../../src/game/local/Gamepad.ts';
import {applyWeaponCommands,bindingsFor,bindingProgress,queueWeaponCommand} from '../../src/game/local/WeaponBindings.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {beginWaveDraft} from '../../src/game/local/WaveDraft.ts';

it('binds empty weapons once, replaces and transfers keys, switches, and toggles off deterministically',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  noSpawn(g);p.NewWeapon('uzi');p.NewWeapon('shotgun');p.mWeapons.uzi.mThing.mAmmo=0;p.SelectWeapon('uzi');
  queueWeaponCommand(w,0,{action:'bind',button:'A',weapon:'uzi'});g.tick(1);expect(bindingsFor(w,0)).toEqual({A:'uzi'});
  queueWeaponCommand(w,0,{action:'bind',button:'Y',weapon:'uzi'});g.tick(1);expect(bindingsFor(w,0)).toEqual({Y:'uzi'});
  p.SelectWeapon('shotgun');queueWeaponCommand(w,0,{action:'bind',button:'A',weapon:'shotgun'});g.tick(1);
  queueWeaponCommand(w,0,{action:'select',button:'Y'});g.tick(1);expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.mWeapon_Current.mAmmo).toBe(0);
  queueWeaponCommand(w,0,{action:'bind',button:'Y',weapon:'uzi'});g.tick(1);expect(bindingsFor(w,0)).toEqual({A:'shotgun'});
 }finally{g.quit();}
});
it('holds for 800ms with progress, short-releases to select, and cancels on weapon change, pause and disconnect',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();let time=0,pressed:number[]=[],present=true;
 const provider=()=>[present?{index:0,connected:true,axes:[0,0],buttons:Array.from({length:17},(_,n)=>({pressed:pressed.includes(n)}))}:null];
 const pad=installGamepad({player:g.player,provider,now:()=>time});
 const poll=(buttons:number[],elapsed=0)=>{pressed=buttons;time+=elapsed;pad.poll(false);};
 try{
  noSpawn(g);p.NewWeapon('uzi');p.SelectWeapon('uzi');poll([0]);poll([0],400);expect(bindingProgress(w,0)?.amount).toBe(.5);g.tick(1);expect(bindingsFor(w,0)).toEqual({});expect(p.mWeapon_Current.mFire).toBeFalsy();
  poll([0],400);g.tick(1);expect(bindingsFor(w,0)).toEqual({A:'uzi'});poll([0],1000);g.tick(1);expect(bindingsFor(w,0)).toEqual({A:'uzi'});poll([]);
  p.SelectWeapon('pistol');poll([0]);poll([],100);g.tick(1);expect(p.mWeapon_Current.mNameID).toBe('uzi');
  poll([3]);p.SelectWeapon('pistol');poll([3],900);poll([]);g.tick(1);expect(bindingsFor(w,0)).toEqual({A:'uzi'});
  poll([3]);w.mPaused=true;poll([3],900);w.mPaused=false;poll([]);g.tick(1);expect(bindingsFor(w,0).Y).toBeUndefined();
  poll([3]);present=false;poll([],900);g.tick(1);expect(bindingsFor(w,0).Y).toBeUndefined();
 }finally{pad.dispose();g.quit();}
});
it('persists per-player bindings across save and rollback while ignoring dead/draft commands',()=>{
 const g=createHeadlessGame({mode:'Coop'}),w=g.world();try{
  noSpawn(g);for(const p of g.players())applyWeaponCommands(w,p.mPlayerIndex,[{action:'bind',button:p.mPlayerIndex?'Y':'A',weapon:'pistol'}]);
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx);applyWeaponCommands(w,0,[{action:'bind',button:'A',weapon:'pistol'}]);
  restoreWorldSnap(w,{data,sharedObjs:ctx.sharedObjs,instances:ctx.instances}as any,ctx);expect(bindingsFor(w,0)).toEqual({A:'pistol'});
  const saved=capture(w);expect(applyToWorld(w,saved)).toBe(true);expect(w.mUpgrades.weaponBindings).toEqual([{A:'pistol'},{Y:'pistol'}]);
  g.players()[0].mLife=0;applyWeaponCommands(w,0,[{action:'bind',button:'A',weapon:'pistol'}]);expect(bindingsFor(w,0).A).toBe('pistol');
  beginWaveDraft(w);applyWeaponCommands(w,1,[{action:'bind',button:'Y',weapon:'pistol'}]);expect(bindingsFor(w,1).Y).toBe('pistol');
 }finally{g.quit();}
});
