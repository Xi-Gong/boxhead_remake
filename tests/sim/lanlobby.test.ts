// LAN lobby screen headless test (v0.1.4): the entry view renders discovery rows (full / in-game dimmed), the room
// view gates the host's START on player 2 being connected AND ready, the client toggles READY, and BACK TO MENU
// returns to the main menu. The transport itself is Electron-only and absent here - the bridge degrades to local
// state the test pokes directly.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { lanBridge, _resetBridgeForTests } from '../../src/game/local/Net/bridge.ts';

describe('LAN lobby screen (v0.1.4)', () => {
  it('entry view: renders discovery rows, dims unjoinable rooms, hides the searching hint', { timeout: 60000 }, () => {
    _resetBridgeForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
    g.main().SetState('State_LanLobby');
    expect(g.waitScreen('State_LanLobby', 'Screen_LanLobby', 600)).toBe(true);
    const s: any = g.main().mcScreen;
    expect(s._CLASSID_).toBe('CScreen_LanLobby');

    const b = lanBridge();
    b.hosts = [
      { ip: '10.0.0.2', name: 'alpha-pc', app: 'x', status: 'lobby', players: 1, port: 47631 },
      { ip: '10.0.0.3', name: 'beta-pc', app: 'x', status: 'playing', players: 2, port: 47632 },
    ] as any;
    b.notify();
    g.step(4);
    const label = (row: any): string => row._Contents._Label.text;
    expect(label(s.hostRows[0])).toBe('alpha-pc · 1/2 · WAITING');
    expect(s.hostRows[0]._alpha).toBeCloseTo(100, 0);
    expect(label(s.hostRows[1])).toBe('beta-pc · 2/2 · IN GAME');
    expect(s.hostRows[1]._alpha).toBeCloseTo(45, 0); // full / in-game rooms are dimmed and refuse the click
    expect(s.hostRows[2]._Contents._Label.text).toBe('');
    expect(s.searchingText._visible).toBe(false); // rows exist -> no "searching" hint
    _resetBridgeForTests();
  });

  it('room view: START gated on player 2 connected AND ready; client READY toggle', { timeout: 60000 }, () => {
    _resetBridgeForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
    g.main().SetState('State_LanLobby');
    expect(g.waitScreen('State_LanLobby', 'Screen_LanLobby', 600)).toBe(true);
    const s: any = g.main().mcScreen;
    const b = lanBridge();

    // Hosting, nobody joined: waiting badge, no START yet.
    b.isHost = true;
    b.phase = 'hosting';
    b.notify();
    g.step(4);
    expect(s.p2Badge.text).toBe('WAITING');
    expect(s.startBtn._visible).toBe(false);

    // Player 2 connected but not ready: START dimmed + hint, red NOT READY badge.
    b.phase = 'lobby';
    b.peerName = 'gf-pc';
    b.ready = false;
    b.notify();
    g.step(4);
    expect(s.p2Badge.text).toBe('NOT READY');
    expect(s.startBtn._visible).toBe(true);
    expect(s.startBtn._alpha).toBeCloseTo(40, 0);
    expect(s.startHint._visible).toBe(true);

    // Ready: badge green, START bright, hint gone.
    b.ready = true;
    b.notify();
    g.step(4);
    expect(s.p2Badge.text).toBe('READY');
    expect(s.startBtn._alpha).toBeCloseTo(100, 0);
    expect(s.startHint._visible).toBe(false);

    // Client side: READY button toggles the bridge flag (the wire send is a no-op headless).
    b.isHost = false;
    b.notify();
    g.step(4);
    expect(s.readyBtn._visible).toBe(true);
    expect(s.startBtn._visible).toBe(false);
    s.readyBtn.onRelease.call(s.readyBtn);
    expect(b.ready).toBe(false); // was true -> toggled off
    _resetBridgeForTests();
  });

  it('BACK TO MENU leaves the lobby state', { timeout: 60000 }, () => {
    _resetBridgeForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
    g.main().SetState('State_LanLobby');
    expect(g.waitScreen('State_LanLobby', 'Screen_LanLobby', 600)).toBe(true);
    const s: any = g.main().mcScreen;
    s.bBack.onRelease.call(s.bBack);
    expect(g.waitScreen('State_Main', 'Screen_Main', 600)).toBe(true);
    expect(g.errors).toEqual([]);
    _resetBridgeForTests();
  });
});
