// Display-only timed-wave surfaces. LAN reads committed tick metadata, never the predicted head.
import { CMain, Screen, World } from '../packages.ts';
import { netSession } from './Net/NetSession.ts';
import { timedWave, timedWavesConfigured } from './TimedWaves.ts';
import { clockLabel, ROOM_DIMENSIONS, waveSeconds } from './TimedWaveRules.ts';
import { BODY_FONT, menuText, text } from './UiStyle.ts';
import { bossWavesConfigured } from './BossWaves.ts';
export function waveLimitLabel(index:number,bosses=false):string {
  const size=ROOM_DIMENSIONS[index];return size?`SURVIVE ${clockLabel(waveSeconds(...size),1)}`+(bosses?` / BOSS ${clockLabel(waveSeconds(...size,true),1)}`:''):'';
}
export function showWaveLimit(parent:any,index:number,enabled:boolean,x=205,y=395,width=230,bosses=bossWavesConfigured()):void {
  const field=parent._WaveLimit??menuText(parent,'_WaveLimit',x,y,width,18,'',12);
  field.text=waveLimitLabel(index,bosses);field._visible=enabled;
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
      layer._visible=!!state&&state.phase==='combat'&&!this.mcScreenPause;layer._x=(world.mScreenSize.x-112)/2;layer._y=54;
      if(state){layer._Time.text=(state.boss?'BOSS ':'SURVIVE ')+clockLabel(state.remainingTicks,CMain.mFPS);layer._Time.textColor=state.remainingTicks<=CMain.mFPS*30?0xffd28d:0xffffff;}
    }
    let bossLayer=world._BossWaveHud;
    if(state?.boss&&!bossLayer){
      bossLayer=world.createEmptyMovieClip('_BossWaveHud',world.getNextHighestDepth());
      text(bossLayer,'_Name',0,1,260,18,BODY_FONT,12,0xffe2b2,true,'center','');
      text(bossLayer,'_Reward',0,28,260,16,BODY_FONT,10,0xffe2b2,false,'center','DEFEAT BOSS: DOUBLE UPGRADE');
    }
    if(bossLayer){
      bossLayer._visible=!!state?.boss&&state.phase==='combat'&&!this.mcScreenPause;
      bossLayer._x=(world.mScreenSize.x-260)/2;bossLayer._y=81;
      if(state?.boss){
        const boss=state.boss,fraction=boss.maximum>0?Math.max(0,Math.min(1,boss.life/boss.maximum)):1;
        bossLayer._Name.text=boss.kind==='charger'?'BONE TYRANT':'EMBER LORD';bossLayer.clear();
        const rect=(x:number,y:number,w:number,h:number,color:number,alpha:number):void=>{
          bossLayer.beginFill(color,alpha);bossLayer.moveTo(x,y);bossLayer.lineTo(x+w,y);bossLayer.lineTo(x+w,y+h);bossLayer.lineTo(x,y+h);bossLayer.lineTo(x,y);bossLayer.endFill();
        };
        rect(0,0,260,46,0x231f1b,85);rect(8,20,244,6,0x493d37,100);rect(8,20,244*fraction,6,boss.kind==='charger'?0xbcb68a:0xe79b50,100);
      }
    }
    return result;
  };
}
