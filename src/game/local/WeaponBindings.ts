// Queued physical actions are render-owned; bindings themselves belong to the simulated upgrades.
import {Thing,World} from '../packages.ts';
import {hasFeature} from './ModernFeatures.ts';
import {netSession} from './Net/NetSession.ts';
import {BODY_FONT,INK,text,glow} from './UiStyle.ts';
export type WeaponButton='A'|'Y';
export type WeaponBindings=Partial<Record<WeaponButton,string>>;
export type WeaponCommand={action:'select';button:WeaponButton}|{action:'bind';button:WeaponButton;weapon:string};
const names=['pistol','uzi','shotgun','barrel','grenade','fakewall','mine','rocket','chargepack','railgun'];
const mailboxes=new WeakMap<object,Map<number,WeaponCommand[]>>();
const progress=new WeakMap<object,Map<number,{button:WeaponButton;amount:number;unbind:boolean}>>();
export function bindingsFor(world:any,index:number):WeaponBindings{return world.mUpgrades?.weaponBindings?.[index]??{};}
export function validWeaponCommands(value:unknown):value is WeaponCommand[]{return Array.isArray(value)&&value.length<=4&&value.every(c=>c&&['A','Y'].includes(c.button)&&(c.action==='select'||c.action==='bind'&&names.includes(c.weapon)));}
export function queueWeaponCommand(world:any,index:number,command:WeaponCommand):void{
 if(!hasFeature(world,'weapon-bindings-v1'))return;
 let players=mailboxes.get(world);if(!players)mailboxes.set(world,players=new Map());
 const list=players.get(index)??[];if(list.length<4)list.push(command);players.set(index,list);
}
export function takeWeaponCommands(world:any,index:number):WeaponCommand[]|undefined{
 const players=mailboxes.get(world),list=players?.get(index);players?.delete(index);return list?.length?list:undefined;
}
export function applyWeaponCommands(world:any,index:number,commands:WeaponCommand[]|undefined):void{
 if(!commands||!hasFeature(world,'weapon-bindings-v1')||world.mUpgrades.waveDraft?.round)return;
 const p=(Object.values(world.mThing_Collection.mPlayerThings)as any[]).find(p=>p.mPlayerIndex===index);
 if(!p||p.mLife<=0||p.mFlags&Thing.CThing.mFlag_DEAD)return;
 const bindings=world.mUpgrades.weaponBindings[index] as WeaponBindings;
 for(const c of commands){
  if(c.action==='select'){const name=bindings[c.button];if(name&&p.mWeapons[name]?.mActive){p.mControls.FIRE.Renew();p.SelectWeapon(name);}continue;}
  if(p.mWeapon_Current?.mNameID!==c.weapon||!p.mWeapons[c.weapon]?.mActive)continue;
  if(bindings[c.button]===c.weapon)delete bindings[c.button];
  else{const other=c.button==='A'?'Y':'A';if(bindings[other]===c.weapon)delete bindings[other];bindings[c.button]=c.weapon;}
 }
}
export function setBindingProgress(world:any,index:number,value:{button:WeaponButton;amount:number;unbind:boolean}|undefined):void{
 let players=progress.get(world);if(!players)progress.set(world,players=new Map());if(value)players.set(index,value);else players.delete(index);
}
export function bindingProgress(world:any,index:number){return progress.get(world)?.get(index);}
export function installWeaponBindings():void{
 const world=World.CWorld.prototype as any,process=world.Process;
 world.Process=function(this:any):any{
  if(!netSession()?.holdsWorld(this))for(let index=0;index<2;index++)applyWeaponCommands(this,index,takeWeaponCommands(this,index));
  return process.call(this);
 };
 const hud=World.CHud.prototype as any,update=hud.UpdatePlayer;
 hud.UpdatePlayer=function(this:any,p:any,...args:any[]):any{
  const result=update.call(this,p,...args);if(!hasFeature(this.mWorld,'weapon-bindings-v1'))return result;
  const head=this.mcPlayers[p.mPlayerIndex];if(!head)return result;
  const bounds=head.mcAmmo.getBounds(head),session=netSession(),confirmed=session?.confirmedPlayerStats?.find(s=>s.index===p.mPlayerIndex);
  const bindings=session?confirmed?.bindings??{}:bindingsFor(this.mWorld,p.mPlayerIndex),weapon=session?confirmed?.weaponId:p.mWeapon_Current?.mNameID;
  const letters=(['A','Y']as const).filter(key=>bindings[key]===weapon).join(' / ');
  let label=head._WeaponBinding;
  if(!label){label=text(head,'_WeaponBinding',0,0,24,13,BODY_FONT,10,INK,true,'left','');label.filters=glow();}
  // The authored ammo field is much wider than its visible centered text. Follow the glyph edge,
  // not that empty field, so small shortcut letters stay beside the weapon and clear of map props.
  const field=head.mcAmmo.tfAmount,box=field.getBounds(head),width=field.textWidth*(box.xMax-box.xMin)/Math.max(1,field._width),align=field.getTextFormat().align;
  label._x=(align==='center'?(box.xMin+box.xMax+width)/2:align==='right'?box.xMax:box.xMin+width)+4;
  label._y=bounds.yMin+2;label.text=letters;
  const value=bindingProgress(this.mWorld,p.mPlayerIndex),bar=head._BindingProgress??head.createEmptyMovieClip('_BindingProgress',head.getNextHighestDepth());
  bar._visible=!!value&&!this.mWorld.mPaused&&!this.mWorld.mUpgrades.waveDraft?.round&&(!session||session.phase==='playing'&&!session.netPaused&&!session.pauseBarrier.pending);
  if(bar._visible){
   bar._x=bounds.xMin;bar._y=bounds.yMax+8;bar.clear();bar.lineStyle(1,0x333333,100);bar.beginFill(0xf5f5ef,100);
   bar.moveTo(0,0);bar.lineTo(48,0);bar.lineTo(48,4);bar.lineTo(0,4);bar.lineTo(0,0);bar.endFill();
   bar.lineStyle();bar.beginFill(value!.unbind?0xef1304:0x267144,100);bar.moveTo(1,1);bar.lineTo(1+46*value!.amount,1);bar.lineTo(1+46*value!.amount,3);bar.lineTo(1,3);bar.lineTo(1,1);bar.endFill();
   const hint=bar._Hint??text(bar,'_Hint',0,5,90,13,BODY_FONT,10,INK,true,'left','');hint.text=`${value!.button} ${value!.unbind?'UNBIND':'BIND'}`;
  }
  return result;
 };
}
