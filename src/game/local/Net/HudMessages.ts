// STABLE_HUD_MESSAGES: display clock and glyphs never enter the rollback graph.
import { _global, flash } from '../../../engine/runtime.ts';
import { nowMs } from '../../../engine/flash/clock.ts';
import { World } from '../../packages.ts';
import { localGrowthEnabled } from '../LocalGrowth.ts';
import { netSession } from './NetSession.ts';

interface Row { text: string; color: number; age: number; from: number; target: number; movedAt: number; bitmap?: any }
interface View { rows: Row[]; at: number; paused: boolean }
const views = new WeakMap<object, View>();
const enabled = (): boolean => { const s=netSession(); return s ? s.rollbackV2 : localGrowthEnabled(); };
function advance(v: View): void {
  const time=nowMs(),dt=Math.max(0,time-v.at); v.at=time;
  if(!v.paused)for(const row of v.rows)row.age+=dt;
}
function offset(row: Row): number {
  const t=Math.min(1,Math.max(0,(row.age-row.movedAt)/160)),ease=t*t*(3-2*t);
  return row.from+(row.target-row.from)*ease;
}
function release(row: Row): void { row.bitmap?.sBMD.dispose(); }
function show(hud: any, text: string, color: number): void {
  let v=views.get(hud);
  if(!v)views.set(hud,v={rows:[],at:nowMs(),paused:!!hud.mWorld.mPaused});
  advance(v);
  for(const row of v.rows){row.from=offset(row);row.target-=22;row.movedAt=row.age;}
  if(v.rows.length===3)release(v.rows.shift()!);
  v.rows.push({text,color,age:0,from:22,target:0,movedAt:0});
}
/** Read-only diagnostics for deterministic animation regressions. */
export function hudMessageRows(hud: any): {text:string;age:number;y:number;alpha:number}[] {
  const v=views.get(hud); if(!v)return [];
  return v.rows.filter(r=>r.age<3000).map(r=>({text:r.text,age:r.age,y:offset(r),alpha:r.age<2500?100:(3000-r.age)/5}));
}
function draw(hud: any): void {
  const v=views.get(hud);if(!v)return;advance(v);
  for(let i=v.rows.length-1;i>=0;i--)if(v.rows[i]!.age>=3000){release(v.rows[i]!);v.rows.splice(i,1);}
  if(v.paused||_global.mRecordMode)return;
  const size=hud.mWorld.mScreenSize;
  for(const row of v.rows){
    if(!row.bitmap){
      const tf=World.CHud.mcMessage.tfMessage;tf.text=row.text;tf.textColor=row.color;
      row.bitmap=World.CHud.RenderMovieClipAsBitmapObject(World.CHud.mcMessage);
    }
    hud.DrawBMObject(row.bitmap,new flash.geom.Point(size.x/2,size.y-84+offset(row)),row.age<2500?100:(3000-row.age)/5);
  }
}
export function installHudMessages(): void {
  const p=World.CHud.prototype as any,add=p.AddMessage,info=p.AddMessage_Info,previousDraw=p.Draw,pause=p.Pause,dispose=p.Dispose;
  p.AddMessage=function(this:any,value:any,color:any):void{
    if(!enabled())return add.call(this,value,color);
    if(this.mSilentMessages)return;
    const text=String(value),s=netSession();
    if(s&&s.soundRecordingTick!==undefined){
      const hud=this;s.messages.record(s.soundRecordingTick,-1,`message:${color}:${text}`,()=>show(hud,text,color));
    }else show(this,text,color);
  };
  p.AddMessage_Info=function(this:any,value:any,owner?:number):void{
    const label=enabled()&&(owner===0||owner===1)&&!/^P[12]:/.test(String(value))?`P${owner+1}: ${value}`:value;
    return info.call(this,label,owner);
  };
  p.Draw=function(this:any,...args:any[]):any{
    if(!enabled())return previousDraw.apply(this,args);
    const saved=this.mMessages;this.mMessages=[];
    try{const value=previousDraw.apply(this,args);draw(this);return value;}finally{this.mMessages=saved;}
  };
  p.Pause=function(this:any,on:any):any{
    const v=views.get(this);if(v){advance(v);v.paused=!!on;}return pause.call(this,on);
  };
  p.Dispose=function(this:any):any{
    const v=views.get(this);if(v)for(const row of v.rows)release(row);views.delete(this);return dispose.call(this);
  };
}
