import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {CMain,DrawPrimitive,Thing} from '../../src/game/packages.ts';
import {GUN_LINKS,derivedWeaponSet,polishedWeaponCollection} from '../../src/game/local/WeaponArt.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {withTimerValue} from '../../src/engine/flash/clock.ts';
it('preserves all 16 directions, authored frame sequences and exact simulation anchors for four skins',()=>{
 const g=createHeadlessGame(),X=DrawPrimitive.XSI,DI=X.CDrawPrimitive_XSI_DI,player=Thing.Creature.CThing_Creature_Player;
 for(const skin of [0,1,2,3]){
  const current=player.GetCollection(skin),classic=player.mXSI_Collections[skin];
  expect(current).not.toBe(classic);expect(polishedWeaponCollection(classic,skin)).toBe(current);
  DI.RenderStack_Process(0,Infinity);
  for(const [kind,link]of Object.entries(GUN_LINKS))for(const action of ['Stand','Walk']){
   const key=kind+action.toLowerCase(),old=classic.mItems[key].mAnimationObject,next=current.mItems[key].mAnimationObject;
   expect(next.mFrameCount).toBe(old.mFrameCount);expect(next.mDirections).toHaveLength(old.mDirections.length);
   expect(next.XSI_Info).toEqual(old.XSI_Info);expect(current.mItems[key].mID).toBe(classic.mItems[key].mID);
   // Walking has eight authored directions; all sixteen facing inputs keep the original lookup and anchors.
   for(let facing=0;facing<16;facing++)for(let i=0;i<next.mFrameCount;i++){
    const d=next.mLookup256[facing*16];expect(d).toBe(old.mLookup256[facing*16]);
    const a=old.mDirections[d].mFrames[i],b=next.mDirections[d].mFrames[i];expect(b.XSI_Info).toEqual(a.XSI_Info);
    expect(b.sBMD.width).toBeGreaterThan(0);expect(b.sBMD.height).toBeGreaterThan(0);expect(b.sBMD.width).toBeLessThan(110);expect(b.sBMD.height).toBeLessThan(110);
    expect([b.mDisp.x,b.mDisp.y].every(Number.isFinite)).toBe(true);
   }
   const original=DI.mAnimationSets['Player_'+link+'_'+action],derived=DI.mAnimationSets['Polished_Player_'+link+'_'+action];
   expect(derived.mFrameSequence).toEqual(original.mFrameSequence);
  }
  for(const key of ['stand','walk','shothit_1','shothit_2','dying','dead','grenadewalk'])expect(current.mItems[key]).toBe(classic.mItems[key]);
 }
 const first=player.GetCollection(0),last=player.GetCollection(3);expect(first.mItems.pistolstand.mAnimationObject).not.toBe(last.mItems.pistolstand.mAnimationObject);g.quit();
});
it('uses finite nondegenerate faces and isolated materials while retaining originals and both hand models',()=>{
 const g=createHeadlessGame({classicWeaponArt:true}),DI=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
 for(const [kind,link]of Object.entries(GUN_LINKS))for(const action of ['Stand','Walk']){
  const original=DI.mAnimationSets['Player_'+link+'_'+action],before=JSON.stringify(original.mDirections),derived=derivedWeaponSet(original,kind as keyof typeof GUN_LINKS);
  expect(derivedWeaponSet(original,kind as keyof typeof GUN_LINKS)).toBe(derived);
  for(let d=0;d<original.mDirections.length;d++)for(let i=0;i<original.mDirections[d].length;i++){
   const a=original.mDirections[d][i],b=derived.mDirections[d][i],m=b.Models.Weapon_Right;
   expect(Object.keys(b.Models)).toEqual(Object.keys(a.Models));
   for(const name of Object.keys(a.Models))if(name!=='Weapon_Right')expect(b.Models[name]).toBe(a.Models[name]);
   expect(m.XSIInfo).toBe(a.Models.Weapon_Right.XSIInfo);expect(m.Shape_vList.length).toBe(m.Shape_Material.length);
   expect(m.Shape_vList.length).toBe(m.Shape_Brightness.length);expect(m.Shape_vList.length).toBe(m.Shape_Matrix.length);
   expect(new Set(m.Shape_Material).size).toBeGreaterThan(2);
   for(const points of m.Shape_vList){expect(points.every(Number.isFinite)).toBe(true);let area=0;
    for(let k=0;k<points.length;k+=2){const j=(k+2)%points.length;area+=points[k]*points[j+1]-points[j]*points[k+1];}
    expect(area).toBeGreaterThan(1e-5);
   }
   // The exact original muzzle is the centre of the final barrel face, including every walk/recoil pose.
   const v=a.Models.GunPosition_Right.XSIInfo.vPosition,x=v.mX,y=-Math.sin(original.mTilt)*v.mY+Math.cos(original.mTilt)*v.mZ;
   const all=m.Shape_vList.flat(),xs=all.filter((_:number,k:number)=>k%2===0),ys=all.filter((_:number,k:number)=>k%2===1);
   expect(x).toBeGreaterThanOrEqual(Math.min(...xs)-1e-6);expect(x).toBeLessThanOrEqual(Math.max(...xs)+1e-6);
   expect(y).toBeGreaterThanOrEqual(Math.min(...ys)-1e-6);expect(y).toBeLessThanOrEqual(Math.max(...ys)+1e-6);
  }
  expect(JSON.stringify(original.mDirections)).toBe(before);
 }
 expect(CMain._this).toBe(g.main());g.quit();
});
it('does not change movement, weapon emission, damage, input or the simulation digest',()=>{
 const results=[],g=createHeadlessGame({classicWeaponArt:true,seed:64}),w=g.world(),p=g.players()[0];
 const process=w.Process;w.Process=function(){return withTimerValue(this.mTick*40,()=>process.call(this));};
 p.NewWeapon('uzi');p.SelectWeapon('uzi');const base=p.mXSI_Collection,polished=polishedWeaponCollection(base,3);
 DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.RenderStack_Process(0,Infinity);
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
 for(const modern of [false,true]){
  if(modern){
   restoreWorldSnap(w,slot,ctx);const a=p.mXSI_Animation,key=Object.keys(base.mItems).find(k=>base.mItems[k].mAnimationObject===a.mAnimationObject)!;
   p.mXSI_Collection=polished;a.mCollection=polished;a.mAnimationObject=polished.mItems[key].mAnimationObject;
  }
  g.keyDown(KEYS.P1.RIGHT);g.keyDown(KEYS.P1.FIRE);g.tick(25);
  g.keyUp(KEYS.P1.FIRE);g.keyUp(KEYS.P1.RIGHT);g.tick(2);
  results.push(simulationDigest(captureWorldSnap(w,ctx,false)));expect(g.errors).toEqual([]);
 }
 expect(results[1]).toEqual(results[0]);g.quit();
});
