import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {Thing} from '../../src/game/packages.ts';
import {noSpawn,placePlayer} from './fxkit.ts';
import {enchantHeldWeapon,enchantmentDamage,enchantedAmmo} from '../../src/game/local/EnchantmentRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';

it.each([false,true])('boosts actual shotgun volleys and near/mid/far hits once (enchanted=%s)',enchanted=>{
 const samples:any[]=[];
 for(const boost of [false,true]){
  const g=createHeadlessGame({classicFeatures:boost?[]:['shotgun-boost-v1']}),w=g.world();try{
   noSpawn(g);const p=placePlayer(g,8.5,8.5);p.NewWeapon('shotgun');p.SelectWeapon('shotgun');const gun=p.mWeapon_Current;
   const ordinary=gun.mDamage,ammo=gun.mAmmo;
   if(enchanted)expect(enchantHeldWeapon(p)).toBe(true);
   const endurance=enchantedAmmo(gun),before=new Set(g.things()),origin=p.mPosition.Clone();gun.Fire(origin,p.mAngle.Clone());
   const shots=g.things().filter(t=>!before.has(t)&&t._CLASSID_==='CThing_Shot_Bullet');expect(shots).toHaveLength(3);
   expect(gun.mAmmo).toBe(ammo-1);expect(enchantedAmmo(gun)).toBe(enchanted?endurance-1:0);expect(gun.mDamage).toBe(ordinary);
   const multiplier=enchanted?enchantmentDamage(w):1;
   for(const shot of shots){expect(shot.mCombatShotgun).toBe(true);expect(shot.mDamage).toBeCloseTo(ordinary*multiplier);expect(!!shot.mEnchanted).toBe(enchanted);}
   const damage=[];
   for(const fraction of [.2,.65,1]){
    const at=origin.Clone();at.mX+=gun.mRange*fraction;
    const victim:any=new Thing.Creature.CThing_Creature_Zombie(at.Clone());w.mThing_Collection.AddThing(victim);victim.Process_Init();victim.Move(at);victim.mLife=1000;
    const affect=new Thing.Affect.CThing_Affect_Bullet(p,shots[0],shots[0].mDamage,p.mAngle.Clone()),beforeLife=victim.mLife;
    const hit=affect.AffectThing(victim);expect(beforeLife-victim.mLife).toBeCloseTo(hit);expect(affect.mDamage).toBe(shots[0].mDamage);
    const falloff=fraction===.2?1:fraction===.65?(boost?.775:.725):(boost?.55:.45);
    expect(hit).toBeCloseTo(ordinary*multiplier*falloff);damage.push(hit);
   }
   samples.push({ordinary,damage,range:gun.mRange,cadence:gun.mFireRate,capacity:gun.mTotalAmmo,ammo:gun.mAmmo,
    angles:shots.map(s=>s.mAngle.__get__mAngle()),ranges:shots.map(s=>s.mPosition.Distance2D(s.mDestination))});
  }finally{g.quit();}
 }
 const [old,current]=samples;expect(current.ordinary).toBeCloseTo(old.ordinary*1.15);expect(current.damage[0]/old.damage[0]).toBeCloseTo(1.15);
 expect(current.damage[2]/old.damage[2]).toBeCloseTo(1.15*.55/.45);
 for(const key of ['range','cadence','capacity','ammo','angles','ranges'])expect(current[key]).toEqual(old[key]);
});

it('restores old stock and enchantment without refilling, and never compounds the base boost on reapply or reload',()=>{
 const old=createHeadlessGame({classicFeatures:['shotgun-boost-v1']});let save:any,damage=0;
 try{
  const w=old.world(),p=old.players()[0];w.mUpgrades.lanGrowth.players[0].level=55;p.NewWeapon('shotgun');p.SelectWeapon('shotgun');
  const gun=p.mWeapon_Current;enchantHeldWeapon(p);gun.mEnchantDurability=7;gun.mAmmo=6;p.mLife=89;p.mArmor=9;damage=gun.mDamage;save=capture(w);
 }finally{old.quit();}
 const g=createHeadlessGame();try{
  const w=g.world(),p=g.players()[0];expect(applyToWorld(w,save)).toBe(true);
  for(let load=0;load<3;load++){
   const gun=p.mWeapon_Current;expect(gun.mNameID).toBe('shotgun');expect(gun.mDamage).toBeCloseTo(damage*1.15);expect([gun.mAmmo,enchantedAmmo(gun),p.mLife,p.mArmor]).toEqual([6,7,89,9]);
   for(let n=0;n<3;n++)w.mUpgrades.ApplyUpgrade_Weapon(gun);
   expect(gun.mDamage).toBeCloseTo(damage*1.15);expect(gun.mAmmo).toBe(6);expect(applyToWorld(w,capture(w))).toBe(true);
  }
 }finally{g.quit();}
});
