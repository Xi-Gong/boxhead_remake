import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {noSpawn,placePlayer,recordSounds} from './fxkit.ts';
import {enchantHeldWeapon,enchantedAmmo} from '../../src/game/local/EnchantmentRules.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
const trigger={IsPressed:()=>true,IsReleased:()=>true,IsDown:()=>true,mTimeDown:0,mTimePressed:0};
for(const name of ['uzi','shotgun','railgun','rocket','grenade','barrel','mine','chargepack','fakewall'])it(`${name}: returns after the last successful emission, but an empty reselection stays held`,()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  noSpawn(g);placePlayer(g,5.5,8.5);p.NewWeapon(name);p.SelectWeapon(name);const gun=p.mWeapon_Current;gun.mAmmo=1;
  if(name!=='fakewall')enchantHeldWeapon(p);const durability=enchantedAmmo(gun);gun.Update(trigger);
  expect(gun.mAmmo).toBe(0);expect(p.mWeapon_Current.mNameID).toBe('pistol');if(name!=='fakewall')expect(enchantedAmmo(gun)).toBe(durability-1);
  p.SelectWeapon(name);expect(p.mWeapon_Current).toBe(gun);
  if(name==='chargepack'){
   expect(gun.mDetonate).toBeTruthy();gun.Update(trigger);expect(p.mWeapon_Current.mNameID).toBe('pistol');expect(g.things().some(t=>t._CLASSID_==='CThing_Object_ChargePack'&&t.mDetonate)).toBe(true);
  }else{gun.Update(trigger);expect(p.mWeapon_Current).toBe(gun);expect(gun.mAmmo).toBe(0);expect(gun.mFire).toBe(false);}
 }finally{g.quit();}
});
it('warns on empty firing with bounded repeats, never grants ammo/emits, and survives a selected-empty save',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  noSpawn(g);p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=0;p.SelectWeapon('uzi');const sounds=recordSounds(g),before=g.things().length;
  g.keyDown(KEYS.P1.FIRE);g.tick(1);expect(sounds.filter(s=>s.name==='Click')).toHaveLength(1);g.tick(5);expect(sounds.filter(s=>s.name==='Click')).toHaveLength(1);g.tick(15);expect(sounds.filter(s=>s.name==='Click').length).toBeLessThanOrEqual(3);
  expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.mWeapon_Current.mAmmo).toBe(0);expect(g.things().length).toBe(before);g.keyUp(KEYS.P1.FIRE);g.tick(1);
  const count=sounds.filter(s=>s.name==='Click').length;g.keyDown(KEYS.P1.FIRE);g.tick(1);expect(sounds.filter(s=>s.name==='Click')).toHaveLength(count+1);g.keyUp(KEYS.P1.FIRE);g.tick(1);
  expect(applyToWorld(w,capture(w))).toBe(true);expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.mWeapon_Current.mAmmo).toBe(0);
 }finally{g.quit();}
});
it('does not switch on a failed placement, and preserves v0.3.4 empty handling without the new negotiated capability',()=>{
 const g=createHeadlessGame(),p=g.players()[0];try{
  noSpawn(g);placePlayer(g,5.5,8.5);p.NewWeapon('barrel');p.SelectWeapon('barrel');p.mWeapon_Current.mAmmo=1;const target=p.GetWeaponPosition();g.world().mMap.GetCell(target.mX,target.mY).mChildCount=2;p.mWeapon_Current.Update(trigger);expect(p.mWeapon_Current.mNameID).toBe('barrel');expect(p.mWeapon_Current.mAmmo).toBe(1);
 }finally{g.quit();}
 const old=createHeadlessGame({classicFeatures:['empty-weapon-feedback-v1']}),q=old.players()[0];try{
  noSpawn(old);q.NewWeapon('uzi');q.SelectWeapon('uzi');q.mWeapon_Current.mAmmo=1;q.mWeapon_Current.Update(trigger);expect(q.mWeapon_Current.mAmmo).toBe(0);expect(q.mWeapon_Current.mNameID).toBe('uzi');const sounds=recordSounds(old);q.mWeapon_Current.Update(trigger);expect(sounds.filter(s=>s.name==='Click')).toHaveLength(0);
 }finally{old.quit();}
});
