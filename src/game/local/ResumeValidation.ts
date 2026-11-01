// Validate persisted/received v2 data before any restore hook can mutate a world.
import type {RunSnapshot} from './Resume.ts';
import {ROOM_DIMENSIONS} from './TimedWaveRules.ts';
const record=(v:any):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:any):boolean=>typeof v==='number'&&Number.isFinite(v);
const integer=(v:any,min=0,max=Number.MAX_SAFE_INTEGER):boolean=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const optional=(v:any,check:(v:any)=>boolean):boolean=>v===undefined||check(v);
const string=(v:any):boolean=>typeof v==='string';
const numbers=(v:any,keys:readonly string[]):boolean=>record(v)&&keys.every(k=>finite(v[k]));
const list=(v:any,check:(v:any)=>boolean):boolean=>Array.isArray(v)&&v.every(check);
const weapons=['pistol','uzi','shotgun','barrel','grenade','fakewall','mine','rocket','chargepack','railgun'];
const weapon=(v:any):boolean=>weapons.includes(v);
const rewards=[...['damage','health','armor','capacity','heal','ammo','haste','mobility','penetration','scavenging','endurance','enchantPower','dodge']];
function data(v:any,depth=0,parents=new Set<object>()):boolean{
 if(v===undefined||v===null||typeof v==='string'||typeof v==='boolean')return true;
 if(typeof v==='number')return Number.isFinite(v);
 if(typeof v!=='object'||depth>64||parents.has(v))return false;
 parents.add(v);
 const ok=Object.keys(v).every(k=>!['__proto__','prototype','constructor'].includes(k)&&data(v[k],depth+1,parents));
 parents.delete(v);return ok;
}
function weaponState(v:any):boolean{
 return record(v)&&typeof v.active==='boolean'&&['ammo','totalAmmo','draftCapacityBonus','enchantedAmmo','enchantDurability','enchantMaximum'].every(k=>optional(v[k],finite));
}
function player(v:any):boolean{
 return numbers(v,['x','y','z','angle','life','maxLife','invincible','alpha','flags','stateCount'])&&integer(v.index,0,1)&&v.maxLife>0
  &&typeof v.stateID==='string'&&/^State_\w+$/.test(v.stateID)&&optional(v.returnStateID,string)&&optional(v.baseStateID,string)
  &&optional(v.armor,finite)&&record(v.weapons)&&Object.entries(v.weapons).every(([name,s])=>weapon(name)&&weaponState(s))&&optional(v.currentWeapon,weapon);
}
function object(v:any):boolean{
 if(!numbers(v,['x','y','angle'])||!['marker','placed'].includes(v.origin)||!['CThing_Object_Barrel','CThing_Object_Wall','CThing_Object_Mine','CThing_Object_ChargePack','CThing_Object_Pickup','CThing_Object_WeaponCrate','CThing_Object_SupplyCrate'].includes(v.classID))return false;
 return optional(v.owner,x=>integer(x,0,1))&&optional(v.crate,c=>record(c)&&list(c.weapons,w=>numbers(w,['ammo','totalAmmo'])&&weapon(w.nameID))&&optional(c.currentWeapon,weapon))
  &&optional(v.supply,s=>record(s)&&['medical','armor','ammo','enchant'].includes(s.kind)&&string(s.id))
  &&optional(v.randomRed,s=>numbers(s,['remainingTicks','alpha'])&&string(s.id));
}
function growth(v:any):boolean{
 return record(v)&&v.version===1&&Array.isArray(v.players)&&v.players.length===2&&v.players.every(p=>numbers(p,['score','xp'])&&integer(p.level,1));
}
function draft(v:any):boolean{
 if(!record(v)||v.rule!=='wave-draft-v1'||!integer(v.lastRewardWave)||!Array.isArray(v.bonuses)||v.bonuses.length!==2
  ||!v.bonuses.every(b=>numbers(b,['damage','health','armor','capacity'])&&Object.values(b).every(n=>integer(n))))return false;
 const r=v.round;if(r===undefined)return true;
 if(!numbers(r,['remainingTicks','multiplier'])||!integer(r.wave,1)||!Array.isArray(r.offers)||r.offers.length<1||r.offers.length>2
  ||!r.offers.every(row=>Array.isArray(row)&&row.length===3&&row.every(x=>rewards.includes(x))))return false;
 const count=r.offers.length;
 return ['selected','confirmed','armed','previousBits'].every(k=>Array.isArray(r[k])&&r[k].length===count)
  &&r.selected.every(n=>integer(n,0,2))&&r.confirmed.every(n=>typeof n==='boolean')&&r.armed.every(n=>typeof n==='boolean')&&r.previousBits.every(n=>integer(n,0,127));
}
function boss(v:any):boolean{
 return numbers(v,['life','maximum'])&&string(v.kind)&&typeof v.defeated==='boolean'&&optional(v.id,string)
  &&optional(v.members,x=>Array.isArray(x)&&x.length>0&&x.every(boss));
}
function timed(v:any):boolean{
 return numbers(v,['totalTicks','remainingTicks','zombieTicks','devilTicks','opening'])&&v.totalTicks>0&&v.rule==='timed-waves-v1'&&['combat','draft'].includes(v.phase)
  &&list(v.warnings,w=>numbers(w,['x','y','ticks'])&&['Zombie','Devil'].includes(w.family))&&optional(v.boss,boss)
  &&optional(v.clear,c=>numbers(c,['zombies','devils','emittedZombies','emittedDevils','killedZombies','killedDevils']));
}
function variants(v:any):boolean{
 return numbers(v,['wave','zombie','devil','nextZone'])&&v.rule==='enemy-variants-v1'&&list(v.zones,z=>numbers(z,['x','y','angle','damage','born','warning','duration','interval','lastPulse'])&&string(z.caster))
  &&list(v.enemies,e=>numbers(e,['x','y','angle','frame'])&&string(e.id)&&string(e.kind)&&string(e.state)&&record(e.fields)
   &&Object.entries(e.fields).every(([k,value])=>/^m(?:Life$|MaxLife$|Variant|Charge|Boss|EnemyArmor|Combat|Gunner|NativeBoss)/.test(k)&&(value===undefined||finite(value)||string(value))));
}
export function validRunSnapshot(v:unknown):v is RunSnapshot{
 if(!record(v)||v.version!==2||!['Single','Coop','DeathMatch'].includes(v.gameMode)||typeof v.roomLibLink!=='string'||!/^ROOM_Single_00(?:0[1-9]|1[0-8])$/.test(v.roomLibLink)
  ||!integer(v.wave,1)||!integer(v.tick)||!integer(v.rngState,0,0xffffffff)||!numbers(v,['score','multiplierIndex','multiplierTick','multiplierTickTotal','multipleKillsIndex','multipleKillsTick','multipleKillsTickTotal'])
  ||!numbers(v.waveCounters,['spawnZombie','spawnDevil','zombieCount','zombieTotal','devilCount','devilTotal','playerCount'])
  ||!Array.isArray(v.players)||v.players.length>2||!v.players.every(player)||new Set(v.players.map(p=>p.index)).size!==v.players.length||!list(v.objects,object)||!data(v))return false;
 const [width,height]=ROOM_DIMENSIONS[Number(v.roomLibLink.slice(-4))-1]!;
 if(!v.players.every(p=>p.x>=0&&p.x<width&&p.y>=0&&p.y<height))return false;
 return optional(v.features,x=>list(x,string))&&optional(v.growth,growth)&&optional(v.waveDraft,draft)&&optional(v.timedWave,timed)&&optional(v.variants,variants)
  &&optional(v.weaponBindings,x=>Array.isArray(x)&&x.length===2&&x.every(b=>record(b)&&Object.entries(b).every(([k,w])=>['A','Y'].includes(k)&&weapon(w))))
  &&optional(v.combat,c=>record(c)&&['combat-pve-v2','combat-pve-v3'].includes(c.rule)&&optional(c.pendingWave,x=>integer(x,1)))
  &&optional(v.loot,l=>record(l)&&l.rule==='supply-crates-v2'&&numbers(l.state,['nextDropTicks','nextId']))
  &&optional(v.deaths,x=>Array.isArray(x)&&x.length===2&&x.every(finite));
}
