import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {DrawPrimitive} from '../../src/game/packages.ts';
import {combatCollection} from '../../src/game/local/CombatRosterArt.ts';
import {demonCollection} from '../../src/game/local/DemonArt.ts';
import {gunnerCollection,ENEMY_GUNS} from '../../src/game/local/GunnerArt.ts';
it('builds wholly new visible body/head/limb/boot faces while preserving rig metadata and logical return timing',()=>{
 const g=createHeadlessGame(),DI=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
 const specs=[{prefix:'FreshCombat_runner',kind:'zombie',c:combatCollection('runner')},{prefix:'FreshCombat_brute',kind:'zombie',c:combatCollection('brute')},
  ...(['butcher','hunter']as const).flatMap(k=>[false,true].map(b=>({prefix:'FreshDemon_'+k+(b?'Boss':''),kind:'devil',c:demonCollection(k,b)}))),
  ...[0,1,2,3].map(s=>({prefix:'Gunner_'+s,kind:'gunner',c:gunnerCollection(s,'pistol')}))];
 let changedParts=0;
 for(const spec of specs){
  expect(spec.c.mItems.walk.mAnimationObject.mFrameCount).toBe(8);
  for(const [key,link]of Object.entries({stand:spec.kind==='zombie'?'Zombie_Zombie_Stand':'Player_Stand',walk:spec.kind==='zombie'?'Zombie_Zombie_Walk':'Player_Walk',attack:spec.kind==='devil'?'Devil_Devil_Attack':'Zombie_Zombie_Attack',shothit_1:'Player_HitRear',shothit_2:'Player_HitFront',dying:'Player_Dying',dead:'Player_Dead'})){
   const source=DI.mAnimationSets[link],fresh=DI.mAnimationSets[spec.prefix+'_'+key];expect(fresh.mFrameSequence).toEqual(source.mFrameSequence);
   for(let d=0;d<fresh.mDirections.length;d++)for(let f=0;f<fresh.mDirections[d].length;f++){
    const models=fresh.mDirections[d][f].Models,src=source.mDirections[d][f];
    for(const name of ['Body','Head','UpperArm_Left','UpperArm_Right','LowerArm_Left','LowerArm_Right','Hand_Left','Hand_Right','Foot_Left','Foot_Right']){
     const m=models[name];expect(m.Shape_vList.length).toBeGreaterThan(0);expect(m.Shape_Material.every((s:string)=>s.startsWith('Mesh'))).toBe(true);
     let native=src.Models[name].Empty?DI.mGroups[src.rPartner]?.[src.mAnimID]?.mDirections[d]?.[f]?.Models[name]:src.Models[name];
     const alternate=spec.prefix==='Gunner_0'||spec.prefix==='Gunner_2',group=spec.kind==='devil'?'Devil':alternate?'Player_Alternate1':spec.kind==='zombie'?'Zombie':undefined;
     if(group&&(name==='Head'||alternate&&name.startsWith('Foot')))native=DI.mGroups[group]?.[src.mAnimID]?.mDirections[d]?.[f]?.Models[name]??native;
     expect(m.Shape_vList).not.toEqual(native.Shape_vList);expect(m.XSIInfo).toEqual(native.XSIInfo);
     expect(m.Shape_vList.flat().every(Number.isFinite)).toBe(true);expect(m.Shape_vList.length).toBe(m.Shape_Material.length);expect(m.Shape_vList.length).toBe(m.Shape_Brightness.length);
     for(const points of m.Shape_vList){expect(points.length).toBeGreaterThanOrEqual(6);expect(Math.max(...points.map(Math.abs))).toBeLessThan(260);}changedParts++;
    }
   }
  }
 }
 expect(changedParts).toBeGreaterThan(10000);g.quit();
});
it('keeps player-gun muzzle metadata untouched for every fresh gunner skin and permitted gun',()=>{
 const g=createHeadlessGame(),DI=DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
 for(let skin=0;skin<4;skin++)for(const gun of ENEMY_GUNS){gunnerCollection(skin,gun);const link={pistol:'Handgun',uzi:'UZI',shotgun:'Shotgun'}[gun];
  for(const action of ['Stand','Walk']){
   const s=DI.mAnimationSets['Player_'+link+'_'+action],a=DI.mAnimationSets['Gunner_'+skin+'_'+gun+action.toLowerCase()];
   for(let d=0;d<s.mDirections.length;d++)for(let f=0;f<s.mDirections[d].length;f++)expect(a.mDirections[d][f].Models.GunPosition_Right.XSIInfo).toEqual(s.mDirections[d][f].Models.GunPosition_Right.XSIInfo);
  }
 }g.quit();
});
