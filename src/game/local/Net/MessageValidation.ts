// Runtime wire checks: TypeScript types do not validate JSON received from another machine.
import type {LanMessage} from './protocol.ts';

const record=(v:any):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:any,min=0,max=Number.MAX_SAFE_INTEGER):boolean=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=(v:any):boolean=>typeof v==='number'&&Number.isFinite(v);
const string=(v:any,max=1024):boolean=>typeof v==='string'&&v.length<=max;
const optional=(v:any,check:(v:any)=>boolean):boolean=>v===undefined||check(v);
const strings=(v:any):boolean=>Array.isArray(v)&&v.length<=128&&v.every(x=>string(x));
const mode=(v:any):boolean=>v==='Coop'||v==='DeathMatch';
const room=(v:any):boolean=>typeof v==='string'&&/^ROOM_Single_00(?:0[1-9]|1[0-8])$/.test(v);
function settings(v:any):boolean{
 return record(v)&&integer(v.gameSpeed,0,2)&&['devils','collisions','damage'].every(k=>typeof v[k]==='boolean');
}
function selection(v:any):boolean{
 return record(v)&&mode(v.mode)&&['charP1','charP2','difficulty','gameAmount'].every(k=>integer(v[k],0,3))&&integer(v.levelIdx,0,17)
  &&optional(v.wave,x=>integer(x,1))&&optional(v.maxWave,x=>integer(x,1))
  &&(v.wave===undefined||v.maxWave===undefined||v.wave<=v.maxWave)&&optional(v.settings,settings);
}
function config(v:any):boolean{
 return settings(v)&&['charP1','charP2','difficulty','gameAmount'].every(k=>integer(v[k],0,3))&&typeof v.detail==='boolean'
  &&optional(v.features,strings)
  &&['endless','timedWaves','waveDraft','draftReady','combat','bossWaves','bossEncounters','tieredGrowth','clearWaves',
   'variants','enchantment','refill','teamPass','progression','supplies','survival','loot','balance'].every(k=>optional(v[k],x=>string(x,64)));
}
function checksum(v:any):boolean{
 return record(v)&&integer(v.tick)&&finite(v.score)&&finite(v.things)&&finite(v.zombies)
  &&Array.isArray(v.q)&&v.q.length===6&&v.q.every(finite)
  &&optional(v.full,x=>record(x)&&Object.values(x).every(y=>string(y)));
}
function commands(v:any):boolean{
 return Array.isArray(v)&&v.length<=4&&v.every(c=>record(c)&&['A','Y'].includes(c.button)
  &&(c.action==='select'||c.action==='bind'&&['pistol','uzi','shotgun','barrel','grenade','fakewall','mine','rocket','chargepack','railgun'].includes(c.weapon)));
}

/** Unknown optional fields are retained; all fields consumed by wire handlers must have their documented shape. */
export function validLanMessage(v:unknown):v is LanMessage{
 if(!record(v))return false;
 switch(v.t){
  case 'hello':return integer(v.proto)&&string(v.app)&&string(v.name)&&integer(v.char,0,3)&&optional(v.sid,string)
   &&optional(v.capTick,integer)&&optional(v.netcodes,strings)&&optional(v.features,strings);
  case 'welcome':return typeof v.ok==='boolean'&&integer(v.proto)&&string(v.app)&&string(v.name)&&string(v.sid)&&optional(v.reason,string);
  case 'in':return integer(v.tick)&&integer(v.bits,0,127)&&optional(v.sum,checksum)&&optional(v.weaponCommands,commands);
  case 'start':return mode(v.mode)&&room(v.roomLink)&&config(v.cfg)&&integer(v.seed,0,0xffffffff)
   &&optional(v.inputDelay,x=>integer(x,0,8))&&optional(v.resumeTick,integer)&&optional(v.wave,x=>integer(x,1))
   &&optional(v.rollback,x=>typeof x==='boolean')&&optional(v.netcode,x=>x==='rollback-v2')&&optional(v.epoch,x=>string(x,64))
   &&optional(v.snap,x=>record(x)&&x.version===2&&room(x.roomLibLink)&&integer(x.wave,1)&&Array.isArray(x.players)&&Array.isArray(x.objects));
  case 'setup':return selection(v.sel);
  case 'lobby':return optional(v.sel,selection);
  case 'ready':return typeof v.ready==='boolean';
  case 'hb':return finite(v.ts)&&optional(v.echo,x=>x===true)&&optional(v.rttMs,x=>finite(x)&&x>=0);
  case 'leave':return ['quit','forfeit'].includes(v.reason)&&optional(v.via,x=>x==='timeout'||x==='concede');
  case 'desync':return optional(v.tick,integer)&&optional(v.mine,string)&&optional(v.theirs,string);
  case 'input-gap':return integer(v.need);
  case 'input-path':return v.version===1&&integer(v.port,1,65535)&&string(v.token,64);
  case 'recover':return ['offer','ready','commit','reject'].includes(v.stage)&&integer(v.generation)&&integer(v.seed,0,0xffffffff)
   &&integer(v.need)&&integer(v.head)&&optional(v.epoch,x=>string(x,64));
  case 'pause-request':return typeof v.paused==='boolean';
  case 'pause-barrier':return ['freeze','ready','commit','resume'].includes(v.stage)&&integer(v.id)&&integer(v.tick);
  case 'retry':case 'pause':case 'unpause':return true;
  default:return false;
 }
}
