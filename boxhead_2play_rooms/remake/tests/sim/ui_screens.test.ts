// Lane X1: boot / intro / screen-system timing and the visual-state logic of the menus (headless real game, virtual
// 50 Hz clock): root loading screen (>= 0.5 s bar, 2 s pause, cover fade 2 % per 1/30 s), the intro logo in real time
// with its two timeline sounds, the 10-tick cross-fade of CScreen_Transition, the main menu roll-over, the controls
// window's INVALID KEY! fade (500..1000 ms) and the local instructions page reflecting the CURRENT key bindings.
import { describe, expect, it } from 'vitest';
import { createHeadlessGame } from './harness.ts';
import { clock } from '../../src/engine/flash/clock.ts';
import { _root, setTimelineSoundHandler } from '../../src/engine/swf/Player.ts';
import { playTimelineSound } from '../../src/engine/platform/AudioEngine.ts';
import { CMain, Screen } from '../../src/game/packages.ts';

const release = (mc: any): void => { mc.onRelease.call(mc); };

describe('boot: root loading screen -> intro -> main menu', () => {
  it('loading >= 0.5 s, LOADED pause 2 s, cover fade, then the intro logo (250 frames at 30 fps) with its sounds', () => {
    const sounds: [number, number, number][] = [];
    try {
      const g = createHeadlessGame({ mode: 'Single', seed: 1, menuOnly: 'Intro' });
      // (after the boot: the harness installs its own handler on the first game)
      setTimelineSoundHandler((id: number, info: any, owner: any) => { sounds.push([id, clock.virtualNow, owner?._currentframe]); playTimelineSound(id, info, owner); });
      const tIntro = clock.virtualNow;
      // root frame 10 -> LOADING (bar >= 0.5 s) -> LOADED: 60 ticks at 30 Hz, then _Cover +2 alpha per tick to 100
      // = 0.5 + 2 + 50/30 s ~ 4.2 s before CMain (frame 62) exists; State_Init -> State_Intro right after.
      expect(tIntro).toBeGreaterThan(4000);
      expect(tIntro).toBeLessThan(4600);
      expect((_root as any).menu.customItems.map((i: any) => i.caption)).toEqual(['© Sean Cooper 2007', 'Sound: ON', 'Music: ON', 'Quality: BEST']);
      const s = g.main().mcScreen;
      expect(s._CLASSID_).toBe('CScreen_Intro');
      expect(s.mSequence.length).toBe(1); // the CMG logo is removed by scope.ts
      const logo = s._Logo_SeanCooper;
      let shown = -1;
      expect(g.stepUntil(() => { if (shown < 0 && logo._visible) shown = clock.virtualNow; return g.state() === 'State_Main'; }, 1000)).toBe(true);
      const logoMs = clock.virtualNow - shown;
      expect(logoMs).toBeGreaterThan(8300); // 249 frame steps at 30 fps = 8.3 s
      expect(logoMs).toBeLessThan(8500);
      // StartSound tags of logo frames 39 / 108 (sounds 192 / 193), at (frame - 1) / 30 s after the logo appeared
      expect(sounds.map(([id, , f]) => [id, f])).toEqual([[192, 39], [193, 108]]);
      expect(sounds[0]![1] - shown).toBeGreaterThanOrEqual(38000 / 30 - 1);
      expect(sounds[0]![1] - shown).toBeLessThan(38000 / 30 + 100); // + one tick: GetFrameIndex starts its clock on the tick after the logo appeared
      expect(sounds[1]![1] - shown).toBeGreaterThanOrEqual(107000 / 30 - 1);
      expect(sounds[1]![1] - shown).toBeLessThan(107000 / 30 + 100);
      // clicking the logo does nothing (scope: its onRelease link removed); the intro cannot be skipped
      expect(logo.onRelease).toBeUndefined();
      expect(g.errors).toEqual([]);
    } finally {
      setTimelineSoundHandler(playTimelineSound);
    }
  });
});

describe('screen transitions (CScreen_Transition)', () => {
  it('11 ticks: the new screen is invisible, a DropShadow bitmap fades in by ~10 % per tick over the old one', () => {
    const g = createHeadlessGame({ mode: 'Single', seed: 1, menuOnly: 'Main' });
    const m = g.main();
    release(m.mcScreen.mcSinglePlay);
    const old = m.mcScreen;
    const alphas: number[] = [];
    let newScreen: any;
    for (let i = 0; i < 40 && !(newScreen && newScreen.mNormal); i++) {
      g.step(1);
      if (m.mcScreen !== old) newScreen = m.mcScreen;
      const tr = newScreen?.mScreen_Transition;
      if (tr?.mcContainer_IN && !newScreen.mNormal) {
        alphas.push(tr.mcContainer_IN._alpha);
        expect(newScreen._visible).toBe(false);
        expect(old.$removed).toBe(true); // the old screen was removed at once
        expect(tr.mcContainer_IN.filters.map((f: any) => f.constructor.name)).toEqual(['DropShadowFilter']);
      }
    }
    expect(newScreen.idScreen).toBe('Screen_SelectWorld');
    expect(newScreen._visible).toBe(true);
    // one value per 25 Hz tick (2 enterFrames each). _alpha is stored in 8.8 fixed point (oracle P2), so "+= 10"
    // climbs 9.77, 19.53, ... 97.66 and the 11th tick (>= 100) ends the transition - as in Flash.
    const flash: number[] = [];
    for (let a = 0; ;) { a = Math.floor((a + 10) * 2.56) / 2.56; if (a >= 100) break; flash.push(a); }
    expect(flash.length).toBe(10);
    expect([...new Set(alphas)]).toEqual(flash);
    expect(newScreen.mScreen_Transition.mcContainer).toBeDefined();
    expect(newScreen.mScreen_Transition.mcContainer.$removed).toBe(true); // container removed afterwards
    expect(g.errors).toEqual([]);
  });
});

describe('main menu roll-over (CScreen_Main.Register_Button)', () => {
  it('items idle at alpha 50; roll-over: alpha 100 + DropShadow(rnd*3, random(360)) + Blur(rnd*2) every frame; roll-out resets', () => {
    const g = createHeadlessGame({ mode: 'Single', seed: 1, menuOnly: 'Main' });
    const s = g.main().mcScreen;
    for (const n of ['mcSinglePlay', 'mcCoopPlay', 'mcDeathPlay', 'mcInstructions']) expect(s[n]._Contents._alpha).toBe(50);
    const it = s.mcDeathPlay;
    it.onRollOver.call(it);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      g.step(1);
      const [ds, bl] = it._Contents.filters;
      expect(it._Contents._alpha).toBe(100);
      expect(ds.constructor.name).toBe('DropShadowFilter');
      expect(bl.constructor.name).toBe('BlurFilter');
      expect(ds.distance).toBeGreaterThanOrEqual(0);
      expect(ds.distance).toBeLessThan(3);
      expect(Number.isInteger(ds.angle) && ds.angle >= 0 && ds.angle < 360).toBe(true);
      expect(bl.blurX).toBeLessThan(2);
      expect(bl.blurY).toBeLessThan(2);
      seen.add(`${ds.distance}|${ds.angle}|${bl.blurX}`);
    }
    expect(seen.size).toBe(6); // new random filters every enterFrame
    it.onRollOut.call(it);
    g.step(2);
    expect([it._Contents._alpha, it._Contents.filters.length, it.onEnterFrame]).toEqual([50, 0, undefined]);
    expect(g.errors).toEqual([]);
  });
});

describe('controls window: INVALID KEY! timing (real getTimer)', () => {
  it('shown at once with PRESS A KEY at alpha 0; cross-fades from 500 ms; gone at 1000 ms', () => {
    const g = createHeadlessGame({ mode: 'Single', seed: 1, menuOnly: 'Select' });
    const C = g.main().mcScreen.mcWindow_Controls;
    release(C.mcPlayer1.mcChangeKey_NextWeapon);
    g.keyDown(113); g.keyUp(113); // F2: not in CInput.mValidKeys
    const P = C.mcPressKey;
    expect([P.mcInvalidKey._visible, P.mcPressAKey._alpha]).toEqual([true, 0]);
    const t0 = clock.virtualNow;
    const samples: [number, number, number][] = [];
    g.stepUntil(() => { samples.push([clock.virtualNow - t0, P.mcInvalidKey._alpha, P.mcPressAKey._alpha]); return !P.mcInvalidKey._visible; }, 100);
    const at = (ms: number) => samples.find(([t]) => t >= ms)!;
    expect(at(400)[2]).toBe(0);
    expect(at(760)[1]).toBeGreaterThan(30);
    expect(at(760)[1]).toBeLessThan(70);
    const end = samples[samples.length - 1]!;
    expect(end[0]).toBeGreaterThanOrEqual(1000);
    expect(end[0]).toBeLessThanOrEqual(1040);
    expect([P.mcInvalidKey._visible, P.mcPressAKey._alpha, P._visible]).toEqual([false, 100, true]);
    // still waiting: a valid key now binds
    g.keyDown(78); g.keyUp(78);
    expect([P._visible, CMain.mSaveData.mPlayer1_KeyNextWeapon]).toEqual([false, 78]);
    expect(g.errors).toEqual([]);
  });

  it('each change-key button keeps its own listener: a cancelled (Esc) rebind leaves no listener behind', () => {
    const g = createHeadlessGame({ mode: 'Coop', seed: 1, menuOnly: 'Select' });
    const C = g.main().mcScreen.mcWindow_Controls;
    release(C.mcPlayer2.mcChangeKey_Shoot);
    g.keyDown(27); g.keyUp(27);
    g.keyDown(72); g.keyUp(72); // 'H' after Esc: nothing listens any more
    expect(CMain.mSaveData.mPlayer2_KeyShoot).toBe(32);
    release(C.mcPlayer2.mcChangeKey_MoveLeft);
    g.keyDown(72); g.keyUp(72);
    expect([CMain.mSaveData.mPlayer2_KeyMoveLeft, CMain.mSaveData.mPlayer2_KeyShoot]).toEqual([72, 32]);
    expect(C.mcPlayer2.tbMoveLeft.text).toBe("'H'");
    expect(g.errors).toEqual([]);
  });
});

describe('loading screen and Death Match screens', () => {
  it('Screen_LoadingWorld shows while the room is built and hands over to State_InitWorld once mLoaded', () => {
    const g = createHeadlessGame({ mode: 'Single', seed: 1, menuOnly: 'Select' });
    const s = g.main().mcScreen;
    release(s.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button);
    expect(g.waitScreen('State_LoadingWorld', 'Screen_LoadingWorld', 200) || g.state() === 'State_InitWorld' || g.state() === 'State_RunWorld').toBe(true);
    expect(g.waitRunning()).toBe(true);
    expect(g.main().mcScreen._visible).toBe(false);
    expect(g.main().mcScreen._CLASSID_).toBe('CScreen_LoadingWorld');
    expect(g.errors).toEqual([]);
  });

  it('Death Match level selection hides the level-icon View Highscores (original) and has no highscore table', () => {
    const g = createHeadlessGame({ mode: 'DeathMatch', seed: 1, menuOnly: 'Select' });
    const icons = g.main().mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons;
    expect(icons._ViewHighScore._visible).toBe(false);
    expect((Screen.CScreen_Debrief_Winner as any).prototype.mEndText.length).toBe(8);
    expect(g.errors).toEqual([]);
  });
});

describe('local instructions page (scope LOCAL_INSTRUCTIONS)', () => {
  const texts = (screen: any): string[] => Object.keys(screen).filter((k) => /^tf\d+$/.test(k)).map((k) => screen[k].text);
  it('shows the default controls, and the CURRENT bindings after a rebinding in the controls window', () => {
    const g = createHeadlessGame({ mode: 'Coop', seed: 1, menuOnly: 'Main' });
    release(g.main().mcScreen.mcInstructions);
    expect(g.waitScreen('State_Instructions', 'Screen_Instructions')).toBe(true);
    let t = texts(g.main().mcScreen);
    for (const s of ['INSTRUCTIONS', 'PLAYER 1', 'PLAYER 2', 'Arrow keys', '/', '.', ',', 'W  A  S  D', 'SPACE', 'E', 'Q', 'P  =  PAUSE', 'Railgun', 'x70']) expect(t, s).toContain(s);
    // rebind P1 shoot -> K and P2 up -> I in the controls window, then reopen the page
    g.main().mcScreen._Icon_Back.onPress.call(g.main().mcScreen._Icon_Back);
    expect(g.waitScreen('State_Main', 'Screen_Main')).toBe(true);
    release(g.main().mcScreen.mcCoopPlay);
    expect(g.waitScreen('State_SelectWorld_Coop', 'Screen_SelectWorld')).toBe(true);
    const C = g.main().mcScreen.mcWindow_Controls;
    release(C.mcPlayer1.mcChangeKey_Shoot); g.keyDown(75); g.keyUp(75);
    release(C.mcPlayer2.mcChangeKey_MoveUp); g.keyDown(73); g.keyUp(73);
    release(C.mcPlayer1.mcChangeKey_MoveLeft); g.keyDown(100); g.keyUp(100); // NUM PD '4'
    g.main().mcScreen._Icon_Back.onPress.call(g.main().mcScreen._Icon_Back);
    expect(g.waitScreen('State_Main', 'Screen_Main')).toBe(true);
    release(g.main().mcScreen.mcInstructions);
    expect(g.waitScreen('State_Instructions', 'Screen_Instructions')).toBe(true);
    t = texts(g.main().mcScreen);
    expect(t).toContain('K');
    expect(t).toContain('I  A  S  D');
    expect(t).toContain('UP  NUM 4  DOWN  RIGHT');
    expect(t).not.toContain('Arrow keys');
    expect(g.errors).toEqual([]);
  });
});
