// WAVE_DRAFT: snapshot-owned rewards; derived percentages never mutate a cached weapon definition.
export const WAVE_DRAFT_RULE='wave-draft-v1';
export const DRAFT_READY_RULE='draft-ready-v1';
export type Reward='damage'|'health'|'armor'|'capacity'|'heal'|'ammo';
export interface WaveBonuses {damage:number;health:number;armor:number;capacity:number}
export interface DraftRound {
  readyRule?:typeof DRAFT_READY_RULE;
  wave:number;remainingTicks:number;multiplier:number;
  offers:Reward[][];selected:number[];confirmed:boolean[];armed:boolean[];previousBits:number[];
}
export interface WaveDraftState {rule:typeof WAVE_DRAFT_RULE;bonuses:[WaveBonuses,WaveBonuses];lastRewardWave:number;round?:DraftRound}
export const REWARDS:readonly Reward[]=['damage','health','armor','capacity','heal','ammo'];
export const REWARD_LABELS:Record<Reward,string>={damage:'FIREPOWER',health:'VITALITY',armor:'SHIELD',capacity:'MAGAZINE',heal:'FIRST AID',ammo:'RESUPPLY'};
export const REWARD_DETAILS:Record<Reward,string>={damage:'Weapon damage +8%',health:'Max health +10%',armor:'Max shield +10%',capacity:'Ammo capacity +15%',heal:'Recover 35% max health',ammo:'Recover 35% ammo per weapon'};
const zero:Readonly<WaveBonuses>={damage:0,health:0,armor:0,capacity:0};
export function draftBonuses(world:any,index:number):Readonly<WaveBonuses> {return world?.mUpgrades?.waveDraft?.bonuses[index]??zero;}
export function startingBonuses(wave:number):WaveBonuses {
  const count=Math.max(0,Math.floor(wave)-1),base=Math.floor(count/4),extra=count%4;
  return {damage:base+(extra>0?1:0),health:base+(extra>1?1:0),armor:base+(extra>2?1:0),capacity:base};
}
export function newWaveDraft(wave:number):WaveDraftState {
  return {rule:WAVE_DRAFT_RULE,bonuses:[startingBonuses(wave),startingBonuses(wave)],lastRewardWave:Math.max(0,wave-1)};
}
export function copyWaveDraft(state:WaveDraftState|undefined):WaveDraftState|undefined {
  if(!state)return;
  const r=state.round;
  return {...state,bonuses:[{...state.bonuses[0]},{...state.bonuses[1]}],...(r?{round:{...r,offers:r.offers.map(x=>[...x]),selected:[...r.selected],confirmed:[...r.confirmed],armed:[...r.armed],previousBits:[...r.previousBits]}}:{})};
}
/** Three explicit card clicks fit the existing seven-bit packet; 96 reserves both weapon-cycle bits. */
export function encodeDraftChoice(choice:number):number {return 96+(choice+1);}
export function decodeDraftChoice(bits:number):number|undefined {return bits>=97&&bits<=99?bits-97:undefined;}
export function compactStat(value:number):string {return Math.abs(value)<10000?String(Math.round(value)):value.toExponential(1);}
