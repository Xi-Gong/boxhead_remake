// DEVIL_SUPPLIES: seeded PvE loot. Original crate silhouette/shading, with distinct cached supply finishes.
import {flash,proto,forIn} from '../../engine/runtime.ts';
import {CMain,CSound,Thing,registerGameClass} from '../packages.ts';
import {CThing_Object_Pickup} from '../Thing/Object/CThing_Object_Pickup.ts';
import { playerMaximum, survivalEnabled } from './SurvivalRules.ts';

export const SUPPLY_RULE='armor-ammo-v1';
export const ARMOR_MAX=100;
export type SupplyKind='armor'|'ammo'|'medical';
export function devilSupply(roll:number):SupplyKind|undefined{return roll<20?'armor':roll<40?'ammo':undefined;}
// Immutable per-world rules derived from the negotiated config, not mutable gameplay/snapshot data.
const enabledWorlds=new WeakSet<object>();
export function setSuppliesEnabled(world:object,enabled:boolean):void{if(enabled)enabledWorlds.add(world);else enabledWorlds.delete(world);}
export function suppliesEnabled(world:any):boolean{return enabledWorlds.has(world);}
export function armorMaximum(player:any):number{return survivalEnabled(player.mWorld)?playerMaximum(player):ARMOR_MAX;}
export function armorValue(value:unknown,maximum=ARMOR_MAX):number{return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(maximum,value)):0;}
export function refillArmor(player:any):void{player.mArmor=armorMaximum(player);}
export function refillAmmo(player:any):void{
  for(const entry of player.mWeaponList??[]){
    if(!entry.mActive||!entry.mThing)continue;
    const weapon=entry.mThing;
    player.mWorld.mUpgrades.ApplyUpgrade_Weapon(weapon);
    weapon.mAmmo=weapon.mTotalAmmo;
  }
}
export function supplyCanBenefit(player:any,kind:SupplyKind):boolean{
  if(!player||player.mLife<=0||player.mFlags&Thing.CThing.mFlag_DEAD)return false;
  if(kind==='armor')return armorValue(player.mArmor,armorMaximum(player))<armorMaximum(player);
  if(kind==='medical')return player.mLife<player.mMaxLife;
  return (player.mWeaponList??[]).some((entry:any)=>entry.mActive&&entry.mThing&&entry.mThing.mAmmo<entry.mThing.mTotalAmmo);
}
export function applySupplyEffect(player:any,kind:SupplyKind):boolean{
  if(!supplyCanBenefit(player,kind))return false;
  if(kind==='armor')refillArmor(player);
  else if(kind==='ammo')refillAmmo(player);
  else player.mLife=player.mMaxLife;
  return true;
}
/** Keep original cell enumeration order, but a full/dead player cannot block another valid picker. */
export function livingPicker(cell:any,kind?:SupplyKind):any{
  for(const key of forIn(cell?.mObjects)){
    const player=cell.mObjects[key];
    if(player._CLASSID_==='CThing_Creature_Player'&&player.mLife>0&&!(player.mFlags&Thing.CThing.mFlag_DEAD)
      &&(kind===undefined||supplyCanBenefit(player,kind)))return player;
  }
}
const art=new WeakMap<object,Map<SupplyKind,any>>();

export class CThing_Object_SupplyCrate extends CThing_Object_Pickup {
  declare mSupplyConsumed:boolean;
  declare mSupplyKind:SupplyKind;
  /** Present only for permanent modern crates; stable across world rebuilds, independent of thing allocation IDs. */
  declare mSupplyId:string|undefined;
  constructor(position:any,kind:SupplyKind='armor',identity?:string){
    super(position);
    this.mSupplyKind=kind;
    this.mSupplyConsumed=false;
    const source=this.mcDrawObject.bmList;
    let kinds=art.get(source);if(!kinds)art.set(source,kinds=new Map());
    let marked=kinds.get(kind);
    if(!marked){
      marked=this.mcDrawObject.Clone();
      const frame=source[0],bitmap=frame.sBMD.clone(),x=-frame.mDisp.x-4,y=-frame.mDisp.y-9;
      // Refinish the original three shaded faces rather than painting a flat icon over a red box.
      // Zero offsets preserve its black keyline and transparent pixels. Bake once per library/kind,
      // so the live render path remains the original bitmap blit with no per-frame filter cost.
      const palette=kind==='armor'
        ?[.16,.30,0,0,0, .30,.60,0,0,0, .48,.65,0,0,0, 0,0,0,1,0]
        :kind==='medical'
          ?[.10,.15,0,0,0, .65,.60,0,0,0, .20,.25,0,0,0, 0,0,0,1,0]
          :[.36,.28,0,0,0, .40,.34,0,0,0, .20,.16,0,0,0, 0,0,0,1,0];
      bitmap.applyFilter(bitmap,bitmap.rectangle,new flash.geom.Point(0,0),new flash.filters.ColorMatrixFilter(palette));
      const hardware=kind==='armor'?0xffa8c4d3:kind==='medical'?0xffc5e6d5:0xffbcbb8b;
      // Short corner guards and their dark fixings stay inside the authored front faces.
      for(const dx of [-6,13]){
        bitmap.fillRect(new flash.geom.Rectangle(x+dx,y-3,2,4),hardware);
        bitmap.fillRect(new flash.geom.Rectangle(x+dx,y-1,1,1),0xff263039);
      }
      if(kind==='armor'){
        // Nine-pixel shield: original black keyline, blue plate and a small light reflection.
        for(let row=0;row<10;row++){
          const width=row<6?9:9-2*(row-5);
          if(width>0)bitmap.fillRect(new flash.geom.Rectangle(x+(9-width)/2,y+row,width,1),0xff13232e);
        }
        for(let row=1;row<9;row++){
          const width=row<6?7:7-2*(row-5);
          if(width>0)bitmap.fillRect(new flash.geom.Rectangle(x+(9-width)/2,y+row,width,1),0xff36adeb);
        }
        bitmap.fillRect(new flash.geom.Rectangle(x+2,y+2,2,3),0xffc6efff);
        bitmap.fillRect(new flash.geom.Rectangle(x+4,y+2,1,5),0xff7ed6ff);
      }else if(kind==='medical'){
        // White medical cross with a dark green keyline, legible at the original nine-pixel icon size.
        bitmap.fillRect(new flash.geom.Rectangle(x+2,y,5,9),0xff163f28);
        bitmap.fillRect(new flash.geom.Rectangle(x,y+2,9,5),0xff163f28);
        bitmap.fillRect(new flash.geom.Rectangle(x+3,y+1,3,7),0xfff4fff8);
        bitmap.fillRect(new flash.geom.Rectangle(x+1,y+3,7,3),0xfff4fff8);
      }else{
        // Two brass cartridges, using the same small black keyline as the original sprites.
        for(const dx of [0,5]){
          bitmap.fillRect(new flash.geom.Rectangle(x+dx,y+2,4,8),0xff111111);
          bitmap.fillRect(new flash.geom.Rectangle(x+dx+1,y,2,2),0xff111111);
          bitmap.fillRect(new flash.geom.Rectangle(x+dx+1,y+2,2,6),0xffe7bd5d);
          bitmap.fillRect(new flash.geom.Rectangle(x+dx+1,y+3,1,4),0xffffe6a3);
        }
      }
      marked.bmList=[{...frame,sBMD:bitmap}];marked.bmObject=marked.bmList[0];
      kinds.set(kind,marked);
    }
    this.mcDrawObject=marked.Clone();
    if(identity!==undefined)this.mSupplyId=identity;
    else this.SetDeleteCounter(CMain.mFPS*10);
  }
  override PickedUp():void{
    const player=this.mSupplyId?livingPicker(this.mCurrentCell,this.mSupplyKind):this.mCurrentCell.ContainsClassID('CThing_Creature_Player');
    if(this.mSupplyConsumed||!player||player.mLife<=0||player.mFlags&Thing.CThing.mFlag_DEAD)return;
    this.mSupplyConsumed=true;
    if(this.mSupplyId)applySupplyEffect(player,this.mSupplyKind);
    else if(this.mSupplyKind==='armor')refillArmor(player);else if(this.mSupplyKind==='ammo')refillAmmo(player);else player.mLife=player.mMaxLife;
    this.mWorld.mHud.AddMessage_Info(`P${player.mPlayerIndex+1}: ${this.mSupplyKind==='armor'?'Armor':this.mSupplyKind==='ammo'?'Ammo':'Health'} full!`);
    this.PlaySound(CSound.mSamples.Object_Pickup_wav);
    this.Delete();
  }
}
proto(CThing_Object_SupplyCrate,{_CLASSID_:'CThing_Object_SupplyCrate'});
registerGameClass('Thing.Object.CThing_Object_SupplyCrate',CThing_Object_SupplyCrate);
