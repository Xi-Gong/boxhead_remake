import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {layoutMainMenu,menuTextItem} from '../../src/game/local/UiStyle.ts';
import {lanBridge} from '../../src/game/local/Net/bridge.ts';

it('all six main-menu hit bounds have twelve-pixel gaps and retain Contents hover registration',()=>{
 const g=createHeadlessGame({menuOnly:'Main'}),s=g.main().mcScreen;
 const items=[s.mcSinglePlay,s.mcCoopPlay,s.mcDeathPlay,s.mcInstructions,
  menuTextItem(s,'_TestContinue',320,0,'CONTINUE',30),menuTextItem(s,'_TestLan',320,0,'LAN GAME',30)];
 layoutMainMenu(s,items);const bounds=items.map(c=>c.getBounds(s));
 bounds.forEach((b,i)=>{expect(b.yMax-b.yMin).toBeCloseTo(24,1);if(i)expect(b.yMin-bounds[i-1].yMax).toBeGreaterThanOrEqual(11.9);});
 expect(bounds.at(-1)!.yMax).toBeLessThan(430);expect(items.slice(0,4).every(c=>c._Contents&&c.onRelease&&c.onRollOver)).toBe(true);g.quit();
});
it.each(['none','checkpoint','fresh'] as const)('lobby conditional recovery=%s has separated visible action hit areas',recovery=>{
 const g=createHeadlessGame({menuOnly:'Main'});g.main().SetState('State_LanLobby');
 expect(g.waitScreen('State_LanLobby','Screen_LanLobby')).toBe(true);
 const s=g.main().mcScreen,b=lanBridge();b.phase='lobby';b.isHost=true;b.peerName='guest';b.ready=false;
 b.session=recovery==='none'?null:{phase:'ended',startOpts:{},netCheckpoint:recovery==='checkpoint'?{}:undefined} as any;b.notify();g.step(4);
 const buttons=[...s.roomEls,s.bBack].filter(c=>c._visible&&c._Contents?._Label);
 const bounds=buttons.map(c=>c.getBounds(s.panel));
 for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
  const a=bounds[i],d=bounds[j],dx=Math.max(a.xMin,d.xMin)-Math.min(a.xMax,d.xMax),dy=Math.max(a.yMin,d.yMin)-Math.min(a.yMax,d.yMax);
  expect(Math.max(dx,dy),buttons[i]._Contents._Label.text+'/'+buttons[j]._Contents._Label.text).toBeGreaterThanOrEqual(12);
 }
 expect(s.settingsBtn._x).toBe(recovery==='none'?0:116);expect(s.resumeBtn._visible).toBe(recovery!=='none');
 if(recovery==='fresh')expect(s.resumeBtn._Contents._Label.text).toContain('RETRY AT WAVE');
 b.session=null;g.quit();
});
