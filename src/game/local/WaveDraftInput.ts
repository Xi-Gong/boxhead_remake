// Render/input-owned mailbox. LAN consumes this only while sampling real input, never during replay.
import {encodeDraftChoice} from './WaveDraftRules.ts';
import {draftInputBlocked} from './DraftStatsInput.ts';
const clicks=new WeakMap<object,Map<number,{wave:number;bits:number}[]>>();
export function queueDraftCommand(world:any,player:number,bits:number,wave:number):void{
 let map=clicks.get(world);if(!map)clicks.set(world,map=new Map());
 const queue=(map.get(player)??[]).filter(x=>x.wave===wave);
 if(queue.length<16)queue.push({wave,bits});map.set(player,queue);
}
export function queueDraftChoice(world:any,player:number,choice:number,wave:number):void {
  if(choice<0||choice>2)return;
  queueDraftCommand(world,player,encodeDraftChoice(choice),wave);
}
export function takeDraftChoice(world:any,player:number):number|undefined {
  const map=clicks.get(world);
  if(draftInputBlocked(world,player)){map?.delete(player);return 0;}
  const click=map?.get(player)?.shift();if(!click)return;
  if(world.mUpgrades.waveDraft?.round?.wave===click.wave)return click.bits;
}
