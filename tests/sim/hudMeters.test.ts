import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {enchantHeldWeapon} from '../../src/game/local/EnchantmentRules.ts';
import {setBindingProgress} from '../../src/game/local/WeaponBindings.ts';
const overlap=(a:any,b:any)=>Math.min(a.xMax,b.xMax)>Math.max(a.xMin,b.xMin)&&Math.min(a.yMax,b.yMax)>Math.max(a.yMin,b.yMin);
it.each([160,79,3].flatMap(life=>[0,20].map(armor=>({life,armor}))))('keeps ammo, overlaid health/armor, durability and hold progress separate at $life HP / $armor armor',({life,armor})=>{
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0];try{
  p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=0;p.mLife=life;p.mArmor=armor;p.mVisible=true;
  expect(enchantHeldWeapon(p)).toBe(true);setBindingProgress(w,0,{button:'A',amount:.5,unbind:false});
  const h=w.mHud.mcPlayers[0],originalLifeY=h.mcLife._y;w.mHud.UpdatePlayer(p,{x:320,y:240});
  const boxes={ammo:h.mcAmmo.getBounds(h),life:h.mcLife.getBounds(h),enchant:h._EnchantBar.getBounds(h),progress:h._BindingProgress.getBounds(h),...(armor?{armor:h._ArmorBar.getBounds(h)}:{})};
  if(armor)expect(boxes.armor).toEqual(boxes.life);
  const entries=Object.entries(boxes).filter(([name])=>name!=='armor');for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)expect(overlap(entries[i]![1],entries[j]![1]),`${entries[i]![0]} overlaps ${entries[j]![0]}: ${JSON.stringify(boxes)}`).toBe(false);
  expect(boxes.enchant.yMin).toBeGreaterThan(boxes.ammo.yMax);expect(boxes.progress.yMax).toBeLessThan(boxes.ammo.yMin);expect(h.mcLife._y).toBe(originalLifeY);
  expect(boxes.enchant.xMax-boxes.enchant.xMin).toBeLessThanOrEqual(boxes.life.xMax-boxes.life.xMin);
  expect(boxes.enchant.yMax-boxes.enchant.yMin).toBeLessThanOrEqual((boxes.life.yMax-boxes.life.yMin)/2);
  expect(boxes.enchant.xMax-boxes.enchant.xMin).toBe(30);expect(boxes.enchant.yMax-boxes.enchant.yMin).toBe(3.5);
  expect(boxes.enchant.yMin-boxes.ammo.yMax).toBeCloseTo(.5);expect(boxes.life.yMin-boxes.enchant.yMax).toBeCloseTo(1);
 }finally{g.quit();}
});
it('restores the authored gun-name position without durability and never accumulates offsets',()=>{
 let originalY:number;const classic=createHeadlessGame({classicFeatures:['enchant-durability-v1']});try{originalY=classic.world().mHud.mcPlayers[0].mcAmmo._y;}finally{classic.quit();}
 const g=createHeadlessGame(),w=g.world(),p=g.players()[0],h=w.mHud.mcPlayers[0];try{
  const update=()=>w.mHud.UpdatePlayer(p,{x:320,y:240});update();expect(h.mcAmmo._y).toBe(originalY!);expect(h._EnchantBar._visible).toBe(false);
  p.NewWeapon('uzi');p.SelectWeapon('uzi');expect(enchantHeldWeapon(p)).toBe(true);update();const raisedY=h.mcAmmo._y;expect(raisedY).toBeLessThan(originalY!);
  for(let i=0;i<3;i++){update();expect(h.mcAmmo._y).toBe(raisedY);}
  p.SelectWeapon('pistol');update();expect(h.mcAmmo._y).toBe(originalY!);expect(h._EnchantBar._visible).toBe(false);
  p.SelectWeapon('uzi');update();expect(h.mcAmmo._y).toBe(raisedY);
  p.mWeapon_Current.mEnchantDurability=0;update();expect(h.mcAmmo._y).toBe(originalY!);expect(h._EnchantBar._visible).toBe(false);
 }finally{g.quit();}
});
