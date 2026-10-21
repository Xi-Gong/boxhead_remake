import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {DrawPrimitive,Thing} from '../../src/game/packages.ts';
it('does not bake retired enemy families while loading a fresh v3 game',()=>{
 const g=createHeadlessGame();try{
  const names=Object.keys(DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mAnimationSets);
  expect(names.some(n=>n.startsWith('Variant_charger_'))).toBe(true);
  expect(names.some(n=>/^(FreshCombat_|FreshDemon_|Gunner_|Variant_priest_|Boss_priest_)/.test(n))).toBe(false);
 }finally{g.quit();}
});
it('still bakes the retained models during the old v2 loading path',()=>{
 const g=createHeadlessGame({classicSimplifiedCombat:true});try{
  Thing.Creature.CThing_Creature_Zombie.GetCollection();Thing.Creature.CThing_Creature_Devil.GetCollection();
  const names=Object.keys(DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.mAnimationSets);
  for(const prefix of ['FreshCombat_runner_','FreshDemon_butcher_','Gunner_0_','Variant_priest_'])expect(names.some(n=>n.startsWith(prefix)),prefix).toBe(true);
 }finally{g.quit();}
});
