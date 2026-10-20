// Display-only timed-wave surfaces. LAN reads committed tick metadata, never the predicted head.
import { CMain, Screen, World } from '../packages.ts';
import { netSession } from './Net/NetSession.ts';
import { timedWave, timedWavesConfigured } from './TimedWaves.ts';
import { clockLabel, ROOM_DIMENSIONS, waveSeconds } from './TimedWaveRules.ts';
import { BODY_FONT, menuText, text } from './UiStyle.ts';
export function waveLimitLabel(index:number):string {
  const size=ROOM_DIMENSIONS[index];return size?`SURVIVE ${clockLabel(waveSeconds(...size),1)}`:'';
}
export function showWaveLimit(parent:any,index:number,enabled:boolean,x=205,y=395,width=230):void {
  const field=parent._WaveLimit??menuText(parent,'_WaveLimit',x,y,width,18,'',12);
  field.text=waveLimitLabel(index);field._visible=enabled;
}
export function installTimedWaveUi():void {
  const select=Screen.CScreen_SelectWorld.prototype as any,change=select.ChangeLevel;
  select.ChangeLevel=function(this:any,target:any,index:number):any{
    const result=change.call(this,target,index);
    showWaveLimit(this,index,this.mMode!=='DeathMatch'&&timedWavesConfigured());return result;
  };
  const hud=World.CHud.prototype as any,draw=hud.Draw;
  hud.Draw=function(this:any,...args:any[]):any{
    const result=draw.apply(this,args),world=this.mWorld,session=netSession();
    const state=session?session.confirmedTimedWave:timedWave(world);
    let layer=world._TimedWaveHud;
    if(state&&!layer){
      layer=world.createEmptyMovieClip('_TimedWaveHud',world.getNextHighestDepth());
      layer.beginFill(0x202420,85);layer.moveTo(0,0);layer.lineTo(112,0);layer.lineTo(112,24);layer.lineTo(0,24);layer.lineTo(0,0);layer.endFill();
      text(layer,'_Time',0,2,112,22,BODY_FONT,14,0xffffff,true,'center','');
    }
    if(layer){
      layer._visible=!!state&&!this.mcScreenPause;layer._x=(world.mScreenSize.x-112)/2;layer._y=54;
      if(state){layer._Time.text='SURVIVE '+clockLabel(state.remainingTicks,CMain.mFPS);layer._Time.textColor=state.remainingTicks<=CMain.mFPS*30?0xffd28d:0xffffff;}
    }
    return result;
  };
}
