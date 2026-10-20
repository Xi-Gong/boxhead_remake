// Render/input-owned mailbox. LAN consumes this only while sampling real input, never during replay.
import {encodeDraftChoice} from './WaveDraftRules.ts';
const clicks=new WeakMap<object,Map<number,{wave:number;bits:number}>>();
export function queueDraftChoice(world:any,player:number,choice:number,wave:number):void {
  if(choice<0||choice>2)return;
  let map=clicks.get(world);if(!map)clicks.set(world,map=new Map());
  map.set(player,{wave,bits:encodeDraftChoice(choice)});
}
export function takeDraftChoice(world:any,player:number):number|undefined {
  const map=clicks.get(world),click=map?.get(player);if(!click)return;
  map!.delete(player);
  if(world.mUpgrades.waveDraft?.round?.wave===click.wave)return click.bits;
}
