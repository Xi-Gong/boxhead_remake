export type CombatKind='runner'|'brute'|'gunner'|'butcher'|'hunter';
export type BossKind='charger'|'priest'|'butcher'|'hunter'|'devil'|'zombie';
export function combatFamily(kind:string):'Zombie'|'Devil'{return ['zombie','charger','runner','brute','gunner'].includes(kind)?'Zombie':'Devil';}
export function combatOrdinal(wave:number,ordinal:number,family:'Zombie'|'Devil'):CombatKind|undefined{
 const slot=ordinal*37%100;
 if(family==='Zombie'){
  if(wave>=3&&slot<18)return 'runner';
  if(wave>=6&&slot>=18&&slot<32)return 'brute';
  if(wave>=8&&slot>=32&&slot<44)return 'gunner';
 }
 if(family==='Devil'){
  if(wave>=12&&slot<35)return 'butcher';
  if(wave>=18&&slot>=35&&slot<60)return 'hunter';
 }
}
