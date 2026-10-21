import {availableFeatures} from './ModernFeatures.ts';
// ENEMY_VARIANTS: derive independent XSI geometry/materials, then use the original loading-time baker.
import {CMain,DrawPrimitive,Thing} from '../packages.ts';
import type {EnemyVariant} from './EnemyVariants.ts';
import {expandedEnemyArtConfigured} from './Combat.ts';
const caches=new WeakMap<object,Record<string,any>>(),classic=new WeakSet<object>();
export function setClassicVariantArtFixture(main:object):void{classic.add(main);}
export function copy(v:any):any{if(Array.isArray(v))return v.map(copy);if(v&&typeof v==='object'){const o:any={};for(const k of Object.keys(v))if(k!=='mcBMD'&&k!=='sBMD')o[k]=copy(v[k]);return o;}return v;}
export function bounds(model:any):number[]{const p=(model.Shape_vList??[]).flat();return [Math.min(...p.filter((_:any,i:number)=>i%2===0)),Math.min(...p.filter((_:any,i:number)=>i%2)),Math.max(...p.filter((_:any,i:number)=>i%2===0)),Math.max(...p.filter((_:any,i:number)=>i%2))];}
export function polygon(model:any,points:number[],material:string,brightness:number):void{
 // New faces paint above the underlying part, sharing its direction-dependent occlusion plane.
 model.Shape_vList.unshift(points);model.Shape_Matrix.unshift(undefined);model.Shape_Material.unshift(material);model.Shape_Brightness.unshift(brightness);
}
function area(points:number[]):number{let sum=0;for(let i=0;i<points.length;i+=2){const j=(i+2)%points.length;sum+=points[i]!*points[j+1]!-points[j]!*points[i+1]!;}return sum/2;}
function mesh(model:any,cx:number,cy:number,angle:number,vertices:number[][],faces:number[][],material:string):void{
 const native=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mAnimationSets.Zombie_Zombie_Stand,tilt=native.mTilt??Math.PI/4;
 const c=Math.cos(angle),s=Math.sin(angle),v=vertices.map(([x,y,z])=>[cx+c*x!-s*y!,cy+Math.cos(tilt)*(s*x!+c*y!)-Math.sin(tilt)*z!]);
 const light=native.mLight??{mX:.17609018126512477,mY:.4402254531628119,mZ:-.8804509063256238};
 for(const ids of faces){
  const points=ids.flatMap(i=>v[i]!);if(area(points)<=1e-5)continue;
  const a=vertices[ids[0]!]!,b=vertices[ids[1]!]!,d=vertices[ids[2]!]!,u=b.map((n,i)=>n-a[i]!),w=d.map((n,i)=>n-a[i]!);
  const nx=u[1]!*w[2]!-u[2]!*w[1]!,ny=u[2]!*w[0]!-u[0]!*w[2]!,nz=u[0]!*w[1]!-u[1]!*w[0]!,length=Math.hypot(nx,ny,nz);
  const shade=-.5*((c*nx-s*ny)*light.mX+(s*nx+c*ny)*light.mY+nz*light.mZ)/length;
  polygon(model,points,material,Math.max(-.4,Math.min(.45,shade)));model.PEdge.push([...points,...v[ids[0]!]!]);
 }
}
export function solid(model:any,cx:number,cy:number,angle:number,width:number,depth:number,height:number,material:string,taper=1):void{
 const v=[[-width/2,-depth/2,0],[width/2,-depth/2,0],[width/2,depth/2,0],[-width/2,depth/2,0],[-width*taper/2,-depth*taper/2,height],[width*taper/2,-depth*taper/2,height],[width*taper/2,depth*taper/2,height],[-width*taper/2,depth*taper/2,height]];
 mesh(model,cx,cy,angle,v,[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]],material);
}
export function horn(model:any,cx:number,cy:number,angle:number,width:number,depth:number,height:number,lean:number,material:string):void{
 mesh(model,cx,cy,angle,[[-width/2,-depth/2,0],[width/2,-depth/2,0],[width/2,depth/2,0],[-width/2,depth/2,0],[lean,0,height]],[[0,1,4],[1,2,4],[2,3,4],[3,0,4]],material);
}
function faceDetails(model:any,kind:EnemyVariant,phase:number,pose:string):void{
 const faces=model.Shape_vList.slice(),materials=model.Shape_Material.slice();
 for(let n=0;n<faces.length;n++)if(String(materials[n]).startsWith('Body_'))model.Shape_Matrix[n]=undefined;
 for(let n=0;n<faces.length;n++)if(String(materials[n]).startsWith('Body_')&&faces[n].length===8){
  if(Math.abs(area(faces[n]))<=1e-5)continue;
  // Use each actual torso plane's UV coordinates. Seams and molten inlays belong to its turning surface.
  const p=faces[n],at=(u:number,v:number):number[]=>[(1-v)*((1-u)*p[0]+u*p[2])+v*((1-u)*p[6]+u*p[4]),(1-v)*((1-u)*p[1]+u*p[3])+v*((1-u)*p[7]+u*p[5])];
  const patch=(points:number[][],material:string,brightness=0):void=>polygon(model,points.flatMap(([u,v])=>at(u!,v!)),material,brightness);
  if(kind==='charger'){
   patch([[.1,.04],[.25,.04],[.88,.91],[.73,.94]],'VariantLeather',-.1);
   patch([[.13,.08],[.18,.08],[.81,.91],[.77,.91]],'VariantRust',.15);
   for(let i=0;i<3;i++){const y=.24+i*.16;patch([[.33,y],[.72,y+.06],[.7,y+.12],[.35,y+.07]],'VariantBone',-.08+i*.05);}
   patch([[.12,.89],[.88,.89],[.88,.97],[.12,.97]],'VariantLeather',-.2);
  }else{
   patch([[.08,.08],[.2,.12],[.3,.85],[.22,.92]],'VariantIron',.05);
   patch([[.8,.12],[.92,.08],[.78,.92],[.7,.85]],'VariantIron',-.15);
   patch([[.43,.12],[.58,.12],[.48,.43],[.65,.61],[.5,.88],[.53,.62],[.36,.47]],'VariantRust',.1);
   const glow=pose==='cast'?.3+.15*Math.sin(phase*Math.PI):.22;
   patch([[.48,.14],[.53,.14],[.44,.45],[.6,.61],[.5,.85],[.55,.61],[.4,.47]],'VariantGlow',glow);
   patch([[.44,.45],[.24,.32],[.27,.39],[.4,.51]],'VariantGold',.1);
   patch([[.55,.59],[.8,.47],[.77,.54],[.56,.66]],'VariantGold',.1);
   patch([[.18,.9],[.82,.9],[.84,.97],[.16,.97]],'VariantIron',-.2);
  }
 }
}
function refinedPart(model:any,name:string,kind:EnemyVariant,boss:boolean,angle:number,phase:number,pose:string,b:number[],up:number[]):void{
 const [x0,y0,x1,y1]=b as [number,number,number,number],cx=(x0+x1)/2,cy=(y0+y1)/2;
 const rotateRecent=(count:number,edges:number):void=>{
  const roll=Math.atan2(up[0]!,-up[1]!),c=Math.cos(roll),s=Math.sin(roll);
  for(const points of [...model.Shape_vList.slice(0,model.Shape_vList.length-count),...model.PEdge.slice(edges)])for(let i=0;i<points.length;i+=2){const x=points[i]!-cx,y=points[i+1]!-cy;points[i]=cx+c*x-s*y;points[i+1]=cy+s*x+c*y;}
 };
 const bracer=(material:string,band:string):void=>{
  const faces=model.Shape_vList.slice();model.Shape_Material=model.Shape_Material.map(()=>material);model.Shape_Matrix=model.Shape_Matrix.map(()=>undefined);
  for(const p of faces)if(p.length===8&&Math.abs(area(p))>1e-5){
   const at=(u:number,v:number):number[]=>[(1-v)*((1-u)*p[0]+u*p[2])+v*((1-u)*p[6]+u*p[4]),(1-v)*((1-u)*p[1]+u*p[3])+v*((1-u)*p[7]+u*p[5])];
   for(const v of [.12,.78])polygon(model,[[.02,v],[.98,v],[.98,v+.11],[.02,v+.11]].flatMap(([u,v])=>at(u!,v!)),band,-.05);
   polygon(model,[[.13,.34],[.22,.34],[.22,.43],[.13,.43]].flatMap(([u,v])=>at(u!,v!)),'VariantGold',.1);
  }
 };
 if(kind==='charger'){
  if(name.startsWith('UpperArm')){
   const heavy=boss||name.endsWith('Left'),width=boss?36:heavy?29:23;
   solid(model,cx,y0+13,angle,width,heavy?26:21,5,'VariantLeather',.9);
   solid(model,cx,y0+10,angle,width-1,heavy?25:20,heavy?12:7,'VariantBoneShade',.78);
   solid(model,cx,y0+5,angle,width-4,heavy?22:18,5,'VariantBone',.85);
   if(heavy)for(const side of [-1,1])horn(model,cx+Math.cos(angle)*side*8,y0-1+Math.sin(angle)*side*5,angle,7,7,boss?16:10,side*4,'VariantBone');
  }
  if(name.startsWith('LowerArm')){
   bracer('VariantRust','VariantIron');
   if(boss){const count=model.Shape_vList.length,edges=model.PEdge.length;horn(model,cx,cy-3,angle,11,10,10,4,'VariantBone');rotateRecent(count,edges);}
  }
  if(name==='Head'){
   solid(model,cx,y0+8,angle,26,23,5,'VariantBoneShade',.9);
   solid(model,cx,y0+6,angle,25,22,3,'VariantBone',.92);
   if(boss)for(const side of [-1,1])horn(model,cx+Math.cos(angle)*side*9,y0+2+Math.sin(angle)*side*5,angle,7,7,14,side*4,'VariantBone');
  }
  if(name==='Body'){
   faceDetails(model,kind,phase,pose);
   for(let i=0;i<3;i++){const x=x0+(i+.5)*(x1-x0)/3;polygon(model,[x-5,y1-8,x+5,y1-8,x+2,y1+2-(i%2)*4],'VariantCloth',-.08);}
   if(boss){
    // Back-mounted ribs follow the torso's facing, never a screen-space aura.
    const count=model.Shape_vList.length,edges=model.PEdge.length;
    const rearX=cx-Math.cos(angle)*9,rearY=y0+10-Math.sin(angle)*6;
    solid(model,rearX,rearY+4,angle,24,16,6,'VariantIron',.85);
    for(let i=-1;i<=1;i++)horn(model,rearX+Math.sin(angle)*i*22,rearY+Math.cos(angle)*i*14,angle,10,10,i===0?32:27,-9,'VariantBone');
    rotateRecent(count,edges);
   }
  }
 }else{
  if(name==='Head'){
   for(let i=0;i<model.Shape_Material.length;i++){
    const replacement=({Red:'VariantCrown',Black:'VariantIron',PeachPuff:'VariantGlow'}as Record<string,string>)[model.Shape_Material[i]];
    if(replacement){model.Shape_Material[i]=replacement;model.Shape_Matrix[i]=undefined;}
   }
   solid(model,cx,y0+21,angle,boss?36:31,boss?30:26,8,'VariantIron',.88);
   solid(model,cx,y0+15,angle,boss?34:30,boss?28:25,3,'VariantGold',.9);
   for(let i=-1;i<=1;i++){
    const dx=Math.cos(angle)*i*(boss?14:12),dy=Math.sin(angle)*i*8;
    solid(model,cx+dx,y0+14+dy,angle,11,10,boss?9:7,'VariantCrown',.7);
    horn(model,cx+dx,y0+8+dy,angle,8,8,(i===0?20:15)+(boss?8:0),i*4,'VariantIron');
    solid(model,cx+dx,y0+8+dy,angle,3,3,boss?12:8,'VariantGlow',.7);
   }
  }
  if(name.startsWith('UpperArm')){
   solid(model,cx,y0+14,angle,boss?34:28,boss?28:23,5,'VariantGold',.95);
   solid(model,cx,y0+10,angle,boss?33:27,boss?27:22,10,'VariantIron',.72);
   solid(model,cx,y0+5,angle,boss?27:22,19,5,'VariantCrown',.8);
  }
  if(name.startsWith('LowerArm')){
   bracer('VariantIron','VariantGold');
  }
  if(name==='Body'){
   faceDetails(model,kind,phase,pose);
   // Chest inlays use the authored face UVs, so furnace panels remain attached in every pose.
   const faces=model.Shape_vList.slice(),materials=model.Shape_Material.slice();
   for(let i=0;i<faces.length;i++)if(['Body_Front','Body_Back'].includes(materials[i])&&faces[i].length===8&&Math.abs(area(faces[i]))>1e-5){
    const p=faces[i],at=(u:number,v:number):number[]=>[(1-v)*((1-u)*p[0]+u*p[2])+v*((1-u)*p[6]+u*p[4]),(1-v)*((1-u)*p[1]+u*p[3])+v*((1-u)*p[7]+u*p[5])];
    const patch=(points:number[][],material:string,brightness=0):void=>polygon(model,points.flatMap(([u,v])=>at(u!,v!)),material,brightness);
    if(boss){
     patch([[.23,.22],[.77,.22],[.77,.76],[.23,.76]],'VariantGold',-.05);
     patch([[.29,.28],[.71,.28],[.71,.7],[.29,.7]],'VariantIron',-.15);
     patch([[.35,.34],[.65,.34],[.65,.64],[.35,.64]],'VariantGlow',pose==='cast'?.25:.05);
     for(const u of [.42,.55])patch([[u,.29],[u+.045,.29],[u+.045,.69],[u,.69]],'VariantIron',.05);
    }else patch([[.39,.17],[.61,.17],[.57,.23],[.43,.23]],'VariantGold',.1);
   }
  }
 }
}
function editPart(model:any,name:string,kind:EnemyVariant,angle:number,phase:number,pose:string,up:number[],polished=false,boss=false):void{
 if(!model.Shape_vList?.length)return;
 const [x0,y0,x1,y1]=bounds(model) as [number,number,number,number],cx=(x0+x1)/2,cy=(y0+y1)/2;
 const originalFaces=model.Shape_vList.length,originalEdges=model.PEdge.length;
 if(polished)refinedPart(model,name,kind,boss,angle,phase,pose,[x0,y0,x1,y1],up);
 else if(kind==='charger'){
  if(name==='UpperArm_Left'){
   solid(model,cx,y0+12,angle,28,24,5,'VariantLeather',.9);
   solid(model,cx,y0+8,angle,27,23,11,'VariantBone',.74);
   for(const side of [-1,1])horn(model,cx+Math.cos(angle)*side*7,y0-1+Math.sin(angle)*side*4,angle,8,8,12,side*3,'VariantBone');
  }
  if(name==='LowerArm_Right'){
   solid(model,cx,cy+9,angle,21,19,18,'VariantLeather',.85);
   solid(model,cx,cy+6,angle,22,19,11,'VariantRust',.9);
   solid(model,cx,cy-4,angle,20,18,3,'VariantIron',.95);
  }
  if(name==='Body'){
   faceDetails(model,kind,phase,pose);
   for(let i=0;i<3;i++){const x=x0+(i+.5)*(x1-x0)/3;polygon(model,[x-5,y1-9,x+5,y1-8,x+2,y1+1-(i%2)*4],'VariantCloth',-.15);}
  }
 }else{
  if(name==='Head'){
   solid(model,cx,y0+20,angle,31,26,7,'VariantIron',.9);
   solid(model,cx,y0+14,angle,30,25,3,'VariantGold',.9);
   for(let i=-1;i<=1;i++){
    const dx=Math.cos(angle)*i*13,dy=Math.sin(angle)*i*8;
    solid(model,cx+dx,y0+13+dy,angle,10,9,5,'VariantIron',.8);
    horn(model,cx+dx,y0+9+dy,angle,8,7,i===0?23:19,i*5,'VariantGold');
   }
  }
  if(name.startsWith('UpperArm')){
   solid(model,cx,y0+12,angle,27,23,5,'VariantGold',.9);
   solid(model,cx,y0+8,angle,27,23,9,'VariantIron',.7);
  }
  if(name.startsWith('LowerArm')){solid(model,cx,cy+8,angle,19,17,14,'VariantIron',.85);solid(model,cx,cy+4,angle,20,18,4,'VariantGold',.9);}
  if(name==='Body')faceDetails(model,kind,phase,pose);
 }
 // New solids share their animated part's projected long axis, including lying/death poses.
 if(name!=='Body'&&!(polished&&name.startsWith('LowerArm'))){
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
 // Some authored skin planes are edge-on with zero area. Recoloured derived parts omit those invisible
 // faces while retaining all anchor/foot data and leaving the classic source geometry untouched.
 if(polished&&!name.startsWith('Foot'))for(let i=model.Shape_vList.length-1;i>=0;i--)if(Math.abs(area(model.Shape_vList[i]))<=1e-5)
  for(const key of ['Shape_vList','Shape_Matrix','Shape_Material','Shape_Brightness'])model[key].splice(i,1);
}
function prepare(kind:EnemyVariant,boss=false,old=false):any{
 const X=DrawPrimitive.XSI,DI=X.CDrawPrimitive_XSI_DI,S=X.CDrawPrimitive_XSI_StyleSheet,di=S.mXSI_DI;
 const identity=(old?'ClassicVariant_':boss?'Boss_':'Variant_')+kind;
 let cache=caches.get(di);if(!cache)caches.set(di,cache={});if(cache[identity])return cache[identity];
 const saved=di.mStyleSheet;kind==='charger'?S.SS_ZOMBIE():S.SS_DEVIL(Thing.Creature.CThing_Creature_Devil.mDefault_Scale);
 const sourceStyle=di.mStyleSheet,style=copy(sourceStyle);style.mID='SS_'+identity;style.mGroup_Remap=undefined;
 for(const model of Object.values(style.mModels)as any[])model.mGroup_Remap=undefined;
 for(const [name,color]of Object.entries({VariantBone:0xbebd99,VariantRust:0x794939,VariantCloth:0x384637,VariantLeather:0x44372d,VariantGold:0xb87e39,VariantGlow:0xffc46e,VariantIron:0x302a2a}))style.mMaterials[name]={mColor:color,mAlpha:100};
 if(!old)for(const [name,color]of Object.entries({VariantBone:0xd4d4bf,VariantBoneShade:0x989f8c,VariantRust:0x925b43,VariantCloth:0x354838,VariantLeather:0x493e32,VariantGold:0xc49650,VariantGlow:0xffca73,VariantIron:0x363b40,VariantCrown:0x703332}))style.mMaterials[name]={mColor:color,mAlpha:100};
 for(const name of ['LowerArm','UpperArm','Bandana'])style.mMaterials[name].mColor=kind==='charger'?0x62705a:0x702b29;
 for(const name of ['Body_Top','Body_Side','Body_Front','Body_Back']){delete style.mMaterials[name].mcLinkID;style.mMaterials[name].mColor=kind==='charger'?0x455143:0x482322;}
 const collection=cache[identity]=new X.CDrawPrimitive_XSI_Collection();
 const zombie=kind==='charger',links:Record<string,string>={stand:zombie?'Zombie_Zombie_Stand':'Player_Stand',walk:zombie?'Zombie_Zombie_Walk':'Player_Walk',attack:zombie?'Zombie_Zombie_Attack':'Devil_Devil_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead',warning:zombie?'Zombie_Zombie_Stand':'Devil_Devil_Attack',charge:zombie?'Zombie_Zombie_Walk':'Player_Walk',cast:zombie?'Zombie_Zombie_Attack':'Devil_Devil_Attack',recovery:zombie?'Zombie_Zombie_Stand':'Player_Stand'};
 for(const [key,link]of Object.entries(links)){
  const original=DI.mAnimationSets[link],custom=['warning','charge','cast','recovery'].includes(key);
  // Base actions keep the authored return frames. Skill frames expand that logical timeline once,
  // so finite poses never restart midway and the looping charge keeps the native walk cadence.
  const derived={...original,mID:identity+'_'+key,mGroupID:identity,mFrameSequence:custom?undefined:original.mFrameSequence?.slice()};
  derived.mDirections=original.mDirections.map((frames:any[],direction:number)=>{
   const sequence:number[]=original.mFrameSequence??frames.map((_,i)=>i),count=custom?Math.max(6,sequence.length):frames.length;
   return Array.from({length:count},(_,index)=>{
    const sourceIndex=custom?sequence[key==='charge'?index%sequence.length:Math.round(index/(count-1)*(sequence.length-1))]!:index;
    const frame=frames[sourceIndex],models:any={},partner=DI.mGroups[frame.rPartner]?.[frame.mAnimID]?.mDirections[direction]?.[sourceIndex]?.Models,remap=DI.mGroups[sourceStyle.mGroup_Remap]?.[frame.mAnimID]?.mDirections[direction]?.[sourceIndex]?.Models;
    for(const name of Object.keys(frame.Models)){
     const base=frame.Models[name].Empty?partner?.[name]??frame.Models[name]:frame.Models[name];
     const source=sourceStyle.mModels[name]?.mGroup_Remap?remap?.[name]??base:base;
     models[name]=copy(source??frame.Models[name]);
    }
    const centers:any={};for(const [name,model]of Object.entries(models)as [string,any][])if(model.Shape_vList?.length){const b=bounds(model);centers[name]=[(b[0]!+b[2]!)/2,(b[1]!+b[3]!)/2];}
    const vector=(a:string,b:string):number[]=>centers[a]&&centers[b]?[centers[a][0]-centers[b][0],centers[a][1]-centers[b][1]]:[0,-1];
    for(const name of Object.keys(models))editPart(models[name],name,kind,direction*Math.PI*2/original.mDirections.length,index/Math.max(1,count-1),custom?key:'base',name.includes('Arm_')?vector('UpperArm_'+name.split('_')[1],'LowerArm_'+name.split('_')[1]):vector('Head','Body'),!old,boss);
    return {...frame,Models:models,rPartner:undefined,mFrameIndex:index};
   });
  });
  DI.mAnimationSets[derived.mID]=derived;S.SS_APPLY(style);collection.AddItem(X.CDrawPrimitive_XSI_Animation.Load(derived.mID,key));
 }
 if(saved)S.SS_APPLY(saved);return collection;
}
export function variantCollection(kind:EnemyVariant,boss=false):any{return prepare(kind,boss,classic.has(CMain._this));}
export function classicVariantCollection(kind:EnemyVariant):any{return prepare(kind,false,true);}
export function installVariantArt():void{
 for(const [ctor,kind]of [[Thing.Creature.CThing_Creature_Zombie,'charger'],[Thing.Creature.CThing_Creature_Devil,'priest']]as const){
  const get=ctor.GetCollection;ctor.GetCollection=function():any{const base=get.call(this);if(expandedEnemyArtConfigured()||kind==='charger'&&!availableFeatures().includes('native-bosses-v1')){variantCollection(kind);variantCollection(kind,true);}return base;};
 }
}
