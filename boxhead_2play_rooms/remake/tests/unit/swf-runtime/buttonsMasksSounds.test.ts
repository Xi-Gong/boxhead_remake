import { beforeEach, describe, expect, it } from 'vitest';
import type { ButtonDef } from '../../../src/shared/assetSchema.ts';
import { Button, MovieClip } from '../../../src/engine/swf/DisplayObject.ts';
import {
  Player, clearFrameScripts, clearRegisteredClasses, setButtonActionHandler, setInstanceHook, setScriptErrorHandler,
  setTimelineSoundHandler,
} from '../../../src/engine/swf/Player.ts';
import { makeLibrary, mat, move, place, rectShape, remove, sprite } from './fixtures.ts';

beforeEach(() => {
  clearRegisteredClasses();
  clearFrameScripts();
  setInstanceHook(undefined);
  setTimelineSoundHandler(undefined);
  setButtonActionHandler(undefined);
  setScriptErrorHandler((e) => { throw e; });
});

const ident = mat(0, 0);

function buttonLib() {
  const btn: ButtonDef = {
    t: 'button', id: 9, ver: 2, trackAsMenu: false,
    records: [
      { up: true, over: false, down: false, hit: false, id: 1, depth: 1, m: ident },
      { up: false, over: true, down: false, hit: false, id: 2, depth: 1, m: ident },
      { up: false, over: false, down: true, hit: false, id: 3, depth: 1, m: ident },
      { up: false, over: false, down: false, hit: true, id: 4, depth: 2, m: ident },
    ],
    actions: [0],
  };
  const json = makeLibrary({
    chars: [
      rectShape(1, 0, 0, 10, 10), rectShape(2, 0, 0, 11, 11), rectShape(3, 0, 0, 12, 12), rectShape(4, 0, 0, 20, 20),
      btn,
      sprite(10, [[place(1, 9, { name: 'b', m: mat(50, 50) })]]),
    ],
    exports: { Holder: 10 },
  });
  json.actions = [{ kind: 'button', spriteId: 9, offset: 0, length: 1, cond: 8 } as any];
  return json;
}

describe('DefineButton2', () => {
  it('switches up/over/down state children and uses the hit records for picking', () => {
    const p = Player.fromJson(buttonLib());
    p.enterFrame();
    const h = p.root.attachMovie('Holder', 'h', 1)!;
    const b = h.b as Button;
    expect(b).toBeInstanceOf(Button);
    expect(b.getBounds(b).xMax).toBe(10);
    const calls: number[] = [];
    setButtonActionHandler((_o, id, _idx, cond) => calls.push(id * 100 + cond));
    let released = 0;
    b.onRelease = () => released++;
    p.mouseMove(50 + 15, 50 + 15); // outside the up shape but inside the hit area
    expect(b.$state).toBe('over');
    expect(b.getBounds(b).xMax).toBe(11);
    expect(p.cursor).toBe('pointer');
    p.mouseDown();
    expect(b.$state).toBe('down');
    p.mouseUp();
    expect(b.$state).toBe('over');
    expect(released).toBe(1);
    expect(calls).toEqual([908]);
    p.mouseMove(10, 10);
    expect(b.$state).toBe('up');
  });
});

describe('masks', () => {
  it('a clipDepth mask limits hit testing of the masked range', () => {
    const json = makeLibrary({
      chars: [
        rectShape(1, 0, 0, 100, 100), // content
        rectShape(2, 0, 0, 10, 10), // mask
        sprite(5, [[place(1, 2, { clipDepth: 3 }), place(2, 1, { name: 'masked' })]]),
        sprite(6, [[place(1, 5, { name: 'inner' })]]),
      ],
      exports: { M: 6 },
    });
    const p = Player.fromJson(json);
    p.enterFrame();
    const m = p.root.attachMovie('M', 'm', 1)!;
    expect(m.hitTest(5, 5, true)).toBe(true);
    expect(m.hitTest(50, 50, true)).toBe(false);
    const inner = m.inner as MovieClip;
    let n = 0;
    inner.onPress = () => n++;
    p.mouseMove(50, 50); p.mouseDown(); p.mouseUp();
    expect(n).toBe(0);
    p.mouseMove(5, 5); p.mouseDown(); p.mouseUp();
    expect(n).toBe(1);
    // the mask object itself is part of the bounds (Flash) but not of the hit area
    expect(m.getBounds(m).xMax).toBe(100);
  });
});

describe('timeline sounds', () => {
  it('calls the handler for StartSound in executed frames and filters silent-envelope preload sounds', () => {
    const json = makeLibrary({
      chars: [
        rectShape(1, 0, 0, 1, 1),
        sprite(7, [
          { ops: [place(1, 1)], sounds: [{ id: 100, info: {} }, { id: 101, info: { envelope: [{ pos44: 0, left: 0, right: 0 }] } }] },
          { ops: [], sounds: [{ id: 102, info: { loops: 2 } }] },
          { ops: [], sounds: [{ id: 103, info: {} }] },
        ]),
      ],
      exports: { S: 7 },
    });
    const heard: number[] = [];
    setTimelineSoundHandler((id, info, clip) => { heard.push(id); expect(clip).toBeInstanceOf(MovieClip); void info; });
    const p = Player.fromJson(json);
    p.enterFrame();
    const s = p.root.attachMovie('S', 's', 1)!;
    expect(heard).toEqual([100]);
    p.enterFrame();
    expect(heard).toEqual([100, 102]);
    s.gotoAndStop(1);
    s.gotoAndStop(3); // skipped frame 2's sound does not play, target frame's does
    expect(heard).toEqual([100, 102, 100, 103]);
  });
});

describe('more goto rules', () => {
  it('rewind removes instances placed after the target and recreates removed ones', () => {
    const json = makeLibrary({
      chars: [
        rectShape(1, 0, 0, 10, 10), rectShape(2, 0, 0, 5, 5),
        sprite(8, [
          [place(1, 1, { name: 'a' })],
          [place(2, 2, { name: 'late' })],
          [remove(1), move(2, { m: mat(3, 0) })],
        ]),
      ],
      exports: { G: 8 },
    });
    const p = Player.fromJson(json);
    p.enterFrame();
    const g = p.root.attachMovie('G', 'g', 1)!;
    const a = g.a;
    g.gotoAndStop(3);
    expect(g.a).toBeUndefined();
    const late = g.late;
    expect(late._x).toBe(3);
    g.gotoAndStop(1);
    expect(g.late).toBeUndefined();
    expect(late.$removed).toBe(true);
    expect(g.a).toBeDefined();
    expect(g.a).not.toBe(a);
    g.gotoAndStop(2);
    expect(g.late).toBeDefined();
    expect(g.late._x).toBe(0);
  });

  it('getBounds of a rotated child is the AABB of its transformed tag bounds', () => {
    const json = makeLibrary({
      chars: [rectShape(1, 0, 0, 10, 10), sprite(8, [[place(1, 1, { m: { a: Math.SQRT1_2, b: Math.SQRT1_2, c: -Math.SQRT1_2, d: Math.SQRT1_2, tx: 0, ty: 0 } })]])],
      exports: { R: 8 },
    });
    const p = Player.fromJson(json);
    p.enterFrame();
    const r = p.root.attachMovie('R', 'r', 1)!;
    const b = r.getBounds(r);
    expect(b.xMin).toBeCloseTo(-7.05, 9);
    expect(b.xMax).toBeCloseTo(7.05, 9);
    expect(b.yMax).toBeCloseTo(14.15, 9);
    expect(r._width).toBe(14.15); // 14.142 px -> 283 twips
  });
});
