import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {applyToWorld,capture,hasStored,SAVE_MEMBER} from '../../src/game/local/Resume.ts';
import {CSaveData} from '../../src/game/packages.ts';

const corruptions:[string,(s:any)=>void][]=[
 ['missing counters',s=>delete s.waveCounters],['null player',s=>s.players=[null]],
 ['missing weapons',s=>delete s.players[0].weapons],['nonfinite health',s=>s.players[0].life=NaN],
 ['bad growth',s=>s.growth.players=null],['bad features',s=>s.features={}],
 ['bad draft bonuses',s=>s.waveDraft.bonuses=[null,null]],['null object',s=>s.objects=[null]],
 ['bad variants',s=>s.variants.enemies=null],['bad warning list',s=>s.timedWave.warnings=null],
 ['bad weapon',s=>s.players[0].weapons.pistol=null],['bad binding slots',s=>s.weaponBindings={}],
 ['negative player position',s=>s.players[0].x=-1000],['huge finite player position',s=>s.players[0].y=1e300],
];
it.each(corruptions)('rejects corrupt v2 state before mutating a live world: %s',(_name,corrupt)=>{
 const g=createHeadlessGame(),w=g.world();try{
  const before=capture(w),bad=structuredClone(before);corrupt(bad);
  expect(()=>expect(applyToWorld(w,bad)).toBe(false)).not.toThrow();
  expect(capture(w)).toEqual(before);
 }finally{g.quit();}
});
it('does not advertise a truncated save as CONTINUE or discard unrelated settings',()=>{
 const g=createHeadlessGame();try{
  const data=CSaveData.mSharedObject.data;data.qaSetting='keep';data[SAVE_MEMBER]={version:2,players:[],objects:[],roomLibLink:'ROOM_Single_0001',wave:1};
  expect(hasStored()).toBe(false);expect(data[SAVE_MEMBER]).toBeUndefined();expect(data.qaSetting).toBe('keep');
 }finally{g.quit();}
});
