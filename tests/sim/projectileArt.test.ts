import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {drawRocket,drawTracer,setClassicProjectileArtFixture,tracerSegment} from '../../src/game/local/ProjectileArt.ts';
import {captureWorldSnap,makeSnapCtx} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
it('keeps the resolved muzzle and wall endpoint for all sixteen angles and hides unresolved delayed pellets',()=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0],V=Thing.Math.CThing_Position;
 for(const ctor of [Thing.Shot.CThing_Shot_Bullet,Thing.Shot.CThing_Shot_Railgun])for(let d=0;d<16;d++){
  const start=new V(8.5,8.5,-.8),shot=new ctor(start.Clone(),new Thing.Math.CThing_Angle(d*Math.PI/8),p,5,20);
  w.mThing_Collection.AddThing_Shot(shot);expect(tracerSegment(shot)).toBeUndefined();shot.Process_Init();
  const segment=tracerSegment(shot)!;expect(segment).toBeDefined();
  for(const key of ['mX','mY','mZ'])expect(segment.start[key]).toBeCloseTo(start[key],10);
  expect(segment.end.Distance2D(start)).toBeLessThanOrEqual(20.001);
  // The endpoint equals the authored collision point before its cosmetic half-drift.
  const hit=w.mMap.mCollide.Collide_Line(shot,start,start.Add(new V(1,0,0).RotateZ(d*Math.PI/8).Normalize(20)),.04,Thing.Affect.CThing_Affect.mAffect_Bullet,ctor===Thing.Shot.CThing_Shot_Railgun);
  if(hit?.mPOI){expect(segment.end.mX).toBeCloseTo(hit.mPOI.x,8);expect(segment.end.mY).toBeCloseTo(hit.mPOI.y,8);}
  shot.Draw();shot.Process_Normal();const fading=tracerSegment(shot)!;expect(fading.fade).toBe(.35);
  for(const key of ['mX','mY','mZ']){expect(fading.start[key]).toBeCloseTo(segment.start[key],10);expect(fading.end[key]).toBeCloseTo(segment.end[key],10);}
  shot.Delete();
 }
 const delayed=new Thing.Shot.CThing_Shot_Bullet(new V(8.5,8.5,0),new Thing.Math.CThing_Angle(0),p,5,5,true);
 delayed.Process_Delay();expect(tracerSegment(delayed)).toBeUndefined();expect(g.errors).toEqual([]);g.quit();
});
it('has bounded finite strokes at every angle, a distinct enchanted palette and no oversized screen glow',()=>{
 const trace=(fn:(mc:any)=>void)=>{const calls:any[]=[];const mc=new Proxy({}, {get:(_,key)=>(...a:any[])=>calls.push([key,...a])});fn(mc);return calls;};
 for(let d=0;d<16;d++)for(const enchanted of [false,true]){
  const angle=d*Math.PI/8,b={x:100+Math.cos(angle)*60,y:100+Math.sin(angle)*60};
  for(const kind of ['pistol','uzi','shotgun','railgun']as const){
   const calls=trace(mc=>drawTracer(mc,{x:100,y:100},b,kind,enchanted,.5));
   for(const [name,...a]of calls){expect(a.every(Number.isFinite)).toBe(true);if(name==='lineStyle'){expect(a[0]).toBeLessThanOrEqual(3.2);expect(a[2]).toBeGreaterThan(0);expect(a[2]).toBeLessThanOrEqual(100);}}
  }
  const calls=trace(mc=>drawRocket(mc,{x:100,y:100},{x:Math.cos(angle),y:Math.sin(angle)},enchanted,5));
  for(const [name,...a]of calls){expect(a.every(Number.isFinite)).toBe(true);if(name==='moveTo'||name==='lineTo')expect(Math.hypot(a[0]-100,a[1]-100)).toBeLessThanOrEqual(21.1);}
 }
 expect(trace(mc=>drawTracer(mc,{x:0,y:0},{x:10,y:0},'shotgun',true))).not.toEqual(trace(mc=>drawTracer(mc,{x:0,y:0},{x:10,y:0},'shotgun',false)));
});
it('drawing every normal/enchanted shot preserves all simulation categories and the original art fixture',()=>{
 const g=createHeadlessGame({seed:17}),w=g.world(),p=g.players()[0],ctx=makeSnapCtx(w);
 for(const name of ['pistol','uzi','shotgun','rocket','railgun'])for(const enchanted of [false,true]){
  p.NewWeapon(name);p.SelectWeapon(name);const weapon=p.mWeapon_Current;weapon.mEnchantedAmmo=enchanted?weapon.mAmmo:0;weapon.mPersistentEnchantment=enchanted;
  weapon.Fire(p.GetWeaponPosition(),p.mAngle);g.tick(1);
  const shots=Object.values(w.mThing_Collection.mThings).filter((t:any)=>/^CThing_Shot_(Bullet|Rocket|Railgun)$/.test(t._CLASSID_)) as any[];
  expect(shots.length).toBeGreaterThan(0);w.Draw();const before=simulationDigest(captureWorldSnap(w,ctx,false));
  for(const useClassic of [true,false]){setClassicProjectileArtFixture(g.main(),useClassic);w.Draw();expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(before);}
  for(const shot of shots)shot.Delete();
 }
 expect(g.errors).toEqual([]);g.quit();
});
