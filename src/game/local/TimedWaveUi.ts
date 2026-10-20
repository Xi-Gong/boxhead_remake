// Display-only timed-wave surfaces. LAN reads committed tick metadata, never the predicted head.
import { Screen, World } from '../packages.ts';
import { netSession } from './Net/NetSession.ts';
import { timedWave, timedWavesConfigured } from './TimedWaves.ts';
import { clockLabel, ROOM_DIMENSIONS, COMBAT_ROOM_SECONDS,waveSeconds } from './TimedWaveRules.ts';
import {combatConfigured} from './Combat.ts';
import { menuText } from './UiStyle.ts';
import { bossWavesConfigured } from './BossWaves.ts';
import { drawBossHealth } from './BossHealthUi.ts';
export function waveLimitLabel(index:number,bosses=false,modern=false):string {
  if(modern&&COMBAT_ROOM_SECONDS[index]!==undefined)return `SURVIVE ${clockLabel(COMBAT_ROOM_SECONDS[index]!,1)}`+(bosses?` / BOSS ${clockLabel(COMBAT_ROOM_SECONDS[index]!+30,1)}`:'');
  const size=ROOM_DIMENSIONS[index];return size?`SURVIVE ${clockLabel(waveSeconds(...size),1)}`+(bosses?` / BOSS ${clockLabel(waveSeconds(...size,true),1)}`:''):'';
}
export function showWaveLimit(parent:any,index:number,enabled:boolean,x=205,y=395,width=230,bosses=bossWavesConfigured()):void {
  const field=parent._WaveLimit??menuText(parent,'_WaveLimit',x,y,width,18,'',12);
  field.text=waveLimitLabel(index,bosses,combatConfigured());field._visible=enabled;
}
export function installTimedWaveUi():void {
  const select=Screen.CScreen_SelectWorld.prototype as any,change=select.ChangeLevel;
  select.ChangeLevel=function(this:any,target:any,index:number):any{
    const result=change.call(this,target,index);
    showWaveLimit(this,index,this.mMode!=='DeathMatch'&&timedWavesConfigured());return result;
  };
  const hud=World.CHud.prototype as any,draw=hud.Draw;
  const pause=hud.Pause;
  hud.Pause=function(this:any,...args:any[]):any{
    const result=pause.apply(this,args);
    // Paused worlds do not call Draw, so visibility must change with the pause transition itself.
    if(this.mcScreenPause)for(const name of ['_TimedWaveHud','_BossWaveHud','_BossHealthHud','_WaveDraftHud'])if(this.mWorld[name])this.mWorld[name]._visible=false;
    return result;
  };
  hud.Draw=function(this:any,...args:any[]):any{
    const result=draw.apply(this,args),world=this.mWorld,session=netSession();
    const state=session?session.confirmedTimedWave:timedWave(world);
    drawBossHealth(world,state?.boss,state?.phase==='combat'&&!this.mcScreenPause&&!session?.netPaused);
    return result;
  };
}
