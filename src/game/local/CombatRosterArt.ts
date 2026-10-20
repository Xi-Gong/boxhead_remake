// New silhouettes share the original feet, metadata and return frames. All baking happens while loading.
import {DrawPrimitive,Thing} from '../packages.ts';
import {copy,bounds,polygon,solid} from './VariantArt.ts';
import type {CombatKind} from './CombatRosterRules.ts';
import {freshMeshMaterials,freshEnemyModels} from './EnemyMesh.ts';
const caches=new WeakMap<object,Record<string,any>>();
function edit(model:any,name:string,kind:CombatKind,angle:number):void{
 if(!model.Shape_vList?.length||name.startsWith('Foot')||name.startsWith('GunPosition'))return;
 const [x0,y0,x1,y1]=bounds(model) as [number,number,number,number],cx=(x0+x1)/2,cy=(y0+y1)/2;
 if(kind==='brute'&&(name==='Body'||name.startsWith('UpperArm'))){
  const scale=name==='Body'?1.45:1.2;
  for(const key of ['Shape_vList','PEdge','Edge','Shadow'])for(const points of model[key]??[])for(let i=0;i<points.length;i+=2)points[i]=cx+(points[i]-cx)*scale;
  for(const m of model.Shape_Matrix??[])if(m){m.a*=scale;m.c*=scale;m.tx=cx+(m.tx-cx)*scale;}
 }
 if(name==='Body'){
  for(let n=0;n<model.Shape_vList.length;n++)if(String(model.Shape_Material[n]).startsWith('Body_'))model.Shape_Matrix[n]=undefined;
  const faces=model.Shape_vList.slice(),materials=model.Shape_Material.slice();
  for(let n=0;n<faces.length;n++)if(String(materials[n]).startsWith('Body_')&&faces[n].length===8){
   const p=faces[n],at=(u:number,v:number):number[]=>[(1-v)*((1-u)*p[0]+u*p[2])+v*((1-u)*p[6]+u*p[4]),(1-v)*((1-u)*p[1]+u*p[3])+v*((1-u)*p[7]+u*p[5])];
   const patch=(q:number[][],mat:string)=>polygon(model,q.flatMap(([u,v])=>at(u!,v!)),mat,0);
   if(kind==='runner'){
    patch([[.15,.05],[.29,.05],[.8,.94],[.65,.94]],'RosterBand');
    for(const y of [.34,.55,.75])patch([[.46,y],[.71,y+.04],[.63,y+.13],[.39,y+.07]],'RosterWound');
   }else{
    patch([[.08,.08],[.22,.08],[.22,.96],[.08,.96]],'RosterBand');patch([[.78,.08],[.92,.08],[.92,.96],[.78,.96]],'RosterBand');
    patch([[.22,.52],[.78,.52],[.74,.94],[.25,.94]],'RosterApron');
    patch([[.4,.2],[.57,.24],[.52,.49],[.35,.44]],'RosterWound');
   }
  }
 }
 if(kind==='runner'&&name.startsWith('LowerArm'))solid(model,cx,cy+3,angle,19,14,3,'RosterBand');
 if(kind==='brute'&&name.startsWith('LowerArm')){solid(model,cx,cy+8,angle,26,22,12,'RosterApron',.9);solid(model,cx,cy+2,angle,27,23,4,'RosterBand');}
 if(name==='Head'){
  // Broken brow/face scars stay in the animated head's own plane, including death poses.
  const y=y0+(y1-y0)*.56;
  polygon(model,[cx-7,y-2,cx+7,y-2,cx+7,y+2,cx-7,y+2],'RosterWound',-.1);
 }
}
export function combatCollection(kind:CombatKind,legacy=false):any{
 const X=DrawPrimitive.XSI,DI=X.CDrawPrimitive_XSI_DI,S=X.CDrawPrimitive_XSI_StyleSheet,di=S.mXSI_DI;
 const cacheKey=kind+(legacy?'Legacy':'Fresh');let cache=caches.get(di);if(!cache)caches.set(di,cache={});if(cache[cacheKey])return cache[cacheKey];
 const saved=di.mStyleSheet;S.SS_ZOMBIE();const source=di.mStyleSheet,style=copy(source),identity=(legacy?'Combat_':'FreshCombat_')+kind;
 style.mID='SS_'+identity;style.mGroup_Remap=undefined;for(const m of Object.values(style.mModels)as any[])m.mGroup_Remap=undefined;
 for(const [name,color]of Object.entries({RosterBand:kind==='runner'?0xa48553:0x726954,RosterWound:0x873e35,RosterApron:0x50443a}))style.mMaterials[name]={mColor:color,mAlpha:100};
 for(const name of ['Body_Top','Body_Side','Body_Front','Body_Back']){delete style.mMaterials[name].mcLinkID;style.mMaterials[name].mColor=kind==='runner'?0x394c4f:0x77704c;}
 for(const name of ['UpperArm','LowerArm','Bandana'])style.mMaterials[name].mColor=kind==='runner'?0x86968a:0xa29b70;
 if(!legacy)freshMeshMaterials(style,kind);
 const collection=cache[cacheKey]=new X.CDrawPrimitive_XSI_Collection();
 const links={stand:'Zombie_Zombie_Stand',walk:'Zombie_Zombie_Walk',attack:'Zombie_Zombie_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead'};
 try{for(const [key,link]of Object.entries(links)){
  const original=DI.mAnimationSets[link],derived={...original,mID:identity+'_'+key,mGroupID:identity,mFrameSequence:original.mFrameSequence?.slice()};
  derived.mDirections=original.mDirections.map((frames:any[],direction:number)=>frames.map((frame:any,index:number)=>{
   const partner=DI.mGroups[frame.rPartner]?.[frame.mAnimID]?.mDirections[direction]?.[index]?.Models,remap=DI.mGroups[source.mGroup_Remap]?.[frame.mAnimID]?.mDirections[direction]?.[index]?.Models,models:any={};
   for(const name of Object.keys(frame.Models)){
    const base=frame.Models[name].Empty?partner?.[name]??frame.Models[name]:frame.Models[name];
    models[name]=copy(source.mModels[name]?.mGroup_Remap?remap?.[name]??base:base);if(legacy)edit(models[name],name,kind,direction*Math.PI*2/original.mDirections.length);
   }
   if(!legacy)freshEnemyModels(models,kind,direction*Math.PI*2/original.mDirections.length,original.mTilt,original.mLight);
   return {...frame,Models:models,rPartner:undefined};
  }));DI.mAnimationSets[derived.mID]=derived;S.SS_APPLY(style);collection.AddItem(X.CDrawPrimitive_XSI_Animation.Load(derived.mID,key));
 }}finally{if(saved)S.SS_APPLY(saved);}return collection;
}
export function installCombatRosterArt():void{
 const ctor=Thing.Creature.CThing_Creature_Zombie,get=ctor.GetCollection;
 ctor.GetCollection=function():any{const base=get.call(this);combatCollection('runner');combatCollection('brute');return base;};
}
