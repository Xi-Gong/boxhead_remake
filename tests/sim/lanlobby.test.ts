// LAN lobby screen headless test (v0.1.3 L2): the screen builds, refreshes from the bridge state and returns to
// the main menu (the transport itself is Electron-only and absent here - the bridge degrades to local state).
import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { lanBridge, _resetBridgeForTests } from '../../src/game/local/Net/bridge.ts';

describe('LAN lobby screen', () => {
  it('shows through State_LanLobby, tracks bridge state and returns to the main menu', { timeout: 60000 }, () => {
    _resetBridgeForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
    // Headless (no Electron): the LAN GAME menu entry is hidden.
    expect(g.main().mcScreen.mcLanGame).toBeUndefined();

    const b = lanBridge();
    g.main().SetState('State_LanLobby');
    expect(g.waitScreen('State_LanLobby', 'Screen_LanLobby', 600)).toBe(true);
    const s = g.main().mcScreen;
    expect(s._CLASSID_).toBe('CScreen_LanLobby');
    // Bridge state changes propagate into the screen on the next frame (dirty flag).
    b.pushCfg({ mode: 'DeathMatch', roomIdx: 8, difficulty: 3, killsIdx: 2 });
    g.step(4);
    expect(s.bMode._Contents._Label.text).toBe('DEATHMATCH');
    expect(s.bDiff._Contents._Label.text).toBe('NIGHTMARE');
    expect(s.bRoom._Contents._Label.text).toBe('ROOM 9');
    expect(s.bFrags._Contents._Label.text).toBe('20');

    // BACK TO MENU leaves the lobby state.
    s.bBack.onRelease.call(s.bBack);
    expect(g.waitScreen('State_Main', 'Screen_Main', 600)).toBe(true);
    expect(g.errors).toEqual([]);
    _resetBridgeForTests();
  });
});
