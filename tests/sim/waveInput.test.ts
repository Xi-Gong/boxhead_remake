import { expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { recordWaveReached } from '../../src/game/local/WaveUnlock.ts';
import { getSelectedStartWave } from '../../src/game/local/StartWave.ts';
it('invalid draft blocks local start and cycling without losing the previous valid wave',()=>{
 const g=createHeadlessGame({mode:'Coop',menuOnly:'Select',room:1});recordWaveReached(12);
 const s:any=g.main().mcScreen,f=s.mcStartWave.mcValue;
 f.text='0012';expect(s.waveInput.commit()).toBe(true);expect(getSelectedStartWave()).toBe(12);expect(f.text).toBe('12');
 f.text='12x';s.LoadLevel(0);expect(s.nState).not.toBe('State_LoadWorld');expect(getSelectedStartWave()).toBe(12);
 s.mcStartWave.bRight.onRelease();expect(getSelectedStartWave()).toBe(12);expect(f.text).toBe('12x');
 expect(s._WaveError._visible).toBe(true);s._WaveError._PanelCard._Close.onRelease();expect(f.text).toBe('12x');
 s.waveInput.cancel();expect(f.text).toBe('12');s.mcStartWave.bRight.onRelease();expect(getSelectedStartWave()).toBe(1);
 expect(g.errors).toEqual([]);
});
