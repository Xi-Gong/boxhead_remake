// Evade the whole incoming hit before damage, armor, hit reactions and lethal ownership.
import {forIn,mathRandom} from '../../engine/runtime.ts';
import {Thing} from '../packages.ts';
import {draftBonuses} from './WaveDraftRules.ts';
import {percentStats,statPercent} from './PercentStats.ts';
export function dodgeChance(player:any):number{return percentStats(player?.mWorld)?statPercent('dodge',draftBonuses(player.mWorld,player.mPlayerIndex)):0;}
export function installDodge():void{
 const p=Thing.Creature.CThing_Creature_Player.prototype as any,process=p.ProcessAffects;
 p.ProcessAffects=function(this:any):any{
  const chance=dodgeChance(this);
  if(chance<=0||this.mLife<=0||this.mInvincible||this.mFlags&Thing.CThing.mFlag_DEAD)return process.call(this);
  const incoming=this.mAffectors,kept=Object.assign([],incoming);
  for(const key of forIn(incoming)){
   const hit=incoming[key];if(!hit||!(hit.mDamage>0)||![1,4,64,512].includes(hit.mType))continue;
   if(hit.mType===4&&this.mPosition.Distance2D(hit.mAffector.mPosition)>hit.mRange)continue;
   if((hit.mType===1||hit.mType===4)&&!Thing.Creature.CThing_Creature.mDamageActive)continue;
   if(mathRandom()<chance){delete kept[key];this.mWorld.mHud.AddMessage_Info('DODGE!',this.mPlayerIndex);}
  }
  this.mAffectors=kept;return process.call(this);
 };
}
