// Optional v0.3.4 rules. Each capability keeps older negotiated simulations unchanged.
import {CMain,World} from '../packages.ts';
import {netSession} from './Net/NetSession.ts';
import {simplifiedWorld,SIMPLE_COMBAT_RULE} from './CombatRules.ts';
export const MODERN_FEATURES=['fragile-armor-v1','empty-weapons-v1','weapon-bindings-v1','enchant-durability-v1','native-bosses-v1','empty-weapon-feedback-v1','enchant-power-v1'] as const;
export type ModernFeature=typeof MODERN_FEATURES[number];
const classic=new WeakMap<object,Set<ModernFeature>>();
export function setClassicFeatureFixture(main:object,features:readonly ModernFeature[]):void{classic.set(main,new Set(features));}
export function availableFeatures():ModernFeature[]{
 const session=netSession();
 const features=MODERN_FEATURES.filter(f=>!classic.get(CMain._this)?.has(f)&&(!session||session.startOpts?.cfg.features?.includes(f)));
 return features.filter(f=>(!['weapon-bindings-v1','empty-weapon-feedback-v1'].includes(f)||features.includes('empty-weapons-v1'))&&(!['enchant-durability-v1','enchant-power-v1'].includes(f)||!session||session.startOpts?.cfg.enchantment==='persistent-enchantment-v1')&&(f!=='enchant-power-v1'||features.includes('enchant-durability-v1')));
}
export function hasFeature(world:any,feature:ModernFeature):boolean{return simplifiedWorld(world)&&!!world.mUpgrades.features?.includes(feature);}
export function installModernFeatures():void{
 const p=World.CUpgrades.prototype as any,init=p.InitLists;
 p.InitLists=function(this:any):any{const result=init.call(this);if(this.combat?.rule===SIMPLE_COMBAT_RULE){this.features=availableFeatures();if(this.features.includes('weapon-bindings-v1'))this.weaponBindings=[{},{}];}return result;};
}
