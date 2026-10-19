import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {noSpawn,placePlayer,pos,addZombie} from './fxkit.ts';
import {Thing,World} from '../../src/game/packages.ts';
import {canEnchant,enchantHeldWeapon,enchantedAmmo,ENCHANT_COLOR} from '../../src/game/local/EnchantmentRules.ts';
import {refillAmmo,CThing_Object_SupplyCrate} from '../../src/game/local/Supplies.ts';
import {redBoxReward} from '../../src/game/local/SupplyDrops.ts';
import {captureCratePayload,applyCratePayload} from '../../src/game/local/WeaponCrate.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {simulationDigest} from '../../src/game/local/Net/StateDigest.ts';
function boot(mode:'Single'|'Coop'='Single'){
 const g=createHeadlessGame({mode});noSpawn(g);const p=placePlayer(g,5.5,8.5);p.NewWeapon('uzi');p.SelectWeapon('uzi');return {g,p,w:g.world(),gun:p.mWeapon_Current};
}
function fire(p:any){p.mWeapon_Current.Fire(p.mPosition.Clone(),p.mAngle.Clone(),0);}
it('enchants only the held stock, consumes one per trigger, and leaves refills ordinary',()=>{
 const {g,p,gun}=boot();gun.mAmmo=3;expect(enchantHeldWeapon(p)).toBe(true);expect(canEnchant(p)).toBe(false);
 const damage=gun.mDamage;fire(p);expect([gun.mAmmo,gun.mEnchantedAmmo,gun.mDamage]).toEqual([2,2,damage]);
 expect(g.things().find(t=>t._CLASSID_==='CThing_Shot_Bullet').mDamage).toBeCloseTo(damage*1.35);
 refillAmmo(p);expect(enchantedAmmo(gun)).toBe(2);fire(p);fire(p);expect(enchantedAmmo(gun)).toBe(0);
 const before=new Set(g.things());fire(p);const normal=g.things().find(t=>!before.has(t)&&t._CLASSID_==='CThing_Shot_Bullet');expect(normal.mEnchanted).toBeUndefined();expect(normal.mDamage).toBe(damage);g.quit();
});
it('red weapon refills preserve enchanted stock and do not switch the held gun',()=>{
 const {g,p,gun}=boot();gun.mAmmo=7;enchantHeldWeapon(p);expect(redBoxReward(p,.5)).toBe(true);
 expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.mWeapon_Current.mEnchantedAmmo).toBe(7);expect(p.mWeapon_Current.mAmmo).toBe(p.mWeapon_Current.mTotalAmmo);g.quit();
});
it('shotgun enchants every pellet even when super.Fire consumes its last enchanted round first',()=>{
 const {g,p}=boot();p.NewWeapon('shotgun');p.SelectWeapon('shotgun');const gun=p.mWeapon_Current;gun.mAmmo=1;enchantHeldWeapon(p);fire(p);
 const shots=g.things().filter(t=>t._CLASSID_==='CThing_Shot_Bullet');expect(shots.length).toBeGreaterThanOrEqual(3);for(const s of shots){expect(s.mEnchanted).toBe(true);expect(s.mDamage).toBeCloseTo(gun.mDamage*1.35);}expect(gun.mEnchantedAmmo).toBe(0);g.quit();
});
it('pierces exactly two additional enemies, restores affect flags, and respects a wall',()=>{
 const {g,p,w}=boot();const foes=[6.5,7.5,8.5,9.5].map(x=>{const e=addZombie(g,x,8.5);e.Process_Init();e.Move(e.mPosition);e.Affect_Setup(Thing.Affect.CThing_Affect.mAffect_Bullet);return e;});
 enchantHeldWeapon(p);fire(p);const shot=g.things().find(t=>t._CLASSID_==='CThing_Shot_Bullet');const flags=foes.map(e=>e.mAffectFlags);shot.Process_Init();
 expect(foes.map(e=>e.mAffectors.length)).toEqual([1,1,1,0]);expect(foes.map(e=>e.mAffectFlags)).toEqual(flags);
 for(const e of foes)e.mAffectors=[];w.mMap.GetCell(7,8).mCollide|=World.Map.CMap_Cell.mCollide_Solid;fire(p);
 const next=g.things().filter(t=>t._CLASSID_==='CThing_Shot_Bullet').at(-1)!;next.Process_Init();expect(foes.map(e=>e.mAffectors.length)).toEqual([1,0,0,0]);g.quit();
});
it.each(['grenade','rocket','barrel','mine','chargepack'])('%s carries scaled damage and enchantment into its explosion without a second multiplier',name=>{
 const {g,p,w}=boot();p.NewWeapon(name);p.SelectWeapon(name);const gun=p.mWeapon_Current;enchantHeldWeapon(p);
 const before=new Set(g.things());fire(p);const t=g.things().find(t=>!before.has(t)&&(/CThing_Shot_(Grenade|Rocket)/.test(t._CLASSID_)||/CThing_Object_(Barrel|Mine|ChargePack)/.test(t._CLASSID_)));expect(t).toBeDefined();expect(t.mEnchanted).toBe(true);expect(t.mDamage).toBeCloseTo(gun.mDamage*1.35);
 if(t.mEffect)t.Process_Explode();
 else {t.Process_Init();if(name==='barrel'){t.mAffectors.push(new Thing.Affect.CThing_Affect_Bullet(p,p,1,p.mAngle));t.ProcessAffects();}else{t.mDetonateCounter=0;t.Process_Detonate();}}
 const explosion=g.things().find(t=>!before.has(t)&&t._CLASSID_==='CThing_Effect_Explosion');expect(explosion.mEnchanted).toBe(true);expect(explosion.mDamage).toBeCloseTo(gun.mDamage*1.35);
 expect(w.mUpgrades.lanGrowth).toBeDefined();g.quit();
});
it('cluster children inherit once, blasts retain 75% at the edge, and walls stop queued blast damage',()=>{
 const {g,p,w}=boot();const e:any=w.mThing_Collection.AddThing_Effect(new Thing.Effect.CThing_Effect_Explosion(pos(9.5,8.5),p.mAngle,p,135));e.mEnchanted=true;e.mClusterExplode=1;e.Process_Init();
 const children=g.things().filter(t=>t._CLASSID_==='CThing_Shot_ClusterShell');expect(children).toHaveLength(4);for(const c of children){expect(c.mDamage).toBe(135);expect(c.mEnchanted).toBe(true);}
 const victim=addZombie(g,11.5,8.5);victim.Process_Init();victim.Move(victim.mPosition);victim.mLife=1000;
 const affect=new Thing.Affect.CThing_Affect_Explosion(p,e,135,2.5);expect(affect.AffectThing(victim)).toBeCloseTo(135*.75);expect(victim.mLife).toBeCloseTo(1000-135*.75);
 w.mMap.GetCell(10,8).mCollide|=World.Map.CMap_Cell.mCollide_Solid;victim.mAffectors=[];victim.Affect(affect);expect(victim.mAffectors).toHaveLength(0);expect(affect.AffectThing(victim)).toBe(0);g.quit();
});
it('save/restore and rollback retain finite enchanted stock, purple crates and placed explosives',()=>{
 const {g,p,w,gun}=boot();gun.mAmmo=5;enchantHeldWeapon(p);p.NewWeapon('mine');p.SelectWeapon('mine');enchantHeldWeapon(p);fire(p);p.SelectWeapon('uzi');
 w.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(pos(12.5,8.5),'enchant','s900'));
 const snap=capture(w);expect(snap.objects.find(o=>o.classID==='CThing_Object_Mine')?.enchanted).toBe(true);expect(applyToWorld(w,JSON.parse(JSON.stringify(snap)))).toBe(true);expect(p.mWeapon_Current.mEnchantedAmmo).toBe(5);expect(g.things().some(t=>t._CLASSID_==='CThing_Object_Mine'&&t.Process&&t.mEnchanted)).toBe(true);
 const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs},digest=simulationDigest(data);fire(p);restoreWorldSnap(w,slot,ctx);expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(digest);expect(p.mWeapon_Current.mEnchantedAmmo).toBe(5);g.quit();
});
it('death crates transfer only their recorded enchanted stock and HUD color follows the held weapon',()=>{
 const {g,p,w,gun}=boot('Coop');gun.mAmmo=7;enchantHeldWeapon(p);const payload=captureCratePayload(p)!;const other=g.players()[1];applyCratePayload(other,payload);other.SelectWeapon('uzi');expect(other.mWeapon_Current.mEnchantedAmmo).toBe(7);
 w.mHud.UpdatePlayer(other,{x:300,y:200});expect(w.mHud.mcPlayers[1].mcAmmo.tfAmount.textColor).toBe(ENCHANT_COLOR);other.SelectWeapon('pistol');w.mHud.UpdatePlayer(other,{x:300,y:200});expect(w.mHud.mcPlayers[1].mcAmmo.tfAmount.textColor).not.toBe(ENCHANT_COLOR);g.quit();
});
it('infinite ammo is enchanted persistently, empty or dead players leave the purple crate for another picker',()=>{
 const {g,p,gun}=boot();gun.mAmmo=0;expect(enchantHeldWeapon(p)).toBe(false);p.SelectWeapon('pistol');expect(enchantHeldWeapon(p)).toBe(true);fire(p);expect(p.mWeapon_Current.mEnchantedAmmo).toBe(-1);p.mFlags|=Thing.CThing.mFlag_DEAD;expect(canEnchant(p)).toBe(false);g.quit();
});
it('does not consume a purple crate for a non-shooting fake wall',()=>{const {g,p}=boot();p.NewWeapon('fakewall');p.SelectWeapon('fakewall');expect(canEnchant(p)).toBe(false);expect(enchantHeldWeapon(p)).toBe(false);g.quit();});
it('does not confuse a finite capacity of 999999 with authored infinite ammo',()=>{
 const {g,p,gun}=boot();gun.mTotalAmmo=999999;gun.mAmmo=1;expect(enchantHeldWeapon(p)).toBe(true);expect(gun.mEnchantedAmmo).toBe(1);fire(p);expect([gun.mAmmo,gun.mEnchantedAmmo]).toEqual([0,0]);g.quit();
});
it('retains the railgun unlimited enemy piercing and lets P2 claim a crate P1 cannot use',()=>{
 const {g,p,w}=boot('Coop');p.NewWeapon('railgun');p.SelectWeapon('railgun');enchantHeldWeapon(p);
 const foes=[6.5,7.5,8.5,9.5].map(x=>{const e=addZombie(g,x,8.5);e.Process_Init();e.Move(e.mPosition);e.Affect_Setup(1);return e;});fire(p);g.things().find(t=>t._CLASSID_==='CThing_Shot_Railgun').Process_Init();expect(foes.every(e=>e.mAffectors.length===1)).toBe(true);
 const p2=placePlayer(g,5.5,8.5,0,1);p2.NewWeapon('uzi');p2.SelectWeapon('uzi');p2.mWeapon_Current.mAmmo=4;
 const crate=w.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(p.mPosition.Clone(),'enchant','s900'));crate.Process_Init();expect(crate.mSupplyConsumed).toBe(true);expect(p2.mWeapon_Current.mEnchantedAmmo).toBe(4);g.quit();
});
