// Lane F3: local highscores (scope), registerClasses (27 linkages), frame scripts, local symbols.
import { emptyPlayer, freshSaveData, loadLibraryJson } from './f3Setup.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { getFrameScript, getRegisteredClass, Player, _root } from '../../../../src/engine/swf/Player.ts';
import { CMain, CSaveData, CSound, World } from '../../../../src/game/packages.ts';
import { LINKAGE_CLASSES, registerClasses, resolveClassPath } from '../../../../src/game/registerClasses.ts';
import {
  cleanName, getTable, insertScore, isEligible, roomIndexOfLibLink, showHighscoreTable, submitLocalScore, tableId, TOP_N,
} from '../../../../src/game/local/Highscores.ts';
import { buildLocalSymbols, installLocalSymbols } from '../../../../src/game/local/localSymbols.ts';
import { registerMainTimeline } from '../../../../src/game/frames/MainTimeline.ts';
import { registerSpriteScripts } from '../../../../src/game/frames/SpriteScripts.ts';
import { BUTTON_ACTIONS } from '../../../../src/game/frames/ButtonActions.ts';
import { HIDDEN_CHARS, REMOVED_INSTANCES, applyScope, scopeInstanceHook } from '../../../../src/game/scope.ts';

describe('local highscores', () => {
  beforeEach(() => { freshSaveData(); });

  it('insertScore keeps a descending top 10; ties keep the older entry first', () => {
    let t: any[] = [];
    const ranks: number[] = [];
    for (const s of [500, 900, 100, 900, 700]) {
      const r = insertScore(t, { mName: 'P' + s, mScore: s });
      t = r.table;
      ranks.push(r.rank);
    }
    expect(ranks).toEqual([1, 1, 3, 2, 3]);
    expect(t.map((e) => e.mScore)).toEqual([900, 900, 700, 500, 100]);
    for (let i = 0; i < 20; i++) t = insertScore(t, { mName: 'x', mScore: 1000 + i }).table;
    expect(t).toHaveLength(TOP_N);
    expect(t[0]!.mScore).toBe(1019);
    expect(insertScore(t, { mName: 'low', mScore: 5 }).rank).toBe(0);
    expect(insertScore(t, { mName: 'low', mScore: 5 }).table).toHaveLength(10);
  });

  it('table ids follow CScreen_SelectWorld.LoadHighScore', () => {
    expect(tableId('Single', 0)).toBe('ROOM_Single_0001');
    expect(tableId('Coop', 17)).toBe('ROOM_Coop_0018');
    expect(roomIndexOfLibLink('ROOM_Single_0007')).toBe(6);
    expect(roomIndexOfLibLink(undefined)).toBe(-1);
    expect(cleanName('  <Enter name> ')).toBe('PLAYER');
    expect(cleanName('Sean\rCooper')).toBe('Sean Cooper');
  });

  it('eligibility = the original rule: devils, collisions and damage all on', () => {
    expect(isEligible({ mDevilsActive: 1, mCollisionsActive: 1, mDamageActive: 1 })).toBe(true);
    expect(isEligible({ mDevilsActive: 0, mCollisionsActive: 1, mDamageActive: 1 })).toBe(false);
    expect(isEligible({ mDevilsActive: 1, mCollisionsActive: 0, mDamageActive: 1 })).toBe(false);
    expect(isEligible({ mDevilsActive: 1, mCollisionsActive: 1, mDamageActive: 0 })).toBe(false);
  });

  it('submitLocalScore stores per room x mode in the save and refuses ineligible runs', () => {
    const sd: any = (CMain as any).mSaveData;
    expect(submitLocalScore('Single', 3, 'Alice', 1200)).toBe(1);
    expect(submitLocalScore('Single', 3, 'Bob', 5000)).toBe(1);
    expect(submitLocalScore('Coop', 3, 'Team', 300)).toBe(1);
    expect(getTable('Single', 3).map((e) => e.mName)).toEqual(['Bob', 'Alice']);
    expect(getTable('Coop', 3)).toHaveLength(1);
    expect(getTable('Single', 4)).toEqual([]);
    expect(CSaveData.mSharedObject.data.mLocalHighscores.ROOM_Single_0004).toHaveLength(2);
    expect(submitLocalScore('DeathMatch', 3, 'X', 1)).toBe(-1);
    sd.mDevilsActive = 0;
    expect(submitLocalScore('Single', 3, 'Cheater', 99999)).toBe(-1);
    expect(getTable('Single', 3)).toHaveLength(2);
  });
});

describe('registerClasses', () => {
  it('library.json has the 27 registerClass linkages of the original and every one resolves', () => {
    const json = loadLibraryJson();
    expect(Object.keys(json.classes)).toHaveLength(27);
    expect(LINKAGE_CLASSES).toEqual(json.classes);
    for (const path of Object.values(json.classes)) expect(typeof resolveClassPath(path)).toBe('function');
    expect(registerClasses(json.classes)).toEqual([]);
    for (const [linkage, path] of Object.entries(json.classes)) expect(getRegisteredClass(linkage)).toBe(resolveClassPath(path));
    expect(getRegisteredClass('Main')).toBe(CMain);
    expect(getRegisteredClass('World')).toBe(World.CWorld);
    expect(getRegisteredClass('Screen.SubmitHighScore')).toBe(resolveClassPath('External.CHighscore_Submit'));
  });
});

describe('frame scripts, button actions, scope tables', () => {
  it('registers the 7 root and 18 sprite DoAction scripts that exist in the SWF (755 = XSI data)', () => {
    registerMainTimeline();
    registerSpriteScripts();
    const json = loadLibraryJson();
    const want: [number, number][] = [];
    json.root.frames.forEach((f, i) => { if (f.actions?.length) want.push([0, i + 1]); });
    for (const c of Object.values(json.chars)) {
      if (c.t !== 'sprite') continue;
      c.frames.forEach((f, i) => { if (f.actions?.some((a) => json.actions[a]?.kind === 'frame')) want.push([c.id, i + 1]); });
    }
    expect(want).toHaveLength(25);
    for (const [s, f] of want) expect(typeof getFrameScript(s, f), `${s}:${f}`).toBe('function');
  });

  it('every DefineButton2 action of the SWF has a port', () => {
    const json = loadLibraryJson();
    const buttons = Object.values(json.chars).filter((c) => c.t === 'button' && (c as any).actions?.length).map((c) => c.id);
    expect(buttons.sort((a, b) => a - b)).toEqual(Object.keys(BUTTON_ACTIONS).map(Number).sort((a, b) => a - b));
  });

  it('scope hides the sponsor characters and removes the CMG intro logo', () => {
    expect(Object.keys(HIDDEN_CHARS).map(Number)).toEqual([203, 227, 236, 239, 246, 252, 418]);
    const mc: any = { _visible: true, enabled: true };
    scopeInstanceHook(mc, 227);
    expect([mc._visible, mc.enabled]).toEqual([false, false]);
    expect(REMOVED_INSTANCES[0]).toMatchObject({ parentChar: 195, name: '_Logo_CrazyMonkeys' });
  });
});

describe('remake symbols on the real library (headless)', () => {
  it('Screen_Instructions and Local_Highscores are built from original characters', () => {
    const json = loadLibraryJson();
    const [ins, hs] = buildLocalSymbols(json);
    expect(ins!.frames[0]!.ops.map((o: any) => o.id)).toEqual([198, 56, 10, 257, 260]);
    expect(hs!.frames[0]!.ops.map((o: any) => o.id)).toEqual([274, 317, 305]);
  });

  it('the highscore overlay attaches with its CLOSE button and 10 rows', () => {
    freshSaveData();
    const json = loadLibraryJson();
    installLocalSymbols(json);
    Player.fromJson(json);
    new (CSound as any)(_root.createEmptyMovieClip('sounds', 5));
    registerSpriteScripts();
    applyScope();
    submitLocalScore('Single', 0, 'Alice', 4321);
    const host = _root.createEmptyMovieClip('host', 10);
    const mc = showHighscoreTable(host, 'Single', 0, 1);
    expect(mc).toBeDefined();
    expect(mc._Button_Close).toBeDefined();
    expect(mc.tfName0.text).toBe('Alice');
    expect(mc.tfScore0.text).toBe('000000004321');
    expect(mc.tfName9.text).toBe('---');
    mc._Button_Close._Button.onRelease?.call(mc._Button_Close._Button);
    expect(host._LocalHighscores).toBeUndefined();
    void emptyPlayer;
  });
});
