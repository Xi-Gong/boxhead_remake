// WEAPON_ART: independent loading-time geometry; authored animation timing and simulation anchors stay intact.
import {CMain,DrawPrimitive,Thing} from '../packages.ts';
export const GUN_LINKS={pistol:'Handgun',uzi:'UZI',shotgun:'Shotgun',rocket:'Rocket',railgun:'Railgun'} as const;
export type GunArtKind=keyof typeof GUN_LINKS;
export const palette={GunSteel:0x9caeb8,GunBlueSteel:0x526b78,GunDark:0x29333b,GunGrip:0x34302c,GunWood:0xa76c3e,
  GunWoodLight:0xc58b51,GunOlive:0x72805b,GunOliveDark:0x48573d,GunBand:0xa7aa91,GunBore:0x111b20,GunCold:0x77c8d6,GunBrass:0xcba65e};
type Point=[number,number,number];
interface Face {points:number[];material:string;shade:number;depth:number}
const classic=new WeakSet<object>(),collections=new WeakMap<object,any>(),sets=new WeakMap<object,any>();
export function setClassicWeaponArtFixture(main:object):void{classic.add(main);}
function area(p:number[]):number{let a=0;for(let i=0;i<p.length;i+=2){const j=(i+2)%p.length;a+=p[i]!*p[j+1]!-p[j]!*p[i+1]!;}return a/2;}

/** Build in a rigid frame from the two original anchors, so recoil/walk motion cannot move the barrel exit. */
export function weaponGeometry(frame:any,kind:GunArtKind,tilt:number,light:any):any{
  const original=frame.Models.Weapon_Right,origin=frame.Models.GunPosition_Right?.XSIInfo?.vPosition,hand=frame.Models.Hand_Right?.XSIInfo?.vPosition;
  if(!origin||!hand)return original;
  const dx=origin.mX-hand.mX,dy=origin.mY-hand.mY,length=Math.hypot(dx,dy),fx=dx/length,fy=dy/length,c=Math.cos(tilt),s=Math.sin(tilt);
  const faces:Face[]=[],transform=([x,y,z]:Point):Point=>[origin.mX+fx*x-fy*y,origin.mY+fy*x+fx*y,origin.mZ+z];
  const project=([x,y,z]:Point):number[]=>[x,-s*y+c*z];
  const mesh=(vertices:Point[],indices:number[][],material:string,frontMaterial=material):void=>{
    const v=vertices.map(transform);
    for(let face=0;face<indices.length;face++){
      const ids=indices[face]!,points=ids.flatMap(i=>project(v[i]!));if(area(points)<1e-5)continue;
      const a=v[ids[0]!]!,b=v[ids[1]!]!,d=v[ids[2]!]!,u=b.map((n,i)=>n-a[i]!),w=d.map((n,i)=>n-a[i]!);
      const nx=u[1]!*w[2]!-u[2]!*w[1]!,ny=u[2]!*w[0]!-u[0]!*w[2]!,nz=u[0]!*w[1]!-u[1]!*w[0]!,norm=Math.hypot(nx,ny,nz);
      // Same world light, with limited contrast so steel side planes remain legible at the native 0.35 scale.
      const shade=Math.max(-.35,Math.min(.28,.5*(nx*light.mX+ny*light.mY+nz*light.mZ)/norm));
      const depth=ids.reduce((sum,i)=>sum+v[i]![1]*c+v[i]![2]*s,0)/ids.length;
      faces.push({points,material:face===indices.length-1?frontMaterial:material,shade,depth});
    }
  };
  const box=(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,material:string):void=>mesh(
    [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
    [[0,3,2,1],[0,1,5,4],[3,7,6,2],[4,5,6,7],[0,4,7,3],[1,2,6,5]],material);
  const tube=(x0:number,x1:number,r:number,material:string,frontMaterial=material,y=0,z=0):void=>{
    const v:Point[]=[];for(const x of [x0,x1])for(let i=0;i<8;i++){const a=i*Math.PI/4;v.push([x,y+Math.cos(a)*r,z+Math.sin(a)*r]);}
    const ids:number[][]=[];for(let i=0;i<8;i++)ids.push([i,(i+1)%8,(i+1)%8+8,i+8]);
    ids.push([7,6,5,4,3,2,1,0],[8,9,10,11,12,13,14,15]);mesh(v,ids,material,frontMaterial);
  };
  const grip=()=>box(-length-4,-length+4,-3.5,3.5,4,hand.mZ-origin.mZ+8,'GunGrip');
  if(kind==='pistol'){
    grip();box(-34,-3,-3.6,3.6,-4,4,'GunSteel');box(-31,-9,-4,4,3,6,'GunDark');
    tube(-7,0,2.8,'GunBlueSteel','GunBore');box(-9,-6,-1.2,1.2,-6,-4,'GunDark');
    box(-31,-28,-2.4,2.4,-6,-4,'GunDark');box(-26,-22,-3.8,-3.5,-2,2,'GunBlueSteel');
  }else if(kind==='uzi'){
    box(-34,-7,-5,5,-6,8,'GunBlueSteel');box(-33,-8,-4.5,4.5,-7,-5,'GunSteel');
    grip();box(-length-4,-length+3,-3.5,3.5,13,30,'GunDark');box(-length-5,-length+4,-4,4,28,31,'GunSteel');
    tube(-8,0,3,'GunDark','GunBore');box(-23,-17,-1.5,1.5,-11,-7,'GunDark');
    box(-33,-28,-2,2,-9,-6,'GunDark');box(-7,-4,-1,1,-8,-3,'GunSteel');
  }else if(kind==='shotgun'){
    box(-60,-44,-4,4,3,13,'GunWood');box(-62,-59,-4.5,4.5,1,15,'GunDark');grip();
    box(-44,-24,-4,4,-3,6,'GunBlueSteel');tube(-28,0,3,'GunSteel','GunBore');tube(-27,-5,2,'GunDark','GunDark',0,5);
    box(-27,-14,-4.5,4.5,2,10,'GunWood');for(const x of [-24,-20,-16])box(x,x+1,-4.8,4.8,3,9,'GunWoodLight');
    box(-4,-2,-1,1,-5,-3,'GunBrass');
  }else if(kind==='rocket'){
    tube(-81,-2,9,'GunOlive');tube(-83,-78,10.5,'GunOliveDark','GunBore');tube(-4,0,10,'GunBand','GunBore');
    for(const x of [-64,-25])tube(x,x+4,10,'GunBand');grip();
    box(-42,-35,-2,2,-17,-9,'GunDark');box(-44,-33,-2.3,2.3,-18,-15,'GunSteel');
    box(-52,-45,-9.2,-8.8,-2,3,'GunBrass');
  }else{
    box(-65,-47,-4,4,3,12,'GunDark');box(-65,-61,-5,5,1,14,'GunSteel');grip();
    box(-49,-17,-6,6,-5,7,'GunBlueSteel');box(-45,-20,-5,5,-7,-5,'GunSteel');
    for(const side of [-1,1]){box(-26,0,side*5-1.8,side*5+1.8,-3,3,'GunSteel');box(-23,-4,side*5-1.9,side*5+1.9,-3.7,-3,'GunCold');}
    box(-20,-2,-2.2,2.2,-1.8,1.8,'GunBore');box(-2,0,-2,2,-1.8,1.8,'GunCold');
    box(-42,-32,-6.4,-6,-2,2,'GunCold');box(-42,-32,6,6.4,-2,2,'GunCold');
  }
  faces.sort((a,b)=>a.depth-b.depth);
  return {...original,Empty:false,PEdge:[],Edge:[],Shape_vList:faces.map(f=>f.points),Shape_Matrix:faces.map(()=>undefined),
    Shape_Material:faces.map(f=>f.material),Shape_Brightness:faces.map(f=>f.shade)};
}
export function derivedWeaponSet(original:any,kind:GunArtKind):any{
  let derived=sets.get(original);if(derived)return derived;
  derived={...original,mID:'Polished_'+original.mID,mFrameSequence:original.mFrameSequence?.slice(),
    mDirections:original.mDirections.map((frames:any[])=>frames.map(frame=>({...frame,Models:{...frame.Models,
      Weapon_Right:weaponGeometry(frame,kind,original.mTilt,original.mLight)}})))};
  sets.set(original,derived);return derived;
}
export function polishedWeaponCollection(original:any,skin:number):any{
  let collection=collections.get(original);if(collection)return collection;
  const X=DrawPrimitive.XSI,S=X.CDrawPrimitive_XSI_StyleSheet,di=S.mXSI_DI,saved=di.mStyleSheet;
  S[['SS_SWAT','SS_BOND','SS_GIJOE','SS_BAMBO'][skin]!]();
  const source=di.mStyleSheet,style={...source,mID:'SS_POLISHED_'+skin,mMaterials:{...source.mMaterials}};
  for(const [name,color] of Object.entries(palette))style.mMaterials[name]={mColor:color,mAlpha:100};
  collection=new X.CDrawPrimitive_XSI_Collection();collection.mItems={...original.mItems};
  try{
    for(const [kind,link] of Object.entries(GUN_LINKS))for(const action of ['Stand','Walk']){
      const sourceSet=X.CDrawPrimitive_XSI_DI.mAnimationSets['Player_'+link+'_'+action],derived=derivedWeaponSet(sourceSet,kind as GunArtKind);
      X.CDrawPrimitive_XSI_DI.mAnimationSets[derived.mID]=derived;S.SS_APPLY(style);
      collection.AddItem(X.CDrawPrimitive_XSI_Animation.Load(derived.mID,kind+action.toLowerCase()));
    }
  }finally{if(saved)S.SS_APPLY(saved);}
  collections.set(original,collection);return collection;
}
export function installWeaponArt():void{
  const player=Thing.Creature.CThing_Creature_Player,get=player.GetCollection;
  player.GetCollection=function(skin:number):any{
    const original=get.call(this,skin);return classic.has(CMain._this)?original:polishedWeaponCollection(original,skin);
  };
}
