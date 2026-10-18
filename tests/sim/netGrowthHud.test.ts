import { expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';
import { GROWTH_HUD, growthLayout } from '../../src/game/local/Net/GrowthHud.ts';
import { copyGrowth } from '../../src/game/local/Net/Growth.ts';
import { captureWorldSnap, makeSnapCtx } from '../../src/game/local/Net/WorldSnap.ts';
import { simulationDigest } from '../../src/game/local/Net/StateDigest.ts';
import { World } from '../../src/game/packages.ts';

it('keeps balanced HUD geometry at standard, wide and tall logical stage widths',()=>{
  for(const width of [640,854,1100]){
    const g=growthLayout(width);
    expect(g.left).toBe(width-g.right-GROWTH_HUD.width);
    expect(g.center-(g.left+GROWTH_HUD.width)).toBeGreaterThanOrEqual(12);
    expect(g.right-(g.center+GROWTH_HUD.centerWidth)).toBeGreaterThanOrEqual(12);
    expect(g.bottom).toBe(50);
  }
});
it('renders only confirmed personal values, keeps head labels clear, and never changes gameplay',()=>{
  const game=createHeadlessGame({menuOnly:'Main'}),session=new NetSession(0,{send(){}});
  session.startLocalGame({mode:'Coop',roomLink:'ROOM_Single_0001',seed:4242,netcode:'rollback-v2',
    cfg:{progression:'personal-growth-v1',difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,
      gameAmount:0,detail:true,charP1:0,charP2:0}},game.main());
  expect(game.waitRunning(3000)).toBe(true);
  const w=game.world(),ctx=makeSnapCtx(w);
  session.confirmedGrowth=copyGrowth(w.mUpgrades.lanGrowth);
  session.confirmedGrowth.players[0]={score:12345,level:17,xp:3};
  session.confirmedGrowth.players[1]={score:999999999999999,level:125,xp:0};
  session.confirmedWave=103;
  const before=simulationDigest(captureWorldSnap(w,ctx,false));
  w.Draw(); w.Draw();
  const ui=w._LanGrowthHud;
  expect(ui._Player0._Score.text).toBe('000000012345');
  expect(ui._Player1._Score.text).toBe('999999999999999');
  expect(ui._Player0._Level.text).toBe('LV 17');
  expect(ui._Player1._Experience.text).toBe('MAX');
  expect(ui._Wave._Number.text).toBe('103');
  expect(World.CHud.mcScoreTotal._visible).toBe(false);
  const p=game.players()[0]; w.mHud.UpdatePlayer(p,{x:1,y:1});
  const head=w.mHud.mcPlayers[0];
  expect(head._PersonalLevel.text).toBe('LV 17');
  expect(head._y+head._PersonalLevel._y).toBeGreaterThanOrEqual(53);
  expect(head._PersonalLevel._y+17+3).toBeLessThanOrEqual(head.mcAmmo._y-7.95);
  expect(simulationDigest(captureWorldSnap(w,ctx,false))).toEqual(before);
  w.mHud.Pause(true);
  expect(ui._visible).toBe(false);
  expect(w.mHud.mcScreenPause._PersonalUpgrades._Player0.text).toContain('LV 17');
  w.mHud.Pause(false); expect(ui._visible).toBe(true);
  expect(game.errors).toEqual([]);
});
