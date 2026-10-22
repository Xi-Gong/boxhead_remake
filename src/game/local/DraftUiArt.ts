// Paper, heavy ink and original character portraits; all artwork is render-owned Canvas/Flash geometry.
import {MENU_FONT,INK,RED,text} from './UiStyle.ts';
import type {Reward} from './WaveDraftRules.ts';
export const PAPER=0xf4f0e6,CREAM=0xfffcf4,MUTED=0x666760,BLUE=0x197ba1,PURPLE=0x8552ac;
export function frame(c:any,w:number,h:number,fill=PAPER,stroke=INK,line=2,alpha=100):void{
 const r=6;c.lineStyle(line,stroke,100);c.beginFill(fill,alpha);c.moveTo(r,0);c.lineTo(w-r,0);c.lineTo(w,r);c.lineTo(w,h-r);c.lineTo(w-r,h);c.lineTo(r,h);c.lineTo(0,h-r);c.lineTo(0,r);c.lineTo(r,0);c.endFill();
}
export function actionButton(parent:any,name:string,x:number,y:number,w:number,h:number,label:string,size=13):any{
 const mc=parent.createEmptyMovieClip(name,parent.getNextHighestDepth());mc._x=x;mc._y=y;
 const contents=mc.createEmptyMovieClip('_Contents',mc.getNextHighestDepth());contents._x=-w/2;contents._y=-h/2;
 const shadow=contents.createEmptyMovieClip('_Shadow',contents.getNextHighestDepth());shadow._x=2;shadow._y=3;frame(shadow,w,h,INK,INK,1);
 const face=contents.createEmptyMovieClip('_Face',contents.getNextHighestDepth());frame(face,w,h,CREAM);
 const tf=text(contents,'_Label',4,(h-size)/2-2,w-8,size+5,MENU_FONT,size,INK,false,'center',label);
 const hover=(on:boolean)=>{face.clear();frame(face,w,h,on?0xffe7d4:CREAM,on?RED:INK,2);tf.textColor=on?RED:INK;};
 mc.onRollOver=()=>{if(mc.enabled!==false)hover(true);};mc.onRollOut=()=>hover(false);mc.onDragOut=()=>hover(false);mc.useHandCursor=true;return mc;
}
export function rewardColor(reward:Reward):number{return reward==='armor'?BLUE:reward==='endurance'||reward==='enchantPower'?PURPLE:reward==='health'||reward==='heal'?RED:0x2b7044;}
export function drawIcon(c:any,reward:Reward):void{
 const accent=rewardColor(reward);c.clear();frame(c,28,28,0xe9e3d6,INK,1.4);c.lineStyle(1.6,INK,100);
 if(reward==='health'||reward==='heal'){
  c.beginFill(0xe44935,100);c.moveTo(14,23);c.curveTo(1,14,6,8);c.curveTo(10,3,14,9);c.curveTo(18,3,22,8);c.curveTo(27,14,14,23);c.endFill();
 }else if(reward==='armor'){
  c.beginFill(0x55afd0,100);c.moveTo(14,4);c.lineTo(23,7);c.lineTo(21,18);c.lineTo(14,24);c.lineTo(7,18);c.lineTo(5,7);c.lineTo(14,4);c.endFill();c.lineStyle(1.5,0xc8f1ff,100);c.moveTo(10,9);c.lineTo(10,16);c.lineTo(14,20);
 }else if(reward==='enchantPower'){
  c.beginFill(0xaa76ce,100);c.moveTo(13,3);c.lineTo(21,10);c.lineTo(17,14);c.lineTo(22,21);c.lineTo(12,25);c.lineTo(7,17);c.lineTo(11,13);c.lineTo(7,9);c.lineTo(13,3);c.endFill();
  c.lineStyle(1.4,0xf3deff,100);c.moveTo(15,8);c.lineTo(12,15);c.lineTo(17,14);c.lineTo(13,21);
 }else if(reward==='endurance'){
  c.beginFill(0xaa76ce,100);c.moveTo(14,3);c.lineTo(23,12);c.lineTo(19,23);c.lineTo(9,23);c.lineTo(5,12);c.lineTo(14,3);c.endFill();c.lineStyle(1.4,0xf3deff,100);c.moveTo(14,5);c.lineTo(11,13);c.lineTo(14,21);c.lineTo(17,13);c.lineTo(14,5);
 }else if(reward==='damage'||reward==='penetration'){
  c.beginFill(reward==='damage'?0xe47348:0x88a4a4,100);for(let n=0;n<=16;n++){const a=n*Math.PI/8,x=14+7*Math.cos(a),y=14+7*Math.sin(a);n?c.lineTo(x,y):c.moveTo(x,y);}c.endFill();
  for(const [x,y,dx,dy]of [[14,3,0,7],[14,18,0,7],[3,14,7,0],[18,14,7,0]]){c.moveTo(x,y);c.lineTo(x!+dx!,y!+dy!);}
 }else if(reward==='haste'){
  c.beginFill(0xf1d171,100);for(let n=0;n<=16;n++){const a=n*Math.PI/8,x=14+9*Math.cos(a),y=15+9*Math.sin(a);n?c.lineTo(x,y):c.moveTo(x,y);}c.endFill();c.moveTo(11,3);c.lineTo(17,3);c.moveTo(14,8);c.lineTo(14,15);c.lineTo(20,17);
 }else if(reward==='mobility'){
  c.beginFill(0x899968,100);c.moveTo(7,5);c.lineTo(15,5);c.lineTo(15,15);c.lineTo(23,19);c.lineTo(22,24);c.lineTo(5,24);c.lineTo(7,5);c.endFill();c.moveTo(8,11);c.lineTo(13,11);c.moveTo(8,15);c.lineTo(13,15);
 }else if(reward==='scavenging'){
  c.beginFill(0x8ba080,100);c.moveTo(5,8);c.lineTo(23,8);c.lineTo(23,24);c.lineTo(5,24);c.lineTo(5,8);c.endFill();c.moveTo(10,8);c.lineTo(10,4);c.lineTo(18,4);c.lineTo(18,8);c.moveTo(14,11);c.lineTo(14,21);c.moveTo(9,16);c.lineTo(19,16);
 }else{
  for(let n=0;n<3;n++){const x=5+n*6;c.beginFill(0xe2bc60,100);c.moveTo(x,23);c.lineTo(x,9);c.lineTo(x+2,5);c.lineTo(x+4,9);c.lineTo(x+4,23);c.lineTo(x,23);c.endFill();}
 }
}
export function portrait(side:any,player:any):void{
 const plate=side.createEmptyMovieClip('_Portrait',side.getNextHighestDepth());frame(plate,40,40,0xded9cd,INK,2);
 const object=player?.mXSI_Collection?.mItems?.stand?.mAnimationObject;
 const bitmap=object?.mDirections[object.mLookup256[32]]?.mFrames[0]?.sBMD;
 if(!bitmap)return;
 const image=plate.createEmptyMovieClip('_OriginalArt',plate.getNextHighestDepth()),scale=Math.min(32/bitmap.width,35/bitmap.height);
 image.attachBitmap(bitmap,image.getNextHighestDepth(),'auto',false);image._x=(40-bitmap.width*scale)/2;image._y=(40-bitmap.height*scale)/2;image._xscale=image._yscale=scale*100;
}
