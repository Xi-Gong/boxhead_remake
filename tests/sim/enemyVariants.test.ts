import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn,placePlayer,pos} from './fxkit.ts';
import {CMain,Thing,World,DrawPrimitive} from '../../src/game/packages.ts';
import {VARIANTS_RULE,variantsWorld,variantPercent,variantOrdinal,beginCharge,beginEmberCast,emberZones,processEmberZones} from '../../src/game/local/EnemyVariants.ts';
import {priestLootKind} from '../../src/game/local/VariantLoot.ts';
import {variantCollection} from '../../src/game/local/VariantArt.ts';
import {getRandomState,setRandomState,random} from '../../src/engine/flash/rng.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
function boot(mode:'Single'|'Coop'='Single'){const g=createHeadlessGame({mode});noSpawn(g);placePlayer(g,9.5,8.5,0);return g;}
function enemy(g:any,kind:'charger'|'priest',x=5.5,y=8.5){const C=kind==='charger'?Thing.Creature.CThing_Creature_Zombie:Thing.Creature.CThing_Creature_Devil,e:any=new C(pos(x,y));e.mEnemyVariant=kind;g.world().mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');return e;}
function supplies(g:any){return (Object.values(g.world().mThing_Collection.mThings)as any[]).filter(t=>t.mSupplyId&&t.Process);}
it('replaces deterministic original slots at the exact per-wave ratios',()=>{
 expect([7,8,12,68,1000].map(w=>variantPercent('charger',w))).toEqual([0,10,11,25,25]);
 expect([19,20,25,40,1000].map(w=>variantPercent('priest',w))).toEqual([0,20,25,40,40]);
 for(const kind of ['charger','priest']as const)for(const wave of [8,20,40,100])expect(Array.from({length:100},(_,n)=>variantOrdinal(kind,wave,n+1)).filter(Boolean)).toHaveLength(variantPercent(kind,wave));
 const g=boot(),w=g.world();w.mUpgrades.__set__mLevel(8);expect(variantsWorld(w)).toBe(true);
 const cap=w.mUpgrades.Level.Zombie_TotalCount;
 w.Spawn_ValidPosition=()=>({mPosition:pos(5.5,8.5)});const rng=getRandomState();
 for(let n=0;n<10;n++){expect(World.CWorld.prototype.Spawn_Zombie.call(w)).toBe(true);}
 expect(w.mUpgrades.enemyVariantState.zombie).toBe(10);expect(g.things().filter(t=>t.mEnemyVariant==='charger')).toHaveLength(1);expect(w.mUpgrades.Level.Zombie_TotalCount).toBe(cap);expect(getRandomState()).toBe(rng);
 w.Spawn_ValidPosition=()=>undefined;expect(World.CWorld.prototype.Spawn_Zombie.call(w)).toBe(false);expect(w.mUpgrades.enemyVariantState.zombie).toBe(10);g.quit();
});
it('respects active subtype caps and applies health/score once on the same family identity',()=>{
 const g=boot(),w=g.world();w.mUpgrades.__set__mLevel(8);for(let n=0;n<4;n++){const e=enemy(g,'charger');expect([e._CLASSID_,e.mLife,e.mScore]).toEqual(['CThing_Creature_Zombie',160,200]);}
 w.mUpgrades.enemyVariantState.zombie=9;expect(World.CWorld.prototype.Spawn_Zombie.call(w)).toBe(true);expect(g.things().filter(t=>t.mEnemyVariant==='charger')).toHaveLength(4);
 const priest=enemy(g,'priest',5.5,9.5);expect([priest._CLASSID_,priest.mLife,priest.mScore]).toEqual(['CThing_Creature_Devil',1200,1500]);w.mUpgrades.__set__mLevel(20);w.mUpgrades.enemyVariantState.devil=4;expect(World.CWorld.prototype.Spawn_Devil.call(w)).toBe(true);expect(g.things().filter(t=>t.mEnemyVariant==='priest')).toHaveLength(1);g.quit();
});
it.each([['charger',200,1],['priest',1500,5]]as const)('%s retains its family XP and variant score', (kind,score,xp)=>{
 const g=boot(),w=g.world(),e=enemy(g,kind);e.lanFatalSlot=0;w.LogKill(e);const s=w.mUpgrades.lanGrowth.players[0];expect(s.score).toBe(score);expect((s.level-1)*5+s.xp).toBe(xp);g.quit();
});
it('charges along a locked direction, hits once and finishes recovery/cooldown',()=>{
 const g=boot(),w=g.world(),e=enemy(g,'charger'),p=g.players()[0];p.mInvincible=0;p.mArmor=100;
 expect(beginCharge(e)).toBe(true);expect(e.mVariantPhase).toBe('warning');
 for(let n=0;n<Math.ceil(CMain.mFPS*.6);n++)e.State_VariantCharge();expect(e.mVariantPhase).toBe('charge');
 const x=e.mChargeX,y=e.mChargeY;p.Move(pos(8.5,8.5));
 for(let n=0;n<20&&e.mVariantPhase==='charge';n++){const before=e.mPosition.Clone();e.State_VariantCharge();expect(e.mPosition.Distance2D(before)).toBeLessThanOrEqual(.240001);}
 expect([e.mChargeX,e.mChargeY,e.mVariantPhase]).toEqual([x,y,'recovery']);expect(p.mAffectors).toHaveLength(1);p.ProcessAffects();expect(p.mArmor).toBe(25);
 for(let n=0;n<Math.ceil(CMain.mFPS*.8);n++)e.State_VariantCharge();expect(e.mStateID).toBe('State_GotoPlayer');expect(beginCharge(e)).toBe(false);expect(e.mVariantCooldown).toBe(w.mTick+Math.ceil(CMain.mFPS*6));g.quit();
});
it('interrupts charge on a hit and never crosses obstacles or the four-cell maximum',()=>{
 const g=boot(),e=enemy(g,'charger'),w=g.world();expect(beginCharge(e)).toBe(true);e.mDelta=pos(.1,0);e.SetState('State_BulletHit');expect(e.mStateID).toBe('State_BulletHit');expect(e.mVariantPhase).toBe('');
 e.mVariantCooldown=0;e.SetState('State_GotoPlayer');expect(beginCharge(e)).toBe(true);e.mVariantPhase='charge';w.mMap.GetCell(6,8).mCollide|=World.Map.CMap_Cell.mCollide_Solid;
 for(let n=0;n<10&&e.mVariantPhase==='charge';n++)e.State_VariantCharge();expect(e.mPosition.mX).toBeLessThan(6);expect(e.mVariantPhase).toBe('recovery');expect(e.mChargeDistance).toBeLessThanOrEqual(4);g.quit();
});
it('locks one fire mark per living player, waits .9 seconds, and pulses exactly four times',()=>{
 const g=boot('Coop'),w=g.world(),e=enemy(g,'priest'),p=g.players()[0];placePlayer(g,9.5,9.5,0,1);
 expect(beginEmberCast(e)).toBe(true);expect(emberZones(w)).toHaveLength(2);expect(beginEmberCast(e)).toBe(false);const z=emberZones(w)[0]!,origin=z.mPosition.Clone();
 p.Move(pos(10.5,8.5));expect(z.mPosition).toEqual(origin);p.Move(origin);p.mInvincible=0;p.mArmor=200;
 let hits=0;for(let n=0;n<z.warning+z.duration+1;n++){w.mTick=z.born+n;processEmberZones(w);hits+=p.mAffectors.length;p.ProcessAffects();}
 expect(hits).toBe(4);expect(p.mArmor).toBe(140);expect(emberZones(w)).toHaveLength(0);g.quit();
});
it('overlapping flames share a damage cycle, walls block damage, and owner death cancels warnings only',()=>{
 const g=boot(),w=g.world(),e=enemy(g,'priest'),p=g.players()[0];beginEmberCast(e);const z=emberZones(w)[0]!;
 w.mUpgrades.enemyVariantState.zones.push({...z,id:999,mPosition:z.mPosition.Clone()});w.mTick=z.born+z.warning;processEmberZones(w);expect(p.mAffectors).toHaveLength(1);p.mAffectors=[];
 w.mTick+=z.interval;w.mMap.GetCell(p.mPosition.mX,p.mPosition.mY).mCollide|=World.Map.CMap_Cell.mCollide_Solid;processEmberZones(w);expect(p.mAffectors).toHaveLength(0);
 w.mUpgrades.enemyVariantState.zones.push({...z,id:1000,born:w.mTick,mPosition:z.mPosition.Clone()});w.LogKill(e);expect(emberZones(w).map(z=>z.id)).toEqual([z.id,999]);w.mUpgrades.__set__mLevel(2);expect(emberZones(w)).toHaveLength(0);g.quit();
});
it('priest 30% purple / 70% equal-three-way boundaries preserve RNG and duplicate-kill guards',()=>{
 expect([0,29,30,99].map(priestLootKind)).toEqual(['enchant','enchant','supply','supply']);const g=boot(),w=g.world();const seen=new Set<string>();
 for(let seed=1;seed<=40;seed++){
  setRandomState(seed);const kind=priestLootKind(random(100))==='enchant'?'enchant':['armor','ammo','medical'][random(3)],after=getRandomState();setRandomState(seed);
  const victim={_CLASSID_:'CThing_Creature_Devil',mEnemyVariant:'priest',mPosition:pos(12.5,8.5),mScore:1500},before=new Set(supplies(g).map(t=>t.sUniqueID));
  w.LogKill(victim);const boxes=supplies(g).filter(t=>!before.has(t.sUniqueID));expect(boxes.map(t=>t.mSupplyKind)).toEqual([kind]);expect(getRandomState()).toBe(after);w.LogKill(victim);expect(getRandomState()).toBe(after);
  expect(new Set(boxes.map(t=>t.mSupplyId)).size).toBe(1);seen.add(kind!);for(const b of boxes)b.Delete();
 }expect([...seen].sort()).toEqual(['ammo','armor','enchant','medical']);g.quit();
});
it('charger 50% rolls merge with combo guarantees, keep kill-red lifetime and never repeat',()=>{
 const g=boot(),w=g.world();let extra=0,none=0;
 for(let seed=1;seed<=30;seed++)for(const guaranteed of [false,true]){
  w.mUpgrades.mMultipleKillsIndex=guaranteed?4:0;setRandomState(seed);const drop=random(100)<50,end=getRandomState();setRandomState(seed);
  const before=new Set(g.things().map(t=>t.sUniqueID)),z={_CLASSID_:'CThing_Creature_Zombie',mEnemyVariant:'charger',mPosition:pos(12.5,8.5),mScore:200};w.LogKill(z);
  const added=g.things().filter(t=>!before.has(t.sUniqueID)&&t._CLASSID_==='CThing_Object_Pickup');expect(added).toHaveLength(drop||guaranteed?1:0);expect(getRandomState()).toBe(end);
  for(const b of added){expect(b.mDeleteCounter).toBe(CMain.mFPS*10);b.Delete();}w.LogKill(z);expect(getRandomState()).toBe(end);drop?extra++:none++;
 }expect(extra).toBeGreaterThan(0);expect(none).toBeGreaterThan(0);g.quit();
});
it('keeps the purple crate independent in a one-cell alcove and across save/restore',()=>{
 const g=boot(),w=g.world(),p=placePlayer(g,12.5,8.5,0);p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=7;
 for(const row of w.mMap.mCells)for(const cell of row)if(cell!==w.mMap.GetCell(12,8))cell.mCollide|=World.Map.CMap_Cell.mCollide_Solid;
 let selected=0;for(let seed=1;seed<10000;seed++){setRandomState(seed);if(random(100)<30){selected=seed;break;}}expect(selected).toBeGreaterThan(0);setRandomState(selected);
 w.LogKill({_CLASSID_:'CThing_Creature_Devil',mEnemyVariant:'priest',mPosition:p.mPosition.Clone(),mScore:1500});expect(supplies(g)).toHaveLength(1);
 const snap=capture(w);expect(applyToWorld(w,snap)).toBe(true);const restored=supplies(g);expect(restored).toHaveLength(1);restored[0].Process_Init();
 expect(restored[0].Process).toBeUndefined();expect(p.mWeapon_Current.mEnchantedAmmo).toBe(7);expect(p.mWeapon_Current.mAmmo).toBe(7);g.quit();
});
it.each(['warning','charge','recovery'])('restores %s skill phase, identities and ordinals across save and rollback',phase=>{
 const g=boot(),w=g.world(),charger=enemy(g,'charger'),priest=enemy(g,'priest',5.5,9.5);beginCharge(charger);beginEmberCast(priest);
 charger.mVariantPhase=phase;charger.mVariantTicks=5;charger.mChargeDistance=1.25;
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs},digest=simulationDigest(data);
 charger.State_VariantCharge();w.mTick+=4;processEmberZones(w);restoreWorldSnap(w,slot,ctx);expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);
 const snap=capture(w);expect(snap.variants?.rule).toBe(VARIANTS_RULE);expect(applyToWorld(w,JSON.parse(JSON.stringify(snap)))).toBe(true);
 const restored=g.things().filter(t=>t.mEnemyVariant&&t.Process);expect(restored).toHaveLength(2);expect(restored.find(t=>t.mEnemyVariant==='charger').mVariantPhase).toBe(phase);expect(restored.find(t=>t.mEnemyVariant==='charger').mChargeDistance).toBe(1.25);expect(emberZones(w)).toHaveLength(1);
 expect(emberZones(w)[0]!.caster).toBe(restored.find(t=>t.mEnemyVariant==='priest').sUniqueID);expect(g.errors).toEqual([]);g.quit();
});
it('does not retarget a four-cell charge, and rejects absent or out-of-range targets',()=>{
 const g=boot(),w=g.world(),p=g.players()[0],e=enemy(g,'charger');expect(beginCharge(e)).toBe(true);p.Move(pos(14.5,8.5));
 for(let n=0;n<100&&e.mVariantPhase!=='recovery';n++)e.State_VariantCharge();expect(e.mChargeDistance).toBeCloseTo(4,8);expect(e.mChargeY).toBe(0);
 e.mVariantCooldown=0;expect(beginCharge(e)).toBe(true);p.mLife=0;e.SetState('State_GotoPlayer');e.mVariantCooldown=0;expect(beginCharge(e)).toBe(false);
 p.mLife=100;const d=enemy(g,'priest',2.5,2.5);expect(beginEmberCast(d)).toBe(false);expect(emberZones(w)).toHaveLength(0);g.quit();
});
it('keeps a burning zone after owner death/save and routes unshielded lethal damage through normal death',()=>{
 const g=boot(),w=g.world(),p=g.players()[0],e=enemy(g,'priest');beginEmberCast(e);const z=emberZones(w)[0]!;w.mTick=z.born+z.warning;z.lastPulse=0;w.LogKill(e);
 const snap=capture(w);expect(snap.variants!.enemies).toHaveLength(0);expect(applyToWorld(w,JSON.parse(JSON.stringify(snap)))).toBe(true);expect(emberZones(w)).toHaveLength(1);
 p.mLife=1;p.mArmor=0;p.mInvincible=0;w.mTick+=z.interval;processEmberZones(w);p.ProcessAffects();expect(p.mLife).toBeLessThanOrEqual(0);p.CheckForDead();expect(p.mStateID).toBe('State_Dying');g.quit();
});
it('bakes independent collections for every original direction/action without modifying source geometry',()=>{
 const g=boot(),X=DrawPrimitive.XSI,sets=X.CDrawPrimitive_XSI_DI.mAnimationSets,base=sets.Zombie_Zombie_Stand,source=JSON.stringify(base.mDirections);
 for(const kind of ['charger','priest']as const){const c=variantCollection(kind);for(const key of ['stand','walk','attack','shothit_1','shothit_2','dying','dead','warning','charge','cast','recovery']){const a=c.mItems[key].mAnimationObject;expect(a.mDirections.length).toBe(['dying','dead'].includes(key)?4:['stand','recovery'].includes(key)||(key==='warning'&&kind==='charger')?16:8);for(const d of a.mDirections)for(const f of d.mFrames)expect(f.sBMD).toBeDefined();}}
 expect(JSON.stringify(base.mDirections)).toBe(source);g.quit();
});
