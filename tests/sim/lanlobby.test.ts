// LAN lobby screen headless test (v0.1.4): the entry view renders discovery rows (full / in-game dimmed), the room
// view gates the host's START on player 2 being connected AND ready, the client toggles READY, and BACK TO MENU
// returns to the main menu. The transport itself is Electron-only and absent here - the bridge degrades to local
// state the test pokes directly.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { lanBridge, _resetBridgeForTests } from '../../src/game/local/Net/bridge.ts';
import { NetSession } from '../../src/game/local/Net/NetSession.ts';

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

  // v0.2.1: a wire 'start' arriving while the session still lives (the SECOND+ in-process game) is consumed by
  // NetSession directly - the bridge used to keep its stale phase (stuck 'setup' -> blank room after the game).
  const CFG: any = { difficulty: 0, gameSpeed: 1, devils: true, collisions: true, damage: true, gameAmount: 0, detail: true, charP1: 0, charP2: 0 };

  it('in-process second game: a wire start with a live session re-enters playing (was: bridge stuck at setup)', { timeout: 120000 }, () => {
    _resetBridgeForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
    const b = lanBridge();
    b.isHost = false;
    (b as any).onMessage({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: 1234, inputDelay: 1, wave: 1 });
    expect(g.waitRunning(3000)).toBe(true); // first game: the bridge created the session and launched
    expect(b.phase).toBe('playing');
    // The game ends and the host drives a fresh setup + start; the new start lands while the session lives.
    b.session!.markEnded();
    b.phase = 'setup';
    (b as any).onMessage({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: 4321, inputDelay: 1, wave: 7 });
    expect(g.waitRunning(3000)).toBe(true);
    expect(b.phase).toBe('playing'); // RED before v0.2.1: the bridge never learned about session-driven restarts
    expect((b as any).started).toBe(true);
    expect(g.snapshot().level).toBe(7);
    b.leaveLobby();
    _resetBridgeForTests();
  });

  it('host: a peer retry request drives the coordinated restart (no checkpoint -> fresh at the run-start wave)', { timeout: 120000 }, () => {
    _resetBridgeForTests();
    const g = createHeadlessGame({ mode: 'Single', room: 1, menuOnly: 'Main' });
    const b = lanBridge();
    b.isHost = true;
    b.session = new NetSession(0, { send: () => {} });
    b.session.startLocalGame({ mode: 'Coop', roomLink: 'ROOM_Single_0001', cfg: CFG, seed: 7, inputDelay: 1, wave: 4 }, g.main());
    expect(g.waitRunning(3000)).toBe(true);
    b.session.markEnded();
    b.phase = 'lobby';
    (b as any).onMessage({ t: 'retry' }); // the client pressed Debrief RETRY / the room strip
    expect(g.waitRunning(3000)).toBe(true); // the host rebuilt the world for the retry
    expect(b.phase).toBe('playing');
    expect(g.snapshot().level).toBe(4); // no checkpoint survived -> fresh run armed at the run-start wave
    b.leaveLobby();
    _resetBridgeForTests();
  });
});
