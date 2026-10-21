import {DrawPrimitive,Thing} from '../packages.ts';
import {copy,polygon} from './VariantArt.ts';
import {derivedWeaponSet,palette,GUN_LINKS} from './WeaponArt.ts';
import {freshMeshMaterials,freshEnemyModels} from './EnemyMesh.ts';
import {expandedEnemyArtConfigured} from './Combat.ts';
export type EnemyGun='pistol'|'uzi'|'shotgun';
export const ENEMY_GUNS:readonly EnemyGun[]=['pistol','uzi','shotgun'];
const caches=new WeakMap<object,Map<string,any>>();
function scar(model:any,name:string):void{
 if(!['Body','Head'].includes(name))return;
 const faces=model.Shape_vList?.slice()??[],materials=model.Shape_Material?.slice()??[];
 for(let n=0;n<faces.length;n++)if(faces[n].length===8&&String(materials[n]).startsWith(name+'_')){
  const p=faces[n],at=(u:number,v:number)=>[(1-v)*((1-u)*p[0]+u*p[2])+v*((1-u)*p[6]+u*p[4]),(1-v)*((1-u)*p[1]+u*p[3])+v*((1-u)*p[7]+u*p[5])];
  const q=name==='Body'?[[.13,.05],[.43,.09],[.7,.85],[.59,.96],[.49,.52],[.24,.35]]:[[.17,.4],[.3,.35],[.71,.8],[.56,.85]];
  polygon(model,q.flatMap(([u,v])=>at(u!,v!)),'GunnerBlood',-.1);
  if(name==='Head')polygon(model,[[.1,.53],[.85,.53],[.85,.6],[.1,.6]].flatMap(([u,v])=>at(u!,v!)),'GunnerEye',0);
 }
}
export function gunnerCollection(skin:number,gun:EnemyGun):any{
 const X=DrawPrimitive.XSI,DI=X.CDrawPrimitive_XSI_DI,S=X.CDrawPrimitive_XSI_StyleSheet,di=S.mXSI_DI;
 let cache=caches.get(di);if(!cache)caches.set(di,cache=new Map());const key=skin+':'+gun;if(cache.has(key))return cache.get(key);
 let base=cache.get(String(skin));if(!base){
  const saved=di.mStyleSheet;S[['SS_SWAT','SS_BOND','SS_GIJOE','SS_BAMBO'][skin]!]();const source=di.mStyleSheet,style=copy(source),identity='Gunner_'+skin;
  style.mID='SS_'+identity;style.mGroup_Remap=undefined;for(const m of Object.values(style.mModels)as any[])m.mGroup_Remap=undefined;
  for(const [name,color]of Object.entries({...palette,GunnerBlood:0x843d36,GunnerEye:0xd77a52}))style.mMaterials[name]={mColor:color,mAlpha:100};
  if(skin===2||skin===3)style.mMaterials.Hand.mColor=0x8f9b7f;
  freshMeshMaterials(style,'gunner',skin);
  base=new X.CDrawPrimitive_XSI_Collection();
  const links:Record<string,string>={stand:'Player_Stand',walk:'Player_Walk',attack:'Zombie_Zombie_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead'};
  for(const weapon of ENEMY_GUNS)for(const action of ['stand','walk'])links[weapon+action]='Player_'+GUN_LINKS[weapon]+'_'+(action==='stand'?'Stand':'Walk');
  try{for(const [action,link]of Object.entries(links)){
   const weapon=ENEMY_GUNS.find(k=>action.startsWith(k)),raw=DI.mAnimationSets[link],original=weapon?derivedWeaponSet(raw,weapon):raw;
   const derived={...original,mID:identity+'_'+action,mGroupID:identity,mFrameSequence:original.mFrameSequence?.slice()};
   derived.mDirections=original.mDirections.map((frames:any[],d:number)=>frames.map((frame:any,i:number)=>{
    const partner=DI.mGroups[frame.rPartner]?.[frame.mAnimID]?.mDirections[d]?.[i]?.Models,remap=DI.mGroups[source.mGroup_Remap]?.[frame.mAnimID]?.mDirections[d]?.[i]?.Models,models:any={};
    for(const name of Object.keys(frame.Models)){
     const native=frame.Models[name].Empty?partner?.[name]??frame.Models[name]:frame.Models[name];models[name]=copy(source.mModels[name]?.mGroup_Remap?remap?.[name]??native:native);
    }
    freshEnemyModels(models,'gunner',d*Math.PI*2/original.mDirections.length,original.mTilt,original.mLight,false,skin);
    return {...frame,Models:models,rPartner:undefined};
   }));DI.mAnimationSets[derived.mID]=derived;S.SS_APPLY(style);base.AddItem(X.CDrawPrimitive_XSI_Animation.Load(derived.mID,action));
  }}finally{if(saved)S.SS_APPLY(saved);}cache.set(String(skin),base);
 }
 const view=new X.CDrawPrimitive_XSI_Collection();view.mItems={...base.mItems,stand:base.mItems[gun+'stand'],walk:base.mItems[gun+'walk']};cache.set(key,view);return view;
}
export function installGunnerArt():void{
 const ctor=Thing.Creature.CThing_Creature_Zombie,get=ctor.GetCollection;
 ctor.GetCollection=function():any{const base=get.call(this);if(expandedEnemyArtConfigured())for(let skin=0;skin<4;skin++)for(const gun of ENEMY_GUNS)gunnerCollection(skin,gun);return base;};
}
