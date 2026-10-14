// Gameplay cursor hiding (deviation GAME_CURSOR_HIDE, v0.1.7): the original always shows the OS arrow, even
// mid-game; players asked for it to disappear during gameplay (keyboard / pad only) and come back for the
// pause menu and every non-world screen.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame, KEYS } from './harness.ts';
import { Mouse } from '../../src/engine/flash/input.ts';

describe('gameplay cursor (GAME_CURSOR_HIDE)', () => {
  it('hidden while the world runs, shown while paused, hidden again on resume, shown on the debrief', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1 });
    expect(g.state()).toBe('State_RunWorld');
    expect(Mouse._visible).toBe(false); // gameplay: no arrow

    // Pause: the arrow comes back for the pause menu.
    g.keyDown(KEYS.PAUSE);
    expect(g.stepUntil(() => g.world()?.mPaused === true, 20)).toBe(true);
    g.keyUp(KEYS.PAUSE);
    expect(Mouse._visible).toBe(true);

    // Unpause: hidden again for gameplay.
    g.keyDown(KEYS.PAUSE);
    expect(g.stepUntil(() => g.world()?.mPaused === false, 20)).toBe(true);
    g.keyUp(KEYS.PAUSE);
    expect(Mouse._visible).toBe(false);

    // Quit through the pause menu: the debrief keeps the arrow.
    g.quit();
    expect(g.stepUntil(() => g.state() === 'State_Debrief', 600)).toBe(true);
    expect(Mouse._visible).toBe(true);
    expect(g.errors).toEqual([]);
  });

  it('menus keep the cursor (nothing outside the world ever hides it)', { timeout: 60000 }, () => {
    const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
    expect(g.state()).toBe('State_Main');
    expect(Mouse._visible).toBe(true);
    expect(g.errors).toEqual([]);
  });
});
