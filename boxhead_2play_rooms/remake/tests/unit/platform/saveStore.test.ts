import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SharedObject } from '../../../src/engine/flash/SharedObject.ts';
import type { KeyValueStorage } from '../../../src/engine/flash/SharedObject.ts';
import { defaultRenderScale, parseSettings, SaveStore } from '../../../src/engine/platform/SaveStore.ts';
import { buildMenuRows, renderScaleRow } from '../../../src/engine/platform/ContextMenu.ts';
import { ContextMenu, ContextMenuItem } from '../../../src/engine/flash/stubs.ts';
import { computeFit } from '../../../src/engine/platform/Presenter.ts';

function fakeStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe('SharedObject (localStorage JSON)', () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => { store = fakeStorage(); SaveStore._setStorage(store); });
  afterAll(() => { SaveStore._setStorage(undefined); SharedObject._reset(); });

  it('round-trips CSaveData-like data across a restart', () => {
    const so = SharedObject.getLocal('BXHD_2PLAY_6');
    expect(SharedObject.getLocal('BXHD_2PLAY_6')).toBe(so);
    expect(so.data).toEqual({});
    so.data.mSoundActive = false;
    so.data.mLevelIndex_Single = 8;
    so.data.mPlayer1_KeyShoot = 191;
    so.data.mUsername = 'Zed';
    so.data.mHighscores = { 'Single:1': [{ n: 'A', s: 1200 }] };
    expect(so.flush()).toBe(true);
    expect(store.map.has('SO:BXHD_2PLAY_6')).toBe(true);

    SharedObject._forgetInstances(); // app restart
    const again = SharedObject.getLocal('BXHD_2PLAY_6');
    expect(again).not.toBe(so);
    expect(again.data).toEqual({
      mSoundActive: false, mLevelIndex_Single: 8, mPlayer1_KeyShoot: 191, mUsername: 'Zed',
      mHighscores: { 'Single:1': [{ n: 'A', s: 1200 }] },
    });
    expect(again.getSize()).toBeGreaterThan(0);
  });

  it('data is only persisted on flush (or pagehide), like Flash', () => {
    const so = SharedObject.getLocal('X');
    so.data.a = 1;
    SharedObject._forgetInstances();
    expect(SharedObject.getLocal('X').data.a).toBeUndefined();
    const so2 = SharedObject.getLocal('X');
    so2.data.a = 2;
    SharedObject._flushAll();
    SharedObject._forgetInstances();
    expect(SharedObject.getLocal('X').data.a).toBe(2);
    void so;
  });

  it('clear() empties data in place and deletes the stored copy (CSaveData.ResetData)', () => {
    const so = SharedObject.getLocal('BXHD_2PLAY_6');
    const ref = so.data;
    so.data.mDifficulty = 3;
    so.flush();
    so.clear();
    expect(so.data).toBe(ref);
    expect(Object.keys(so.data)).toEqual([]);
    expect(store.map.has('SO:BXHD_2PLAY_6')).toBe(false);
    so.data.mDifficulty = undefined; // ResetData assigns undefined after deleting
    so.flush();
    SharedObject._forgetInstances();
    expect(SharedObject.getLocal('BXHD_2PLAY_6').data.mDifficulty).toBeUndefined();
  });

  it('NaN becomes null, which AS2 `!= undefined` checks treat as unset', () => {
    const so = SharedObject.getLocal('N');
    so.data.v = Number.NaN;
    so.flush();
    SharedObject._forgetInstances();
    const v = SharedObject.getLocal('N').data.v;
    expect(v == undefined).toBe(true); // eslint-disable-line eqeqeq
  });

  it('corrupt stored JSON yields empty data instead of throwing', () => {
    store.map.set('SO:Bad', '{not json');
    expect(SharedObject.getLocal('Bad').data).toEqual({});
  });
});

describe('Settings (renderScale) and context-menu rows', () => {
  beforeEach(() => { SaveStore._setStorage(fakeStorage()); });
  afterAll(() => { SaveStore._setStorage(undefined); });

  it('renderScale defaults to 2, persists, emits change events', () => {
    expect(SaveStore.renderScale).toBe(2);
    const seen: number[] = [];
    const off = SaveStore.onChange((s) => seen.push(s.renderScale));
    SaveStore.renderScale = 1;
    SaveStore.renderScale = 1; // no change -> no event
    SaveStore._forget();
    expect(SaveStore.renderScale).toBe(1);
    off();
    SaveStore.renderScale = 2;
    expect(seen).toEqual([1]);
    expect(parseSettings('{"renderScale":3}').renderScale).toBe(2);
    expect(parseSettings('garbage').renderScale).toBe(2);
  });

  it('rows mirror Flash: visible custom items, separators, disabled, onSelect(obj, item) can rewrite the caption', () => {
    const menu = new ContextMenu();
    menu.hideBuiltInItems();
    let sound = true;
    menu.customItems.push(new ContextMenuItem('© Sean Cooper 2007', () => {}));
    const snd = new ContextMenuItem('Sound: ON', (_obj, item) => { sound = !sound; item.caption = `Sound: ${sound ? 'ON' : 'OFF'}`; });
    snd.separatorBefore = true;
    menu.customItems.push(snd);
    menu.customItems.push(new ContextMenuItem('Hidden', undefined, false, true, false));
    menu.customItems.push(new ContextMenuItem('Greyed', undefined, false, false, true));
    const root = { name: '_root' };
    const rows = buildMenuRows(menu, root, [renderScaleRow()]);
    expect(rows.map((r) => [r.caption, r.enabled, r.separatorBefore])).toEqual([
      ['© Sean Cooper 2007', true, false],
      ['Sound: ON', true, true],
      ['Greyed', false, false],
      ['Render: 2x', true, true],
    ]);
    rows[1]!.select();
    expect(snd.caption).toBe('Sound: OFF');
    rows[3]!.select();
    expect(SaveStore.renderScale).toBe(1);
    expect(buildMenuRows(undefined, root, [renderScaleRow()])[0]!.separatorBefore).toBe(false);
  });

  it('lane X1: the Render row says when a changed scale applies (cached bitmaps keep the boot scale)', () => {
    SaveStore.activeRenderScale = 2; // what main.ts sets at boot
    expect(renderScaleRow().caption).toBe('Render: 2x');
    renderScaleRow().select();
    expect(SaveStore.renderScale).toBe(1);
    expect(renderScaleRow().caption).toBe('Render: 1x (after restart)');
    renderScaleRow().select();
    expect(renderScaleRow().caption).toBe('Render: 2x');
    // a restart with the stored 1x
    SaveStore.renderScale = 1;
    SaveStore._forget();
    SaveStore.activeRenderScale = SaveStore.renderScale;
    expect(renderScaleRow().caption).toBe('Render: 1x');
  });

  it('lane X1: default render scale is 2x, 1x on low-memory devices (deviceMemory <= 2 GB) unless stored', () => {
    expect(defaultRenderScale(undefined)).toBe(2);
    expect(defaultRenderScale(8)).toBe(2);
    expect(defaultRenderScale(4)).toBe(2);
    expect(defaultRenderScale(2)).toBe(1);
    expect(defaultRenderScale(0.5)).toBe(1);
    expect(parseSettings(null, 1).renderScale).toBe(1);
    expect(parseSettings('{"renderScale":2}', 1).renderScale).toBe(2);
    expect(parseSettings(null, 8).renderScale).toBe(2);
  });
});

describe('Presenter fit (4:3 letterbox)', () => {
  it('fits and centres the stage, backing store in whole device pixels', () => {
    expect(computeFit(1280, 960, 1)).toEqual({ cssW: 1280, cssH: 960, left: 0, top: 0, deviceW: 1280, deviceH: 960 });
    const wide = computeFit(1920, 1080, 1);
    expect(wide.cssH).toBe(1080);
    expect(wide.cssW).toBe(1440);
    expect(wide.left).toBe(240);
    const tall = computeFit(800, 1000, 1.5);
    expect(tall.deviceW).toBe(1200);
    expect(tall.deviceH).toBe(900);
    expect(tall.top).toBe(200);
    const odd = computeFit(1001, 777, 1.25);
    expect(Number.isInteger(odd.deviceW) && Number.isInteger(odd.deviceH)).toBe(true);
    expect(odd.deviceW / odd.deviceH).toBeCloseTo(4 / 3, 2);
  });
});
