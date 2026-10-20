import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {DrawPrimitive,Thing,World} from '../../src/game/packages.ts';
import {classicVariantCollection,variantCollection} from '../../src/game/local/VariantArt.ts';
import {captureWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
import {chargeWarningGeometry} from '../../src/game/local/EnemyVariants.ts';
it('prebakes distinct ordinary and Boss bodies while preserving the classic variant fixture and feet',()=>{
 const g=createHeadlessGame(),DI=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
 for(const kind of ['charger','priest']as const){
  const modern=variantCollection(kind),boss=variantCollection(kind,true),old=classicVariantCollection(kind);
  DI.RenderStack_Process(0,Infinity);expect(boss).not.toBe(modern);expect(old).not.toBe(modern);expect(variantCollection(kind,true)).toBe(boss);
  for(const key of Object.keys(modern.mItems)){
   const a=old.mItems[key].mAnimationObject,b=modern.mItems[key].mAnimationObject,c=boss.mItems[key].mAnimationObject;
   expect(b.mFrameCount).toBe(a.mFrameCount);expect(c.mFrameCount).toBe(a.mFrameCount);expect(c.XSI_Info).toEqual(a.XSI_Info);
   for(let facing=0;facing<16;facing++)for(let f=0;f<a.mFrameCount;f++){
    const d=a.mLookup256[facing*16];expect(b.mLookup256[facing*16]).toBe(d);expect(c.mLookup256[facing*16]).toBe(d);
    for(const next of [b,c]){const frame=next.mDirections[d].mFrames[f];expect(frame.XSI_Info).toEqual(a.mDirections[d].mFrames[f].XSI_Info);
     expect(frame.sBMD.width).toBeGreaterThan(0);expect(frame.sBMD.height).toBeGreaterThan(0);expect(frame.sBMD.width).toBeLessThan(125);expect(frame.sBMD.height).toBeLessThan(125);
    }
   }
   const before=DI.mAnimationSets['ClassicVariant_'+kind+'_'+key],derived=DI.mAnimationSets['Boss_'+kind+'_'+key];
   for(let d=0;d<derived.mDirections.length;d++)for(let f=0;f<derived.mDirections[d].length;f++){
    const frame=derived.mDirections[d][f],original=before.mDirections[d][f];
    for(const foot of ['Foot_Left','Foot_Right'])expect(frame.Models[foot]).toEqual(original.Models[foot]);
    for(const m of Object.values(frame.Models)as any[])if(m.Shape_vList?.length){
     expect(m.Shape_Material).toHaveLength(m.Shape_vList.length);expect(m.Shape_Matrix).toHaveLength(m.Shape_vList.length);expect(m.Shape_Brightness).toHaveLength(m.Shape_vList.length);
     for(let n=0;n<m.Shape_vList.length;n++){const p=m.Shape_vList[n];expect(p.every(Number.isFinite)).toBe(true);
      if(m.Shape_Material[n].startsWith('Variant')){let area=0;for(let i=0;i<p.length;i+=2){const j=(i+2)%p.length;area+=p[i]*p[j+1]-p[j]*p[i+1];}expect(Math.abs(area)).toBeGreaterThan(1e-6);}
     }
    }
   }
  }
  expect(DI.mAnimationSets['Boss_'+kind+'_walk'].mFrameSequence).toEqual([0,1,2,3,4,3,2,1]);
  expect(DI.mAnimationSets['Boss_'+kind+'_stand'].mDirections).not.toEqual(DI.mAnimationSets['Variant_'+kind+'_stand'].mDirections);
 }
 expect(g.errors).toEqual([]);g.quit();
});
it('selects the Boss art on initialization without changing simulation when drawn',()=>{
 const g=createHeadlessGame(),w=g.world(),ctx=makeSnapCtx(w);
 for(const [kind,C]of [['charger',Thing.Creature.CThing_Creature_Zombie],['priest',Thing.Creature.CThing_Creature_Devil]]as const){
  const enemy:any=new C(new Thing.Math.CThing_Position(9.5,8.5,0));enemy.mEnemyVariant=enemy.mBossKind=kind;w.mThing_Collection.AddThing(enemy);enemy.Process_Init();
  expect(enemy.mXSI_Animation.mCollection).toBe(variantCollection(kind,true));
  enemy.SetState(kind==='charger'?'State_VariantCharge':'State_VariantCast');w.Draw();
  const before=simulationDigest(captureWorldSnap(w,ctx,false));w.Draw();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(before);enemy.Delete();
 }
 expect(g.errors).toEqual([]);g.quit();
});
it('draws the charge corridor to its real static obstruction and combined hit radius without mutating the map',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0],e:any=new Thing.Creature.CThing_Creature_Zombie(new Thing.Math.CThing_Position(9.5,8.5,0));
 e.mEnemyVariant='charger';w.mThing_Collection.AddThing(e);e.Process_Init();e.mChargeX=1;e.mChargeY=0;
 const ctx=makeSnapCtx(w),before=simulationDigest(captureWorldSnap(w,ctx,false)),geometry=chargeWarningGeometry(e);
 expect(geometry.radius).toBe((e.mRadius+p.mRadius)*32);expect(geometry.length).toBeGreaterThan(0);expect(geometry.length).toBeLessThanOrEqual(128);
 expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(before);
 const block=w.mMap.mCells[8][10],old=block.mCollide;block.mCollide=old|World.Map.CMap_Cell.mCollide_StaticImpassable;
 const shorter=chargeWarningGeometry(e);expect(shorter.length).toBeLessThan(geometry.length);block.mCollide=old;g.quit();
});
it('keeps old variant visuals available under an explicit fixture',()=>{
 const g=createHeadlessGame({classicVariantArt:true});
 for(const kind of ['charger','priest']as const){expect(variantCollection(kind)).toBe(classicVariantCollection(kind));expect(variantCollection(kind,true)).toBe(classicVariantCollection(kind));}
 g.quit();
});
