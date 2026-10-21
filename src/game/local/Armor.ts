// DEVIL_SUPPLIES: changes are isolated from the mechanical ports; install before growth's fatal-hit observer.
import {flash,random} from '../../engine/runtime.ts';
import {Thing,World} from '../packages.ts';
import {netActive,netSession} from './Net/NetSession.ts';
import {crateDropPosition} from './WeaponCrate.ts';
import {SUPPLY_RULE,armorValue,armorMaximum,CThing_Object_SupplyCrate,devilSupply,suppliesEnabled,setSuppliesEnabled} from './Supplies.ts';
import { SURVIVAL_RULE, setSurvivalEnabled, syncVitals, survivalEnabled } from './SurvivalRules.ts';
import { localGrowthEnabled } from './LocalGrowth.ts';
import { installShieldResilience, protectEnemyHit } from './ShieldResilience.ts';
import { LOOT_RULE, SUPPLY_KINDS, simpleDevilSupply, modernLoot, setModernLoot, supplyIdentity } from './LootRules.ts';
import {simplifiedWorld} from './CombatRules.ts';
import { installSupplyDrops } from './SupplyDrops.ts';
import { REFILL_RULE, setReliableSupplies } from './ReliableSupplies.ts';
import {dropPriestSupplies} from './VariantLoot.ts';
import {hasFeature} from './ModernFeatures.ts';

const bars=new WeakMap<object,any>();
const fills=new WeakMap<object,any>();
export function installArmorScope():void{
  installShieldResilience();
  installSupplyDrops();
  const world=World.CWorld.prototype as any,ready=world.InitFinished,logKill=world.LogKill;
  world.InitFinished=function(this:any):any{
    setSuppliesEnabled(this,World.CWorld.mGameMode!=='DeathMatch'&&(!netActive()||netSession()?.startOpts?.cfg.supplies===SUPPLY_RULE));
    setSurvivalEnabled(this,World.CWorld.mGameMode!=='DeathMatch'&&(netActive()
      ? netSession()?.startOpts?.cfg.survival===SURVIVAL_RULE && suppliesEnabled(this) && netSession()?.startOpts?.cfg.progression==='personal-growth-v1'
      : localGrowthEnabled()));
    setModernLoot(this,survivalEnabled(this)&&(!netActive()||netSession()?.startOpts?.cfg.loot===LOOT_RULE));
    setReliableSupplies(this,modernLoot(this)&&(!netActive()||netSession()?.startOpts?.cfg.refill===REFILL_RULE));
    return ready.call(this);
  };
  world.LogKill=function(this:any,victim:any):any{
    if(!suppliesEnabled(this)||victim?._CLASSID_!=='CThing_Creature_Devil')return logKill.call(this,victim);
    if(victim.supplyDropLogged)return;
    victim.supplyDropLogged=true;
    const create=this._CreatePickup,own=Object.getOwnPropertyDescriptor(this,'_CreatePickup');
    this._CreatePickup=function(this:any,position:any):void{
      if(modernLoot(this)&&victim.mEnemyVariant==='priest'){dropPriestSupplies(this,position);return;}
      const modern=modernLoot(this),kind=simplifiedWorld(this)?simpleDevilSupply(random(100)):modern?SUPPLY_KINDS[random(3)]:devilSupply(random(100));
      if(!kind){create.call(this,position);return;}
      const at=crateDropPosition(this,position);
      if(at)this.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(at,kind,modern?supplyIdentity(this,'s'):undefined));
    };
    try{return logKill.call(this,victim);}
    finally{if(own)Object.defineProperty(this,'_CreatePickup',own);else delete this._CreatePickup;}
  };
  for(const ctor of [Thing.Affect.CThing_Affect,Thing.Affect.CThing_Affect_Bullet,Thing.Affect.CThing_Affect_Explosion,
    Thing.Affect.CThing_Affect_FireBall,Thing.Affect.CThing_Affect_ZombieAttack,Thing.Affect.CThing_Affect_DevilAttack]){
    const prototype=ctor.prototype as any,affect=prototype.AffectThing;
    prototype.AffectThing=function(this:any,victim:any):any{
      const before=victim.mLife,shield=armorValue(victim.mArmor,armorMaximum(victim));
      protectEnemyHit(victim,this,shield);
      const result=affect.call(this,victim);
      if(victim._CLASSID_==='CThing_Creature_Player'&&before>0&&shield>0&&suppliesEnabled(victim.mWorld)
        &&typeof result==='number'&&Number.isFinite(result)&&result>0){
        const absorbed=Math.min(shield,result);
        victim.mArmor=shield-absorbed;
        victim.mLife=before-(result-absorbed);
      }
      return result;
    };
  }
  const player=Thing.Creature.CThing_Creature_Player.prototype as any,respawn=player.State_Respawn;
  player.State_Respawn=function(this:any):any{
    const before=this.mLife,result=respawn.call(this);
    if(before<=0&&this.mLife>0&&suppliesEnabled(this.mWorld)){delete this.mArmor;syncVitals(this,'full');}
    return result;
  };
  const hud=World.CHud.prototype as any,update=hud.UpdatePlayer;
  hud.UpdatePlayer=function(this:any,p:any,...args:any[]):any{
    const result=update.call(this,p,...args);
    if(!suppliesEnabled(this.mWorld))return result;
    const head=this.mcPlayers[p.mPlayerIndex];if(!head)return result;
    const maximum=armorMaximum(p),amount=armorValue(p.mArmor,maximum);let bar=bars.get(head);
    if(hasFeature(this.mWorld,'fragile-armor-v1')){
      const session=netSession(),stats=session?.confirmedPlayerStats?.find(s=>s.index===p.mPlayerIndex);
      const confirmedMaximum=session?stats?.armorMaximum??1:maximum;
      const confirmedAmount=session?armorValue(stats?.armor,confirmedMaximum):amount;
      if(!bar){bar=head.createEmptyMovieClip('_ArmorBar',head.getNextHighestDepth());bars.set(head,bar);}
      head.mcLife._visible=true;bar._visible=confirmedAmount>0;
      if(confirmedAmount>0){
        const bounds=head.mcLife.getBounds(head),width=Math.max(16,bounds.xMax-bounds.xMin);
        bar._x=bounds.xMin;bar._y=bounds.yMax+2;
        const ratio=confirmedAmount/confirmedMaximum;
        if(bar._armorRatio!==ratio||bar._armorWidth!==width){
          bar.clear();bar.lineStyle(1,0x182c36,100);bar.beginFill(0x233640,100);
          bar.moveTo(0,0);bar.lineTo(width,0);bar.lineTo(width,3);bar.lineTo(0,3);bar.lineTo(0,0);bar.endFill();
          bar.lineStyle();bar.beginFill(0x36adeb,100);bar.moveTo(1,1);bar.lineTo(1+(width-2)*ratio,1);bar.lineTo(1+(width-2)*ratio,2);bar.lineTo(1,2);bar.lineTo(1,1);bar.endFill();
          bar._armorRatio=ratio;bar._armorWidth=width;
        }
      }
      return result;
    }
    if(amount>0&&!bar){
      bar=head.mcLife.duplicateMovieClip('_ArmorBar',head.getNextHighestDepth());
      bars.set(head,bar);
    }
    head.mcLife._visible=true;
    if(bar){
      bar._visible=amount>0;
      if(amount>0){
        bar.gotoAndStop(Math.floor(Math.min(bar._totalframes,Math.max(1,bar._totalframes*amount/maximum+1))));
        // Only armor's fill overlays health. Its duplicate background would dim/cover the exposed health.
        const background=bar.getInstanceAtDepth(1);if(background)background._visible=false;
        // Authored HUD.Player life clip: depth 1 outline/background, depth 2 mask, depth 3 fill.
        // Its fill swaps red/orange/green shapes across frames; tint only that shape so armor stays blue
        // at every ratio, while the original outline, mask, animation geometry and alpha are unchanged.
        const fill=bar.getInstanceAtDepth(3);
        if(fill&&fills.get(bar)!==fill){
          // A scripted colorTransform also takes ownership of timeline transforms in Flash.
          // Use a fill-only filter so authored frame scaling keeps tracking armor within each color band.
          fill.filters=[new flash.filters.ColorMatrixFilter([
            0,0,0,0,54, 0,0,0,0,173, 0,0,0,0,235, 0,0,0,1,0,
          ])];
          fills.set(bar,fill);
        }
      }
    }
    return result;
  };
}
