// WAVE_DRAFT: snapshot-owned rewards; derived percentages never mutate a cached weapon definition.
export const WAVE_DRAFT_RULE='wave-draft-v1';
export const DRAFT_READY_RULE='draft-ready-v1';
export type Reward='damage'|'health'|'armor'|'capacity'|'heal'|'ammo'|'haste'|'mobility'|'penetration'|'scavenging'|'endurance'|'enchantPower';
export interface WaveBonuses {damage:number;health:number;armor:number;capacity:number;haste?:number;mobility?:number;penetration?:number;scavenging?:number;endurance?:number;enchantPower?:number}
export interface DraftRound {
  readyRule?:typeof DRAFT_READY_RULE;
  wave:number;remainingTicks:number;multiplier:number;
  offers:Reward[][];selected:number[];confirmed:boolean[];armed:boolean[];previousBits:number[];
}
export interface WaveDraftState {rule:typeof WAVE_DRAFT_RULE;bonuses:[WaveBonuses,WaveBonuses];lastRewardWave:number;round?:DraftRound}
export const REWARDS:readonly Reward[]=['damage','health','armor','capacity','heal','ammo'];
export const REWARD_LABELS:Record<Reward,string>={damage:'FIREPOWER',health:'VITALITY',armor:'SHIELD',capacity:'MAGAZINE',heal:'FIRST AID',ammo:'RESUPPLY',haste:'QUICK HANDS',mobility:'FOOTWORK',penetration:'ARMOR PIERCING',scavenging:'SCAVENGER',endurance:'ENCHANT ENDURANCE',enchantPower:'ENCHANT POWER'};
export const REWARD_DETAILS:Record<Reward,string>={damage:'Weapon damage +8%',health:'Max health +10%',armor:'Max shield +10%',capacity:'Ammo capacity +15%',heal:'Recover 35% max health',ammo:'Recover 35% ammo per weapon',haste:'Fire rate +6% (diminishing)',mobility:'Move speed +4% (diminishing)',penetration:'Piercing +12% (diminishing)',scavenging:'Supply effect +10% (diminishing)',endurance:'Enchant endurance +10% (diminishing)',enchantPower:'Stronger enchanted attacks (diminishing)'};
const zero:Readonly<WaveBonuses>={damage:0,health:0,armor:0,capacity:0};
export function draftBonuses(world:any,index:number):Readonly<WaveBonuses> {return world?.mUpgrades?.waveDraft?.bonuses[index]??zero;}
export function startingBonuses(wave:number,modern=false,simplified=false,endurance=false,power=false):WaveBonuses {
  if(modern){
    const keys:readonly (keyof WaveBonuses)[]=simplified?['damage','health','armor','capacity','mobility','haste','scavenging',...(endurance?['endurance' as const]:[]),...(power?['enchantPower' as const]:[])]:['damage','health','armor','capacity','mobility','haste','penetration','scavenging'];
    const count=Math.max(0,Math.floor(wave)-1),base=Math.floor(count/keys.length),extra=count%keys.length;
    const result:WaveBonuses={damage:0,health:0,armor:0,capacity:0};
    keys.forEach((key,i)=>{const n=base+(extra>i?1:0);if(i<4||n)result[key]=n;});return result;
  }
  const count=Math.max(0,Math.floor(wave)-1),base=Math.floor(count/4),extra=count%4;
  return {damage:base+(extra>0?1:0),health:base+(extra>1?1:0),armor:base+(extra>2?1:0),capacity:base};
}
export function newWaveDraft(wave:number,modern=false,simplified=false,endurance=false,power=false):WaveDraftState {
  return {rule:WAVE_DRAFT_RULE,bonuses:[startingBonuses(wave,modern,simplified,endurance,power),startingBonuses(wave,modern,simplified,endurance,power)],lastRewardWave:Math.max(0,wave-1)};
}
export function copyWaveDraft(state:WaveDraftState|undefined):WaveDraftState|undefined {
  if(!state)return;
  const r=state.round;
  return {...state,bonuses:[{...state.bonuses[0]},{...state.bonuses[1]}],...(r?{round:{...r,offers:r.offers.map(x=>[...x]),selected:[...r.selected],confirmed:[...r.confirmed],armed:[...r.armed],previousBits:[...r.previousBits]}}:{})};
}
/** Three explicit card clicks fit the existing seven-bit packet; 96 reserves both weapon-cycle bits. */
export function encodeDraftChoice(choice:number):number {return 96+(choice+1);}
export function decodeDraftChoice(bits:number):number|undefined {return bits>=97&&bits<=99?bits-97:undefined;}
export function encodeDraftSelection(choice:number):number{return 100+choice;}
export const DRAFT_CONFIRM=103;
export function compactStat(value:number):string {return Math.abs(value)<10000?String(Math.round(value)):value.toExponential(1);}
