// ENEMY_VARIANTS: derive independent XSI geometry/materials, then use the original loading-time baker.
import {DrawPrimitive,Thing} from '../packages.ts';
import type {EnemyVariant} from './EnemyVariants.ts';
const caches=new WeakMap<object,Partial<Record<EnemyVariant,any>>>();
function copy(v:any):any{if(Array.isArray(v))return v.map(copy);if(v&&typeof v==='object'){const o:any={};for(const k of Object.keys(v))if(k!=='mcBMD'&&k!=='sBMD')o[k]=copy(v[k]);return o;}return v;}
function bounds(model:any):number[]{const p=(model.Shape_vList??[]).flat();return [Math.min(...p.filter((_:any,i:number)=>i%2===0)),Math.min(...p.filter((_:any,i:number)=>i%2)),Math.max(...p.filter((_:any,i:number)=>i%2===0)),Math.max(...p.filter((_:any,i:number)=>i%2))];}
function polygon(model:any,points:number[],material:string,brightness:number):void{
 // New faces paint above the underlying part, sharing its direction-dependent occlusion plane.
 model.Shape_vList.unshift(points);model.Shape_Matrix.unshift(undefined);model.Shape_Material.unshift(material);model.Shape_Brightness.unshift(brightness);
}
function solid(model:any,cx:number,cy:number,angle:number,width:number,depth:number,height:number,material:string):void{
 const c=Math.cos(angle),s=Math.sin(angle),project=(x:number,y:number,z:number):number[]=>[cx+c*x-s*y,cy+.62*(s*x+c*y)-z];
 const v=[[-width/2,-depth/2,0],[width/2,-depth/2,0],[width/2,depth/2,0],[-width/2,depth/2,0],[-width/2,-depth/2,height],[width/2,-depth/2,height],[width/2,depth/2,height],[-width/2,depth/2,height]].map(p=>project(p[0]!,p[1]!,p[2]!));
 const faces=[{ids:[0,1,5,4],shade:-.35,depth:-s},{ids:[1,2,6,5],shade:-.12,depth:c},{ids:[2,3,7,6],shade:-.3,depth:s},{ids:[3,0,4,7],shade:.1,depth:-c}].filter(f=>f.depth>0).sort((a,b)=>a.depth-b.depth);
 for(const f of [...faces,{ids:[4,5,6,7],shade:.4,depth:2}])polygon(model,f.ids.flatMap(i=>v[i]!),material,f.shade);
 // Geometry contributes its own silhouette edge; original per-part outline/shadow remain intact.
 for(const f of faces)model.PEdge.push([...f.ids.flatMap(i=>v[i]!),...v[f.ids[0]!]!]);
}
function editPart(model:any,name:string,kind:EnemyVariant,angle:number,phase:number,pose:string,up:number[]):void{
 if(!model.Shape_vList?.length)return;
 const [x0,y0,x1,y1]=bounds(model) as [number,number,number,number],cx=(x0+x1)/2,cy=(y0+y1)/2;
 const originalFaces=model.Shape_vList.length,originalEdges=model.PEdge.length;
 if(kind==='charger'){
  if(name==='UpperArm_Left'){
   solid(model,cx,y0+11,angle,29,24,13,'VariantBone');
   const sx=cx+Math.cos(angle)*9,sy=y0+7;polygon(model,[sx-5,sy,sx+2,sy-18,sx+8,sy+3],'VariantBone',.4);
  }
  if(name==='LowerArm_Right')solid(model,cx,cy+9,angle,20,18,19,'VariantRust');
  if(name==='Body')for(let i=0;i<3;i++){const x=x0+(i+.5)*(x1-x0)/3;polygon(model,[x-5,y1-14,x+5,y1-13,x+2,y1+2-(i%2)*5],'VariantCloth',-.2);}
 }else{
  if(name==='Head'){
   solid(model,cx,y0+20,angle,31,25,7,'VariantIron');
   for(let i=-1;i<=1;i++){
    const dx=Math.cos(angle)*i*13,dy=Math.sin(angle)*i*8;
    polygon(model,[cx+dx-5,y0+15+dy,cx+dx-2,y0-13+dy,cx+dx+5,y0+14+dy],'VariantGold',i===0?.35:-.12);
   }
  }
  if(name.startsWith('UpperArm'))solid(model,cx,y0+12,angle,26,23,10,'VariantIron');
  if(name.startsWith('LowerArm'))solid(model,cx,cy+7,angle,18,16,12,'VariantGold');
  if(name==='Body'){
   // Molten fissures lie inside visible torso faces, so they turn and occlude with the mesh.
   const faces=model.Shape_vList.slice(),materials=model.Shape_Material.slice();
   for(let n=0;n<faces.length;n++)if(String(materials[n]).startsWith('Body_')&&faces[n].length>=8){
    const p=faces[n],at=(u:number,v:number):number[]=>[(1-v)*((1-u)*p[0]+u*p[2])+v*((1-u)*p[6]+u*p[4]),(1-v)*((1-u)*p[1]+u*p[3])+v*((1-u)*p[7]+u*p[5])];
    polygon(model,[...at(.45,.1),...at(.56,.1),...at(.44,.46),...at(.65,.62),...at(.5,.9),...at(.53,.63),...at(.35,.48)],'VariantGold',.35);
   }
  }
 }
 // New solids share their animated part's projected long axis, including lying/death poses.
 if(!(kind==='priest'&&name==='Body')){
  const roll=Math.atan2(up[0]!,-up[1]!),c=Math.cos(roll),s=Math.sin(roll);
  const rotate=(points:number[]):void=>{for(let i=0;i<points.length;i+=2){const x=points[i]!-cx,y=points[i+1]!-cy;points[i]=cx+c*x-s*y;points[i+1]=cy+s*x+c*y;}};
  for(const p of model.Shape_vList.slice(0,model.Shape_vList.length-originalFaces))rotate(p);
  for(const p of model.PEdge.slice(originalEdges))rotate(p);
 }
 if(pose!=='base'&&!name.startsWith('Foot')){
  const amount=pose==='charge'?12:pose==='warning'?5*phase:pose==='cast'?3*Math.sin(phase*Math.PI):4*(1-phase);
  const dx=Math.cos(angle)*amount,dy=Math.sin(angle)*amount*.62+(pose==='warning'?4*phase:0);
  for(const key of ['Shape_vList','PEdge','Edge','Shadow'])for(const points of model[key]??[])for(let i=0;i<points.length;i+=2){points[i]+=dx;points[i+1]+=dy;}
  // Texture UVs move with the modified part.
  for(const m of model.Shape_Matrix??[])if(m){m.tx+=dx;m.ty+=dy;}
 }
}
function prepare(kind:EnemyVariant):any{
 const X=DrawPrimitive.XSI,DI=X.CDrawPrimitive_XSI_DI,S=X.CDrawPrimitive_XSI_StyleSheet,di=S.mXSI_DI;
 let cache=caches.get(di);if(!cache)caches.set(di,cache={});if(cache[kind])return cache[kind];
 const saved=di.mStyleSheet;kind==='charger'?S.SS_ZOMBIE():S.SS_DEVIL(Thing.Creature.CThing_Creature_Devil.mDefault_Scale);
 const sourceStyle=di.mStyleSheet,style=copy(sourceStyle);style.mID='SS_VARIANT_'+kind;style.mGroup_Remap=undefined;
 for(const model of Object.values(style.mModels)as any[])model.mGroup_Remap=undefined;
 for(const [name,color]of Object.entries({VariantBone:0xc9c6a5,VariantRust:0x794939,VariantCloth:0x384637,VariantGold:0xe6a34c,VariantIron:0x302a2a}))style.mMaterials[name]={mColor:color,mAlpha:100};
 for(const name of ['LowerArm','UpperArm','Bandana'])style.mMaterials[name].mColor=kind==='charger'?0x62705a:0x702b29;
 if(kind==='priest')for(const name of ['Body_Top','Body_Side','Body_Front','Body_Back']){delete style.mMaterials[name].mcLinkID;style.mMaterials[name].mColor=0x482322;}
 const collection=cache[kind]=new X.CDrawPrimitive_XSI_Collection();
 const zombie=kind==='charger',links:Record<string,string>={stand:zombie?'Zombie_Zombie_Stand':'Player_Stand',walk:zombie?'Zombie_Zombie_Walk':'Player_Walk',attack:zombie?'Zombie_Zombie_Attack':'Devil_Devil_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead',warning:zombie?'Zombie_Zombie_Stand':'Devil_Devil_Attack',charge:zombie?'Zombie_Zombie_Walk':'Player_Walk',cast:zombie?'Zombie_Zombie_Attack':'Devil_Devil_Attack',recovery:zombie?'Zombie_Zombie_Stand':'Player_Stand'};
 for(const [key,link]of Object.entries(links)){
  const original=DI.mAnimationSets[link],derived={...original,mID:'Variant_'+kind+'_'+key,mGroupID:'Variant_'+kind,mFrameSequence:undefined as any};
  derived.mDirections=original.mDirections.map((frames:any[],direction:number)=>{
   const custom=['warning','charge','cast','recovery'].includes(key),count=custom?Math.max(6,frames.length):frames.length;
   return Array.from({length:count},(_,index)=>{
    const frame=frames[index%frames.length],models:any={},partner=DI.mGroups[frame.rPartner]?.[frame.mAnimID]?.mDirections[direction]?.[index%frames.length]?.Models,remap=DI.mGroups[sourceStyle.mGroup_Remap]?.[frame.mAnimID]?.mDirections[direction]?.[index%frames.length]?.Models;
    for(const name of Object.keys(frame.Models)){
     const base=frame.Models[name].Empty?partner?.[name]??frame.Models[name]:frame.Models[name];
     const source=sourceStyle.mModels[name]?.mGroup_Remap?remap?.[name]??base:base;
     models[name]=copy(source??frame.Models[name]);
    }
    const centers:any={};for(const [name,model]of Object.entries(models)as [string,any][])if(model.Shape_vList?.length){const b=bounds(model);centers[name]=[(b[0]!+b[2]!)/2,(b[1]!+b[3]!)/2];}
    const vector=(a:string,b:string):number[]=>centers[a]&&centers[b]?[centers[a][0]-centers[b][0],centers[a][1]-centers[b][1]]:[0,-1];
    for(const name of Object.keys(models))editPart(models[name],name,kind,direction*Math.PI*2/original.mDirections.length,index/Math.max(1,count-1),custom?key:'base',name.includes('Arm_')?vector('UpperArm_'+name.split('_')[1],'LowerArm_'+name.split('_')[1]):vector('Head','Body'));
    return {...frame,Models:models,rPartner:undefined,mFrameIndex:index};
   });
  });
  DI.mAnimationSets[derived.mID]=derived;S.SS_APPLY(style);collection.AddItem(X.CDrawPrimitive_XSI_Animation.Load(derived.mID,key));
 }
 if(saved)S.SS_APPLY(saved);return collection;
}
export function variantCollection(kind:EnemyVariant):any{return prepare(kind);}
export function installVariantArt():void{
 for(const [ctor,kind]of [[Thing.Creature.CThing_Creature_Zombie,'charger'],[Thing.Creature.CThing_Creature_Devil,'priest']]as const){
  const get=ctor.GetCollection;ctor.GetCollection=function():any{const base=get.call(this);prepare(kind);return base;};
 }
}
