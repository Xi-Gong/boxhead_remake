// LAN net setup screen headless test (v0.1.4 L4): the host screen attaches the ORIGINAL SubScreen art (both
// character cards + the 18-level selector) and its arrows drive the shared selection through bridge.setSel; the
// client copy renders the same selection read-only behind a WAITING FOR HOST banner; leaving the setup phase falls
// back to the lobby screen. The transport is Electron-only and absent headless - the bridge is local state.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { lanBridge, _resetBridgeForTests } from '../../src/game/local/Net/bridge.ts';

const SEL = { mode: 'Coop' as const, charP1: 3, charP2: 1, levelIdx: 7, difficulty: 2, gameAmount: 1, wave: 1 };

function openSetup(isHost: boolean): { g: ReturnType<typeof createHeadlessGame>; b: ReturnType<typeof lanBridge>; s: any } {
  _resetBridgeForTests();
  const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
  const b = lanBridge();
  b.isHost = isHost;
  b.phase = 'setup';
  b.sel = { ...SEL };
  g.main().SetState('State_LanSetup');
  if (!g.waitScreen('State_LanSetup', 'Screen_LanSetup', 600)) {
    throw new Error(`no setup screen (${g.state()}, ${g.errors[0] ?? ''})`);
  }
  return { g, b, s: g.main().mcScreen as any };
}

describe('LAN net setup screen (v0.1.4)', () => {
  it('host: original cards + level selector, arrows drive the shared selection', { timeout: 60000 }, () => {
    const { g, b, s } = openSetup(true);
    expect(s.mcSubScreen.mcPlayer1_Character).toBeDefined();
    expect(s.mcSubScreen.mcPlayer2_Character).toBeDefined();
    const icons = s.mcSubScreen.mcLevel_Selection.mcLevelIcons;
    expect(icons._currentframe).toBe(SEL.levelIdx + 1); // 1-based preview frames
    expect(s.mcSubScreen.mcPlayer2_Character.mcCharacter._currentframe).toBe(SEL.charP2 + 1);
    expect(s.bFrags._visible).toBe(false); // coop hides the frags plate
    expect(s.bStart._visible).toBe(true);
    expect(s.waitText._visible).toBe(false);

    // START_WAVE_SELECTOR (v0.1.9): coop shows the wave plate in the frags slot; it cycles sel.wave within
    // sel.maxWave (absent = uncapped, the legacy-peer tolerance; v0.2.4 caps it at the HOST's best).
    expect(s.bWave._visible).toBe(true);
    expect(s.bWaveLabel._visible).toBe(true);
    expect(s.bWave._Contents._Label.text).toBe('WAVE 1');
    s.bWave.onRelease.call(s.bWave);
    g.step(4);
    expect(b.sel.wave).toBe(2);
    expect(s.bWave._Contents._Label.text).toBe('WAVE 2');

    // bRight on the P2 card cycles charP2 and the preview frame (through bridge.setSel).
    const p2right = s.mcSubScreen.mcPlayer2_Character.bRight;
    p2right.onRelease.call(p2right);
    g.step(4);
    expect(b.sel.charP2).toBe((SEL.charP2 + 1) % 4);
    expect(s.mcSubScreen.mcPlayer2_Character.mcCharacter._currentframe).toBe(b.sel.charP2 + 1);

    // The level selector cycles levelIdx.
    const lright = s.mcSubScreen.mcLevel_Selection.bRight;
    lright.onRelease.call(lright);
    g.step(4);
    expect(b.sel.levelIdx).toBe((SEL.levelIdx + 1) % 18);
    expect(icons._currentframe).toBe(b.sel.levelIdx + 1);

    // Mode switch re-attaches SubScreen_DeathMatch and shows the frags plate (the wave plate swaps out).
    s.bMode.onRelease.call(s.bMode);
    g.step(4);
    expect(b.sel.mode).toBe('DeathMatch');
    expect(s.bFrags._visible).toBe(true);
    expect(s.bWave._visible).toBe(false);
    expect(s.bWaveLabel._visible).toBe(false);
    expect(s.bDiff._Contents._Label.text).toBe('EXPERT');
    expect(g.errors).toEqual([]);
    _resetBridgeForTests();
  });

  it('every setup widget stays attached - the SubScreen must not evict the difficulty plate (v0.2.2 depth-10 regression)', { timeout: 60000 }, () => {
    const { g, s } = openSetup(true);
    // v0.2.2 gave the widgets getNextHighestDepth() allocation, so bDiff landed exactly on the SubScreen's
    // fixed depth 10 and the later attachMovie evicted it (label survived, value plate vanished).
    for (const w of [s.bMode, s.bDiff, s.bFrags, s.bWave, s.bStart, s.bBack, s.bLeave]) {
      expect(w.$removed).toBe(false);
      expect(s.widgets.$list).toContain(w);
      expect(w._parent).toBe(s.widgets);
    }
    // Widgets render ABOVE the attached original art (depth order), so the value plates are visible.
    expect(s.widgets.$depth).toBeGreaterThan(s.mcSubScreen.$depth);
    expect(s.bDiff._Contents._Label.text).toBe('EXPERT');

    // A mode switch re-attaches the SubScreen - the widgets must survive that too.
    s.bMode.onRelease.call(s.bMode);
    g.step(4);
    expect(s.bDiff.$removed).toBe(false);
    expect(s.widgets.$list).toContain(s.bDiff);
    expect(g.errors).toEqual([]);
    _resetBridgeForTests();
  });

  it('wave plate wraps within the HOST best (SetupSelection.maxWave, v0.2.4) and shows BEST on both sides', { timeout: 60000 }, () => {
    const { g, b, s } = openSetup(true);
    b.sel = { ...b.sel, wave: 1, maxWave: 3 };
    b.notify();
    g.step(4);
    expect(s.bBest._visible).toBe(true);
    expect(s.bBest.text).toBe('BEST 3');
    s.bWave.onRelease.call(s.bWave);
    g.step(4);
    expect(b.sel.wave).toBe(2);
    s.bWave.onRelease.call(s.bWave);
    g.step(4);
    expect(b.sel.wave).toBe(3); // at the host's cap
    s.bWave.onRelease.call(s.bWave);
    g.step(4);
    expect(b.sel.wave).toBe(1); // wraps within 1..3, never beyond the cap

    // The client mirror renders the SAME host cap copy next to its dimmed plate.
    const cl = openSetup(false);
    cl.b.sel = { ...cl.b.sel, wave: 2, maxWave: 3 };
    cl.b.notify();
    cl.g.step(4);
    expect(cl.s.bBest.text).toBe('BEST 3');
    expect(cl.s.bWave._Contents._Label.text).toBe('WAVE 2');
    expect(g.errors).toEqual([]);
    expect(cl.g.errors).toEqual([]);
    _resetBridgeForTests();
  });

  it('client: read-only mirror with WAITING banner, no host handlers', { timeout: 60000 }, () => {
    const { g, s } = openSetup(false);
    expect(s.waitText._visible).toBe(true);
    expect(s.bStart._visible).toBe(false);
    expect(s.bLeave._visible).toBe(true);
    const right = s.mcSubScreen.mcPlayer1_Character.bRight;
    expect(right.onRelease).toBeUndefined(); // the arrows are not ours to press
    expect(s.bWave._visible).toBe(true); // coop mirror shows the wave plate, dimmed like every host control
    expect(s.bWave._alpha).toBeCloseTo(55, 0); // engine alpha quantises to 256 steps (55 -> 54.6875)
    // The mirrored selection still renders: preview frames follow sel.
    expect(s.mcSubScreen.mcPlayer1_Character.mcCharacter._currentframe).toBe(SEL.charP1 + 1);
    expect(s.mcSubScreen.mcLevel_Selection.mcLevelIcons._currentframe).toBe(SEL.levelIdx + 1);
    expect(g.errors).toEqual([]);
    _resetBridgeForTests();
  });

  it('leaving the setup phase falls back to the lobby screen', { timeout: 60000 }, () => {
    const { g, b } = openSetup(true);
    b.phase = 'lobby';
    b.notify();
    g.step(4);
    expect(g.waitScreen('State_LanLobby', 'Screen_LanLobby', 600)).toBe(true);
    expect(g.errors).toEqual([]);
    _resetBridgeForTests();
  });
});
