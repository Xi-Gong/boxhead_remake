// Render/input-owned mailbox. LAN consumes this only while sampling real input, never during replay.
import {encodeDraftChoice,DRAFT_CONTINUE,DRAFT_CONFIRM} from './WaveDraftRules.ts';
import {draftInputBlocked,draftPhysicalHeld} from './DraftStatsInput.ts';
export type DraftInputStage='intro'|'choices';
const clicks=new WeakMap<object,Map<number,{wave:number;bits:number;stage:DraftInputStage}[]>>();
/** Fresh physical edges become actions, so adjacent short taps need no artificial empty tick. */
export function draftSampleBits(world:any,bits:number,pressed:number):number{
 const round=world?.mUpgrades?.waveDraft?.round;
 if(round?.chosen){
  if(round.intro)return pressed&16?DRAFT_CONTINUE:bits?16:0;
  if(pressed&(1|4|64))return 104;
  if(pressed&(2|8|32))return 105;
  if(pressed&16)return DRAFT_CONFIRM;
  return bits?16:0;
 }
 if(!round?.readyRule)return bits;
 if(pressed&(1|4|64))return 104;
 if(pressed&(2|8|32))return 105;
 return bits&16;
}
export function queueDraftCommand(world:any,player:number,bits:number,wave:number,sourceStage?:DraftInputStage):void{
 const round=world?.mUpgrades?.waveDraft?.round,stage=sourceStage??(round?.intro?'intro':'choices');
 if(round?.intro?.remainingTicks>0)return;
 let map=clicks.get(world);if(!map)clicks.set(world,map=new Map());
 const queue=(map.get(player)??[]).filter(x=>x.wave===wave);
 if(queue.length<16)queue.push({wave,bits,stage});map.set(player,queue);
}
export function queueDraftChoice(world:any,player:number,choice:number,wave:number):void {
  if(choice<0||choice>2)return;
  queueDraftCommand(world,player,encodeDraftChoice(choice),wave);
}
export function takeDraftChoice(world:any,player:number):number|undefined {
  const map=clicks.get(world);
  if(draftInputBlocked(world,player)){map?.delete(player);return world.mUpgrades?.waveDraft?.round?.chosen&&draftPhysicalHeld(player)?16:0;}
 const queue=map?.get(player),round=world?.mUpgrades?.waveDraft?.round;
 while(queue?.length){const click=queue.shift()!;if(round?.wave===click.wave&&(round.intro?'intro':'choices')===click.stage)return click.bits;}
}
