import {DrawPrimitive,Thing} from '../packages.ts';
import {copy,bounds,polygon,solid,horn} from './VariantArt.ts';
import {freshMeshMaterials,freshEnemyModels} from './EnemyMesh.ts';
export type DemonKind='butcher'|'hunter';
const caches=new WeakMap<object,Map<string,any>>();
function edit(model:any,name:string,kind:DemonKind,boss:boolean,angle:number,up:number[]):void{
 if(!model.Shape_vList?.length||name.startsWith('Foot'))return;
 const [x0,y0,x1,y1]=bounds(model)as[number,number,number,number],cx=(x0+x1)/2,cy=(y0+y1)/2,faces=model.Shape_vList.length,edges=model.PEdge.length;
 if(name==='Body'){
  const native=model.Shape_vList.slice(),mats=model.Shape_Material.slice();
  for(let n=0;n<native.length;n++)if(String(mats[n]).startsWith('Body_')&&native[n].length===8){
   const p=native[n],at=(u:number,v:number)=>[(1-v)*((1-u)*p[0]+u*p[2])+v*((1-u)*p[6]+u*p[4]),(1-v)*((1-u)*p[1]+u*p[3])+v*((1-u)*p[7]+u*p[5])];
   const patch=(q:number[][],mat:string)=>polygon(model,q.flatMap(([u,v])=>at(u!,v!)),mat,0);model.Shape_Matrix[n]=undefined;
   if(kind==='butcher'){
    patch([[.12,.05],[.25,.05],[.83,.94],[.68,.94]],'DemonStrap');patch([[.16,.49],[.84,.49],[.8,.97],[.2,.97]],'DemonApron');
    for(let i=0;i<3;i++)patch([[.33+i*.12,.58],[.38+i*.12,.6],[.43+i*.12,.9],[.37+i*.12,.85]],'DemonWound');
   }else{
    patch([[.05,.08],[.25,.12],[.43,.96],[.18,.96]],'DemonMetal');patch([[.75,.12],[.95,.08],[.82,.96],[.57,.96]],'DemonMetal');
    patch([[.5,.13],[.67,.4],[.5,.68],[.33,.4]],'DemonGlow');patch([[.5,.25],[.58,.4],[.5,.53],[.42,.4]],'DemonMetal');
    for(const y of [.72,.87])patch([[.3,y],[.7,y],[.7,y+.04],[.3,y+.04]],'DemonStrap');
   }
  }
 }
 if(name.startsWith('UpperArm')){
  const size=kind==='butcher'?boss?39:32:boss?32:26;solid(model,cx,y0+14,angle,size,size*.8,8,'DemonMetal',.7);solid(model,cx,y0+9,angle,size-3,size*.7,4,'DemonRim');
  if(boss||kind==='hunter')horn(model,cx,y0+3,angle,8,8,boss?17:10,4,'DemonRim');
 }
 if(name.startsWith('LowerArm')){
  solid(model,cx,cy+8,angle,kind==='butcher'?25:20,18,12,'DemonMetal',.85);solid(model,cx,cy+3,angle,24,19,3,'DemonRim');
  if(kind==='hunter'){solid(model,cx,cy-1,angle,14,15,3,'DemonGlow');solid(model,cx,cy-4,angle,6,16,3,'DemonMetal');}
 }
 if(kind==='butcher'&&name==='LowerArm_Right'){
  solid(model,cx,cy+4,angle,7,8,27,'DemonStrap');solid(model,cx,cy-14,angle,boss?34:28,6,boss?31:25,'DemonRim',.92);
  solid(model,cx,cy-13,angle,boss?35:29,6,3,'DemonWound');
 }
 if(name==='Head'){
  solid(model,cx,y0+18,angle,27,23,7,'DemonMetal',.86);solid(model,cx,y0+12,angle,27,24,3,'DemonRim');
  if(kind==='hunter'||boss)for(const side of [-1,1])horn(model,cx+Math.cos(angle)*side*11,y0+8+Math.sin(angle)*side*7,angle,8,8,boss?25:17,side*9,'DemonRim');
  if(boss)horn(model,cx,y0+7,angle,9,8,27,0,'DemonGlow');
 }
 // Added equipment follows the part's projected long axis in both upright and lying poses.
 if(name!=='Body'){
  const a=Math.atan2(up[0]!,-up[1]!),c=Math.cos(a),s=Math.sin(a);
  for(const points of [...model.Shape_vList.slice(0,model.Shape_vList.length-faces),...model.PEdge.slice(edges)])for(let i=0;i<points.length;i+=2){const x=points[i]!-cx,y=points[i+1]!-cy;points[i]=cx+c*x-s*y;points[i+1]=cy+s*x+c*y;}
 }
 for(let n=model.Shape_vList.length-1;n>=0;n--){const p=model.Shape_vList[n];let area=0;for(let i=0;i<p.length;i+=2){const j=(i+2)%p.length;area+=p[i]*p[j+1]-p[j]*p[i+1];}if(Math.abs(area)<1e-5)for(const key of ['Shape_vList','Shape_Matrix','Shape_Material','Shape_Brightness'])model[key].splice(n,1);}
}
export function demonCollection(kind:DemonKind,boss=false,legacy=false):any{
 const X=DrawPrimitive.XSI,DI=X.CDrawPrimitive_XSI_DI,S=X.CDrawPrimitive_XSI_StyleSheet,di=S.mXSI_DI,key=kind+(boss?'Boss':'')+(legacy?'Legacy':'Fresh');let cache=caches.get(di);if(!cache)caches.set(di,cache=new Map());if(cache.has(key))return cache.get(key);
 const saved=di.mStyleSheet;S.SS_DEVIL(Thing.Creature.CThing_Creature_Devil.mDefault_Scale);const source=di.mStyleSheet,style=copy(source),identity=(legacy?'Demon_':'FreshDemon_')+kind+(boss?'Boss':'');
 style.mID='SS_'+identity;style.mGroup_Remap=undefined;for(const m of Object.values(style.mModels)as any[])m.mGroup_Remap=undefined;
 const palette={DemonMetal:kind==='butcher'?0x4f514e:0x354957,DemonRim:kind==='butcher'?0xa3a596:0x9caeae,DemonStrap:0x5c4337,DemonApron:0x8b7b61,DemonWound:0x8b3e33,DemonGlow:kind==='butcher'?0xcc6c42:0x8ad0c9};
 for(const [name,color]of Object.entries(palette))style.mMaterials[name]={mColor:color,mAlpha:100};
 for(const name of ['Body_Top','Body_Side','Body_Front','Body_Back']){delete style.mMaterials[name].mcLinkID;style.mMaterials[name].mColor=kind==='butcher'?0x554438:0x2d3944;}
 for(const name of ['UpperArm','LowerArm','Bandana'])style.mMaterials[name].mColor=kind==='butcher'?0x91594a:0x576c74;
 if(!legacy)freshMeshMaterials(style,kind);
 const c=new X.CDrawPrimitive_XSI_Collection();cache.set(key,c);
 try{for(const [action,link]of Object.entries({stand:'Player_Stand',walk:'Player_Walk',attack:'Devil_Devil_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead'})){
  const original=DI.mAnimationSets[link],derived={...original,mID:identity+'_'+action,mGroupID:identity,mFrameSequence:original.mFrameSequence?.slice()};
  derived.mDirections=original.mDirections.map((frames:any[],d:number)=>frames.map((frame:any,i:number)=>{
   const partner=DI.mGroups[frame.rPartner]?.[frame.mAnimID]?.mDirections[d]?.[i]?.Models,remap=DI.mGroups[source.mGroup_Remap]?.[frame.mAnimID]?.mDirections[d]?.[i]?.Models,models:any={},centers:any={};
   for(const name of Object.keys(frame.Models)){const base=frame.Models[name].Empty?partner?.[name]??frame.Models[name]:frame.Models[name];models[name]=copy(source.mModels[name]?.mGroup_Remap?remap?.[name]??base:base);if(models[name].Shape_vList?.length){const b=bounds(models[name]);centers[name]=[(b[0]!+b[2]!)/2,(b[1]!+b[3]!)/2];}}
   const vector=(a:string,b:string)=>centers[a]&&centers[b]?[centers[a][0]-centers[b][0],centers[a][1]-centers[b][1]]:[0,-1];
   if(legacy)for(const name of Object.keys(models))edit(models[name],name,kind,boss,d*Math.PI*2/original.mDirections.length,name.includes('Arm_')||name.startsWith('Hand_')?vector('UpperArm_'+name.split('_')[1],'LowerArm_'+name.split('_')[1]):vector('Head','Body'));
   else freshEnemyModels(models,kind,d*Math.PI*2/original.mDirections.length,original.mTilt,original.mLight,boss);
   return {...frame,Models:models,rPartner:undefined};
  }));DI.mAnimationSets[derived.mID]=derived;S.SS_APPLY(style);c.AddItem(X.CDrawPrimitive_XSI_Animation.Load(derived.mID,action));
 }}finally{if(saved)S.SS_APPLY(saved);}return c;
}
export function installDemonArt():void{const ctor=Thing.Creature.CThing_Creature_Devil,get=ctor.GetCollection;ctor.GetCollection=function():any{const base=get.call(this);for(const kind of ['butcher','hunter']as const){demonCollection(kind);demonCollection(kind,true);}return base;};}
