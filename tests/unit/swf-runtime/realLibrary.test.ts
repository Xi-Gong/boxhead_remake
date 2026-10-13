import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LibraryJson } from '../../../src/shared/assetSchema.ts';
import { MovieClip, TextField, instantiateDetached } from '../../../src/engine/swf/DisplayObject.ts';
import {
  Player, clearFrameScripts, clearRegisteredClasses, setInstanceHook, setScriptErrorHandler,
} from '../../../src/engine/swf/Player.ts';
import { engine } from '../../../src/engine/swf/state.ts';

const file = resolve(__dirname, '../../../public/assets/library.json');
const have = existsSync(file);

describe.skipIf(!have)('real library.json (smoke)', () => {
  let json: LibraryJson;
  beforeAll(() => {
    json = JSON.parse(readFileSync(file, 'utf8')) as LibraryJson;
    clearRegisteredClasses();
    clearFrameScripts();
    setInstanceHook(undefined);
    setScriptErrorHandler((e) => { throw e; });
    engine.warned.add('*'); // keep output short
  });

  it('instantiates every character and visits every frame of every sprite', () => {
    const p = Player.fromJson(json);
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      p.enterFrame();
      let sprites = 0, frames = 0;
      for (const [k, c] of Object.entries(json.chars)) {
        const id = Number(k);
        if (c.t === 'font' || c.t === 'sound' || c.t === 'bitmap') continue;
        const o = instantiateDetached(id);
        expect(o, `char ${id}`).toBeDefined();
        o!.getBounds(o!);
        if (o instanceof MovieClip) {
          sprites++;
          for (let f = 2; f <= o._totalframes; f++) { o.gotoAndStop(f); frames++; }
          o.gotoAndStop(1);
          expect(o._currentframe).toBe(1);
        }
      }
      expect(sprites).toBe(374);
      const expected = Object.values(json.chars).reduce((n, c) => n + (c.t === 'sprite' ? Math.max(1, c.frameCount) - 1 : 0), 0);
      expect(frames).toBe(expected);
      // root timeline
      for (let i = 0; i < 70; i++) p.enterFrame();
    } finally {
      console.warn = origWarn;
    }
  });

  it('room clips expose _Size and init markers; HUD text fields are TextFields', () => {
    const p = Player.fromJson(json);
    console.warn = () => {};
    p.enterFrame();
    const room = p.root.attachMovie('ROOM_Single_0001', '_RoomData', 1)!;
    expect(room).toBeInstanceOf(MovieClip);
    expect(room._Size).toBeInstanceOf(MovieClip);
    // BOXY is 22x17 cells of 32 px
    expect(Math.round(room._Size._width / 32)).toBe(22);
    expect(Math.round(room._Size._height / 32)).toBe(17);
    const hud = p.root.attachMovie('Hud.ScoreTotal', '_HUD_04', 2, { _visible: false })!;
    expect(hud._visible).toBe(false);
    expect(hud.tfScore).toBeInstanceOf(TextField);
    hud.tfScore.text = '000000001234';
    expect(hud.tfScore.text).toBe('000000001234');
    const b = hud.getBounds(hud);
    expect(b.xMax).toBeGreaterThan(b.xMin);
  });

  it('Screen_Main exposes the named menu buttons with their _Contents', () => {
    const p = Player.fromJson(json);
    console.warn = () => {};
    p.enterFrame();
    const s = p.root.attachMovie('Screen_Main', '_Screen_Main', 1)!;
    for (const n of ['mcSinglePlay', 'mcCoopPlay', 'mcDeathPlay', 'mcInstructions', '_Size']) expect(s[n], n).toBeInstanceOf(MovieClip);
    expect(s.mcSinglePlay._Contents).toBeInstanceOf(MovieClip);
    expect(s.mcSinglePlay.filters.length).toBe(1);
  });
});
