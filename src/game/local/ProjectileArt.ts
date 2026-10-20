// PROJECTILE_ART: rendering only. Collision, RNG, shot lifetime and the original anchors remain authoritative.
import {CMain,DrawPrimitive,Thing} from '../packages.ts';
import {enchantedWeapon} from './EnchantmentRules.ts';
type Point={x:number;y:number};
export type ProjectileKind='pistol'|'uzi'|'shotgun'|'railgun';
const classic=new WeakSet<object>(),kinds=new WeakMap<object,ProjectileKind>(),rocketClips=new WeakMap<object,any>();
const emissions=new WeakMap<object,boolean>(),flashes=new WeakMap<object,boolean>();
function drawClip(world:any):any{
 let clip=rocketClips.get(world);
 if(!clip){clip=world.createEmptyMovieClip('_ProjectileArt',world.getNextHighestDepth());clip._visible=false;rocketClips.set(world,clip);}
 return clip;
}
export function setClassicProjectileArtFixture(main:object,enabled=true):void{if(enabled)classic.add(main);else classic.delete(main);}

/** The authored hitscan drifts cosmetically after impact. Undo only that drift when drawing the resolved segment.
 * Deriving it from snapshot-owned values also makes rollback/restore independent of a visual history buffer. */
export function tracerSegment(shot:any):{start:any;end:any;fade:number}|undefined{
 const age=shot.mMaxLife-shot.mLife;if(age<=0||age>shot.mMaxLife)return;
 const factor=(Math.pow(1/.75,age)-1)/(1/.75-1),start=shot.mPosition.Clone(),end=shot.mDestination.Clone();
 for(const k of ['mX','mY','mZ']){start[k]-=shot.mDelta[k]*factor;end[k]-=shot.mDelta[k]*factor*.5;}
 return {start,end,fade:Math.max(.35,1-(age-1)*.65)};
}
function line(mc:any,a:Point,b:Point,width:number,color:number,alpha:number):void{
 DrawPrimitive.CDrawPrimitive_Line.Draw(mc,a,b,width,color,alpha);
}
export function drawTracer(mc:any,a:Point,b:Point,kind:ProjectileKind,enchanted:boolean,fade=1):void{
 const rail=kind==='railgun',pellet=kind==='shotgun',edge=enchanted?0xab65e5:rail?0x4fa5c9:pellet?0x90623b:0x9d7c42;
 const core=enchanted?0xf2ddff:rail?0xddf9ff:0xffefce,alpha=fade;
 // A restrained edge separates the line from pale floors; the bright core stays readable on dark rooms.
 line(mc,a,b,rail?3.2:pellet?1.25:1.65,edge,(rail?30:44)*alpha);
 line(mc,a,b,rail?1.25:pellet?.5:.65,core,(rail?83:68)*alpha);
 if(rail){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length>.1){
   const nx=-dy/length,ny=dx/length,near={x:a.x+dx*Math.min(.1,6/length),y:a.y+dy*Math.min(.1,6/length)};
   // Short emitter collar, entirely inside the real segment, rather than a large glow over the player.
   for(const side of [-1,1])line(mc,{x:a.x+nx*side,y:a.y+ny*side},{x:near.x+nx*side,y:near.y+ny*side},.5,edge,55*alpha);
  }
 }
}
export function drawRocket(mc:any,point:Point,direction:Point,enchanted:boolean,tick:number):void{
 const length=Math.hypot(direction.x,direction.y);if(length<1e-6)return;
 const fx=direction.x/length,fy=direction.y/length,at=(x:number,y:number):Point=>({x:point.x+fx*x-fy*y,y:point.y+fy*x+fx*y});
 const shape=(vertices:number[][],color:number,alpha=100):void=>{
  mc.lineStyle();mc.beginFill(color,alpha);for(let i=0;i<=vertices.length;i++){const v=vertices[i%vertices.length]!,p=at(v[0]!,v[1]!);i?mc.lineTo(p.x,p.y):mc.moveTo(p.x,p.y);}mc.endFill();
 };
 const pulse=tick%2===0?1:0;
 line(mc,at(-7,0),at(-19-pulse*2,0),3,enchanted?0x8b55c3:0xb5946a,22);
 shape([[-7,-1.6],[-16-pulse*2,0],[-7,1.6]],enchanted?0xbd7ef4:0xe8ae57,80);
 shape([[-7,-.8],[-12-pulse,0],[-7,.8]],enchanted?0xf2ddff:0xffedb6);
 shape([[-7,-2],[-3,-2],[0,-1.4],[5,0],[0,1.4],[-3,2],[-7,2]],0x29373a);
 shape([[-6,-1.3],[0,-1.3],[3,0],[0,.8],[-6,.8]],0x8c9975);
 shape([[-5,-1.3],[-2,-1.3],[-2,-.3],[-5,-.3]],0xc6c8ac);
 shape([[0,-1.3],[5,0],[0,.8]],0xb7c1be);
 shape([[-7,-1.5],[-8,-3.2],[-4,-1.5]],0x677b80);
 shape([[-7,1.5],[-8,3.2],[-4,1.5]],0x4a5b62);
}
export function installProjectileArt():void{
 for(const ctor of [Thing.Weapon.CThing_Weapon_Pistol,Thing.Weapon.CThing_Weapon_UZI,Thing.Weapon.CThing_Weapon_Shotgun,Thing.Weapon.CThing_Weapon_Railgun]){
  const p=ctor.prototype as any,fire=p.Fire;p.Fire=function(this:any,...args:any[]):any{
   const collection=this.mThing_Collection,old=emissions.get(collection);emissions.set(collection,enchantedWeapon(this));
   try{return fire.apply(this,args);}finally{if(old===undefined)emissions.delete(collection);else emissions.set(collection,old);}
  };
 }
 const collection=Thing.CThing_Collection.prototype as any,add=collection.AddThing_Shot;
 const effect=collection.AddThing_Effect;collection.AddThing_Effect=function(this:any,t:any):any{
  if(t._CLASSID_==='CThing_Effect_MuzzleFlash')flashes.set(t,emissions.get(this)??false);
  return effect.call(this,t);
 };
 collection.AddThing_Shot=function(this:any,shot:any):any{
  const name=shot.mParent?.mWeapon_Current?.mNameID;
  if(['pistol','uzi','shotgun','railgun'].includes(name))kinds.set(shot,name);
  return add.call(this,shot);
 };
 for(const ctor of [Thing.Shot.CThing_Shot_Bullet,Thing.Shot.CThing_Shot_Railgun]){
  const p=ctor.prototype,draw=p.Draw;p.Draw=function(this:any):any{
   if(classic.has(CMain._this))return draw.call(this);
   const segment=tracerSegment(this);if(!segment)return;
   drawTracer(this.mWorld.mcScratch,this.mWorld.GetScreenPosition(segment.start),this.mWorld.GetScreenPosition(segment.end),
    ctor===Thing.Shot.CThing_Shot_Railgun?'railgun':kinds.get(this)??'pistol',!!this.mEnchanted,segment.fade);
  };
 }
 const rocket=Thing.Shot.CThing_Shot_Rocket.prototype as any,draw=rocket.Draw;
 rocket.Draw=function(this:any):any{
  if(classic.has(CMain._this))return draw.call(this);
  const p=this.mWorld.GetScreenPosition(this.mPosition),q=this.mWorld.GetScreenPosition(this.mPosition.Add(this.mAngle.__get__mDelta()));
  const w=this.mWorld,clip=drawClip(w);
  drawRocket(clip,p,{x:q.x-p.x,y:q.y-p.y},!!this.mEnchanted,w.mTick);
  // Render in the original map-cell slot: nearby characters and cover keep their authored occlusion order.
  w.RenderMCToDraw(clip,w.bmCurrentDraw);
 };
 const muzzle=Thing.Effect.CThing_Effect_MuzzleFlash.prototype as any,oldMuzzle=muzzle.Draw;
 muzzle.Draw=function(this:any):any{
  if(classic.has(CMain._this))return oldMuzzle.call(this);
  const w=this.mWorld,clip=drawClip(w),p=w.GetScreenPosition(this.mPosition),q=w.GetScreenPosition(this.mPosition.Add(this.mAngle.__get__mDelta()));
  const length=Math.hypot(q.x-p.x,q.y-p.y);if(!length)return;
  const rail=this.mcDrawObject===Thing.Weapon.CThing_Weapon_Railgun.mcMuzzleFlash,enchanted=flashes.get(this),fx=(q.x-p.x)/length,fy=(q.y-p.y)/length;
  const glow=enchanted?0xab65e5:rail?0x4fa5c9:0xd9a04a,core=enchanted?0xf2ddff:rail?0xddf9ff:0xffefce;
  // Short tapered lobe starts at the authored muzzle; its white centre never covers the receiver.
  for(const [size,width,color,alpha]of [[rail?10:9,rail?2:2.8,glow,65],[rail?6:5,1.2,core,95]]){
   clip.lineStyle();clip.beginFill(color,alpha);clip.moveTo(p.x,p.y);
   for(const [x,y]of [[2,-width],[size,0],[2,width],[0,0]])clip.lineTo(p.x+fx*x-fy*y,p.y+fy*x+fx*y);clip.endFill();
  }w.RenderMCToDraw(clip,w.bmCurrentDraw);
 };
}
