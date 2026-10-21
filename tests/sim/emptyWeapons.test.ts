import {expect,it} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {noSpawn} from './fxkit.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';

it('selects unlocked zero-round weapons by cycle and number without granting ammo or emitting',()=>{
 const g=createHeadlessGame(),p=g.players()[0];try{
  noSpawn(g);p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=0;
  expect(p.NextWeapon().mNameID).toBe('uzi');p.SelectWeapon('uzi');expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.PrevWeapon().mNameID).toBe('pistol');
  const before=g.things().length;g.keyDown(KEYS.P1.FIRE);g.tick(3);g.keyUp(KEYS.P1.FIRE);
  expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.mWeapon_Current.mAmmo).toBe(0);expect(p.mWeapon_Current.mFire).toBe(false);expect(g.things().length).toBe(before);
  p.SelectWeapon('pistol');g.keyDown(50);g.tick(1);g.keyUp(50);g.tick(1);expect(p.mWeapon_Current.mNameID).toBe('uzi');
  const ammo=p.mWeapon_Current.mAmmo;p.SelectWeapon('rocket');expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.mWeapon_Current.mAmmo).toBe(ammo);
 }finally{g.quit();}
});
it('keeps an empty selected weapon through save reconstruction and resumes firing after legitimate refill',()=>{
 const g=createHeadlessGame(),p=g.players()[0],w=g.world();try{
  noSpawn(g);p.NewWeapon('uzi');p.mWeapons.uzi.mThing.mAmmo=0;p.SelectWeapon('uzi');
  expect(applyToWorld(w,capture(w))).toBe(true);expect(p.mWeapon_Current.mNameID).toBe('uzi');expect(p.mWeapon_Current.mAmmo).toBe(0);
  p.mWeapon_Current.mAmmo=2;g.keyDown(KEYS.P1.FIRE);g.tick(1);expect(p.mWeapon_Current.mAmmo).toBe(1);g.keyUp(KEYS.P1.FIRE);
 }finally{g.quit();}
});
it('retains empty-weapon rejection and automatic pistol fallback in the legacy capability fixture',()=>{
 const g=createHeadlessGame({classicFeatures:['empty-weapons-v1']}),p=g.players()[0];try{
  p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=0;g.tick(1);expect(p.mWeapon_Current.mNameID).toBe('pistol');
  p.SelectWeapon('uzi');expect(p.mWeapon_Current.mNameID).toBe('pistol');expect(p.NextWeapon()).toBeUndefined();
 }finally{g.quit();}
});
