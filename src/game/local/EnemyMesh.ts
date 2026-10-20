// Entirely new visible meshes on the original animation rig. No authored faces/textures are retained.
import type {CombatKind} from './CombatRosterRules.ts';
type V=[number,number,number];
type Part={model:any;box:(x:number,y:number,z:number,width:number,depth:number,height:number,material:string,bevel?:number)=>void;
 prism:(x:number,y:number,z:number,width:number,depth:number,height:number,material:string,sides?:number,taper?:number)=>void;
 spike:(x:number,y:number,z:number,width:number,depth:number,height:number,lean:number,material:string)=>void};
const colors={runner:[0x344e49,0x798a7b,0x4b6159,0xbcaa77,0xa5cb72],brute:[0x625348,0x99936c,0x484740,0xb7ad86,0xd1a675],
 gunner:[0x343d47,0x8d9b7b,0x454f59,0x9aabaa,0xd8a16e],butcher:[0x4f3630,0x92725f,0x656562,0xc0b99f,0xe19a61],hunter:[0x273f49,0x758e92,0x3d5a66,0xa9c7c3,0x8cddcd]}as const;
export function freshMeshMaterials(style:any,kind:CombatKind,skin=0):void{
 const c=colors[kind],cloth=kind==='gunner'?[0x263b57,0x34343a,0x7c805d,0x4a3b35][skin]!:c[0];
 for(const [name,color]of Object.entries({MeshCloth:cloth,MeshSkin:c[1],MeshArmor:c[2],MeshEdge:c[3],MeshGlow:c[4],MeshDark:0x20292a,MeshBlood:0x814139,MeshBone:0xc1bd9b,MeshRed:0x9d493d}))style.mMaterials[name]={mColor:color,mAlpha:100};
}
function area(p:number[]):number{let a=0;for(let i=0;i<p.length;i+=2){const j=(i+2)%p.length;a+=p[i]!*p[j+1]!-p[j]!*p[i+1]!;}return a/2;}
function center(model:any):number[]{
 const faces=model.Shape_vList??[],p=faces.flat();if(!p.length)return [0,0];
 const x=p.filter((_:number,i:number)=>i%2===0),y=p.filter((_:number,i:number)=>i%2);return [(Math.min(...x)+Math.max(...x))/2,(Math.min(...y)+Math.max(...y))/2];
}
function makePart(source:any,cx:number,cy:number,yaw:number,roll:number,tilt:number,light:any):Part{
 const model={...source,Empty:false,PEdge:[],Edge:[],Shadow:[],Shape_vList:[],Shape_Matrix:[],Shape_Material:[],Shape_Brightness:[]}as any;
 const c=Math.cos(yaw),s=Math.sin(yaw),rc=Math.cos(roll),rs=Math.sin(roll),ct=Math.cos(tilt),st=Math.sin(tilt);
 const project=([x,y,z]:V):number[]=>{const px=c*x-s*y,py=ct*(s*x+c*y)-st*z;return [cx+rc*px-rs*py,cy+rs*px+rc*py];};
 const mesh=(vertices:V[],faces:number[][],material:string)=>{
  for(const ids of faces){const points=ids.flatMap(i=>project(vertices[i]!));if(area(points)<=1e-5)continue;
   const a=vertices[ids[0]!]!,b=vertices[ids[1]!]!,d=vertices[ids[2]!]!,u=b.map((n,i)=>n-a[i]!),v=d.map((n,i)=>n-a[i]!);
   const nx=u[1]!*v[2]!-u[2]!*v[1]!,ny=u[2]!*v[0]!-u[0]!*v[2]!,nz=u[0]!*v[1]!-u[1]!*v[0]!,length=Math.hypot(nx,ny,nz);
   const shade=Math.max(-.35,Math.min(.32,-.45*((c*nx-s*ny)*light.mX+(s*nx+c*ny)*light.mY+nz*light.mZ)/length));
   model.Shape_vList.unshift(points);model.Shape_Matrix.unshift(undefined);model.Shape_Material.unshift(material);model.Shape_Brightness.unshift(shade);model.PEdge.push([...points,points[0],points[1]]);
  }
 };
 const prism=(x:number,y:number,z:number,width:number,depth:number,height:number,material:string,sides=8,taper=1)=>{
  const vertices:V[]=[];for(const [h,k]of [[-height/2,1],[height/2,taper]])for(let i=0;i<sides;i++){const a=(i+.5)*Math.PI*2/sides;vertices.push([x+Math.cos(a)*depth/2*k!,y+Math.sin(a)*width/2*k!,z+h!]);}
  const faces:number[][]=[];for(let i=0;i<sides;i++)faces.push([i,(i+1)%sides,(i+1)%sides+sides,i+sides]);faces.push(Array.from({length:sides},(_,i)=>i+sides));mesh(vertices,faces,material);
 };
 const box=(x:number,y:number,z:number,width:number,depth:number,height:number,material:string,bevel=.14)=>{
  const a=depth/2,b=width/2,k=Math.min(a,b)*bevel,ring=[[-a+k,-b],[a-k,-b],[a,-b+k],[a,b-k],[a-k,b],[-a+k,b],[-a,b-k],[-a,-b+k]],vertices:V[]=[];
  for(const h of [-height/2,height/2])for(const [dx,dy]of ring)vertices.push([x+dx!,y+dy!,z+h]);
  const faces:number[][]=[];for(let i=0;i<8;i++)faces.push([i,(i+1)%8,(i+1)%8+8,i+8]);faces.push([8,9,10,11,12,13,14,15]);mesh(vertices,faces,material);
 };
 const spike=(x:number,y:number,z:number,width:number,depth:number,height:number,lean:number,material:string)=>mesh(
  [[x-depth/2,y-width/2,z],[x+depth/2,y-width/2,z],[x+depth/2,y+width/2,z],[x-depth/2,y+width/2,z],[x+lean,y,z+height]],[[0,1,4],[1,2,4],[2,3,4],[3,0,4]],material);
 return {model,box,prism,spike};
}
function build(part:Part,name:string,kind:CombatKind,boss:boolean,skin:number):void{
 const {box,prism,spike}=part,runner=kind==='runner',brute=kind==='brute',butcher=kind==='butcher',hunter=kind==='hunter',gunner=kind==='gunner',heavy=brute||butcher;
 if(name==='Head'){
  // New proportions still meet the retained shoulder/neck joints throughout the old animation rig.
  prism(-2,0,-28,heavy?23:gunner?18:14,heavy?22:16,34,heavy?'MeshSkin':'MeshCloth',6,.9);
  if(runner){
   prism(0,0,0,26,25,34,'MeshCloth',6,.82);box(12,0,-4,20,9,16,'MeshDark');
   for(const y of [-7,7])prism(17,y,-5,8,8,8,'MeshEdge',6);box(14,-6,9,7,3,6,'MeshGlow');box(14,6,9,7,3,6,'MeshGlow');
   box(-1,0,18,22,18,4,'MeshArmor');
  }else if(brute){
   prism(0,0,0,29,31,27,'MeshSkin',6,.88);box(15,0,-7,25,8,13,'MeshBlood');
   for(const y of [-9,-3,3,9])box(20,y,-5,3,3,6,'MeshBone');box(14,-8,8,5,3,4,'MeshGlow');box(14,8,6,4,3,4,'MeshDark');
   box(-9,0,8,22,7,15,'MeshArmor');
  }else if(butcher){
   box(0,0,0,31,30,35,'MeshArmor',.28);box(15,0,-4,25,5,25,'MeshEdge');
   for(const y of [-7,0,7])box(19,y,-4,3,3,15,'MeshDark');box(18,0,9,24,3,4,'MeshRed');
   for(const y of [-13,13])spike(-2,y,11,8,9,boss?24:12,-5,'MeshBone');
   if(boss){box(-11,0,20,34,11,7,'MeshRed');spike(-5,0,23,10,10,22,0,'MeshEdge');}
  }else if(hunter){
   prism(0,0,0,25,29,42,'MeshArmor',5,.65);spike(15,0,-16,10,12,28,9,'MeshEdge');
   for(const y of [-8,8]){box(13,y,8,5,3,7,'MeshGlow');spike(-6,y*1.8,13,7,8,boss?37:25,-13,'MeshEdge');}
   if(boss){spike(-4,0,20,8,8,32,-8,'MeshGlow');for(const y of [-22,22])spike(-12,y,12,6,8,22,-12,'MeshArmor');}
  }else{
   box(0,0,0,28,27,33,'MeshSkin',.22);box(14,0,-9,23,7,8,'MeshDark');
   for(const y of [-8,8])box(15,y,6,5,3,5,skin===1?'MeshDark':'MeshGlow');
   if(skin===0){box(-1,0,15,33,30,13,'MeshArmor');box(14,0,9,27,4,7,'MeshDark');box(17,-6,9,8,3,4,'MeshGlow');}
   else if(skin===1){box(-1,0,18,29,26,6,'MeshDark');box(13,-8,-4,7,4,15,'MeshBlood');}
   else if(skin===2){box(-1,0,17,30,30,8,'MeshCloth');box(14,0,14,30,14,4,'MeshArmor');box(15,-7,6,9,6,8,'MeshDark');}
   else {box(0,0,11,30,29,6,'MeshRed');box(-13,-10,3,7,4,25,'MeshRed');box(-13,0,19,16,7,8,'MeshDark');}
  }
 }else if(name==='Body'){
  const width=brute?53:butcher?(boss?51:45):hunter?30:gunner?34:27,depth=heavy?36:hunter?25:22,height=brute?45:butcher?43:hunter?51:41;
  prism(0,0,0,width,depth,height,'MeshCloth',heavy?8:6,brute?.86:.95);
  box(0,0,height/2-2,heavy?width+3:hunter?47:46,heavy?24:16,9,'MeshArmor');
  if(brute){
   prism(16,0,-5,45,25,36,'MeshSkin',8,.9);for(const z of [-13,-4,5])box(29,0,z,37,3,4,'MeshBone');
   box(28,7,-6,11,5,22,'MeshBlood');prism(-16,0,8,28,12,22,'MeshArmor',6);
  }else if(butcher){
   box(18,0,0,width-5,7,31,'MeshArmor');box(22,0,-21,width-10,4,31,'MeshEdge');
   for(const y of [-10,0,10])box(25,y,-20,4,3,21,'MeshBlood');for(const y of [-width/2,width/2])box(0,y,15,12,30,boss?18:12,'MeshArmor');
   if(boss)for(const y of [-14,0,14])spike(-14,y,19,8,8,28,-11,'MeshBone');
  }else if(hunter){
   box(12,0,3,25,6,34,'MeshEdge');prism(17,0,6,17,8,18,'MeshGlow',5,.65);
   for(const y of [-15,15])box(-2,y,-20,8,26,35,'MeshArmor');if(boss)for(const y of [-19,19])spike(-11,y,14,9,10,27,-10,'MeshEdge');
  }else if(runner){
   box(10,0,1,23,5,27,'MeshArmor');for(const y of [-9,9])prism(-14,y,0,11,12,34,'MeshEdge',6);box(14,-5,3,6,4,22,'MeshRed');
  }else{
   box(12,0,0,31,8,30,'MeshArmor');for(const y of [-9,0,9])box(18,y,-1,6,5,17,'MeshEdge');box(19,-7,5,7,3,16,'MeshBlood');
   box(-9,0,0,25,11,30,'MeshCloth');if(skin===1){box(17,0,18,5,3,13,'MeshRed');}if(skin===3)for(const z of [-13,-4,5])box(18,7,z,11,3,3,'MeshBone');
  }
 }else if(name.startsWith('UpperArm')){
  const left=name.endsWith('Left'),width=brute?(left?24:18):butcher?22:hunter?14:gunner?15:10,height=brute?25:28;
  prism(0,0,0,width,width,height,runner||brute?'MeshSkin':'MeshCloth',6,.8);
  if(!runner)box(-2,0,10,width+7,width+5,heavy?16:10,'MeshArmor');if(hunter)spike(-4,0,15,8,10,boss?28:17,-9,'MeshEdge');
 }else if(name.startsWith('LowerArm')){
  const right=name.endsWith('Right'),width=brute?(right?20:29):butcher?23:hunter?15:gunner?13:10;
  prism(0,0,0,width,width,29,runner||brute?'MeshSkin':'MeshArmor',6,heavy?1.15:.8);box(0,0,-16,width+2,width+3,10,heavy?'MeshArmor':'MeshSkin');
  if(runner||brute)for(const y of [-width*.28,0,width*.28])spike(4,y,-20,4,5,8,7,'MeshBone');
  if(butcher&&right){box(4,0,-23,8,8,29,'MeshDark');box(10,0,-33,boss?43:36,6,boss?38:31,'MeshEdge');box(14,-12,-33,7,3,29,'MeshBlood');}
  if(hunter){box(7,0,-1,19,12,23,'MeshEdge');for(const y of [-6,6])box(14,y,-3,4,5,23,'MeshArmor');box(14,0,-3,5,6,21,'MeshGlow');}
  if(gunner&&right)box(4,0,6,17,10,12,'MeshCloth');
 }else if(name.startsWith('Hand')){
  const right=name.endsWith('Right'),width=brute&&!right?21:heavy?16:10;
  prism(0,0,0,width,heavy?19:13,heavy?16:12,gunner?'MeshDark':'MeshSkin',6,.85);
  if(!gunner)for(const y of [-width*.3,0,width*.3])spike(6,y,-4,3,4,7,7,'MeshBone');
 }else if(name.startsWith('Foot')){
  const width=heavy?20:runner?11:gunner?14:12,depth=heavy?29:runner?25:23;
  box(0,0,1,width,depth,runner?14:20,heavy?'MeshArmor':'MeshCloth',.28);box(6,0,-9,width+2,depth+8,9,'MeshDark',.2);
  box(12,0,-6,width,7,5,heavy?'MeshEdge':hunter?'MeshGlow':'MeshArmor');if(hunter)spike(16,0,-5,8,10,9,10,'MeshEdge');
 }
}
export function freshEnemyModels(models:any,kind:CombatKind,direction:number,tilt:number,light:any,boss=false,skin=0):void{
 const centers:any={};for(const [name,model]of Object.entries(models)as [string,any][])if(model.Shape_vList?.length)centers[name]=center(model);
 const vector=(a:string,b:string)=>centers[a]&&centers[b]?[centers[a][0]-centers[b][0],centers[a][1]-centers[b][1]]:[0,-1];
 for(const name of Object.keys(models)){
  if(!/^(Head|Body|UpperArm_(Left|Right)|LowerArm_(Left|Right)|Hand_(Left|Right)|Foot_(Left|Right))$/.test(name)||!centers[name])continue;
  const [cx,cy]=centers[name],up=name.includes('Arm_')||name.startsWith('Hand_')?vector('UpperArm_'+name.split('_')[1],'LowerArm_'+name.split('_')[1]):vector('Head','Body'),roll=Math.atan2(up[0],-up[1]);
  const part=makePart(models[name],cx,cy,direction,roll,tilt,light);build(part,name,kind,boss,skin);
  if(name==='Body'){const p=models[name].XSIInfo?.vPosition;if(p)part.model.Shadow=[Array.from({length:9},(_,i)=>{const a=i*Math.PI/4;return [p.mX+Math.cos(a)*(kind==='brute'?27:20),p.mY*Math.cos(tilt)+Math.sin(a)*11];}).flat()];}
  models[name]=part.model;
 }
}
