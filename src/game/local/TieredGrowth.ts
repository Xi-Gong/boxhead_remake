import {CMain} from '../packages.ts';
import {netSession} from './Net/NetSession.ts';
import {endlessConfigured} from './Endless.ts';
import {TIERED_GROWTH_RULE} from './TieredGrowthRules.ts';
const classic=new WeakSet<object>();
export function setClassicTieredGrowthFixture(main:object):void{classic.add(main);}
export function tieredGrowthConfigured():boolean {
  const s=netSession();return endlessConfigured()&&(s?s.startOpts?.cfg.tieredGrowth===TIERED_GROWTH_RULE:!classic.has(CMain._this));
}
/** Existing saved growth keeps its own curve/rewards until a new run; fresh worlds use negotiated rules. */
export function tieredGrowthWorld(world:any):boolean {
  const state=world?.mUpgrades?.lanGrowth;
  return state?state.players[0]?.tiered===TIERED_GROWTH_RULE:tieredGrowthConfigured();
}
