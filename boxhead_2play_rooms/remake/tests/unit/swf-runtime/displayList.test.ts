import { beforeEach, describe, expect, it } from 'vitest';
import { MovieClip, INVALID_BOUNDS } from '../../../src/engine/swf/DisplayObject.ts';
import {
  Player, _root, clearFrameScripts, clearRegisteredClasses, registerClass, registerFrameScript, setInstanceHook,
  setScriptErrorHandler,
} from '../../../src/engine/swf/Player.ts';
import { makeLibrary, mat, move, place, rectShape, remove, sprite, withAction } from './fixtures.ts';

beforeEach(() => {
  clearRegisteredClasses();
  clearFrameScripts();
  setInstanceHook(undefined);
  setScriptErrorHandler((e) => { throw e; });
});

function basicLib() {
  return makeLibrary({
    chars: [
      rectShape(1, 0, 0, 10, 10),
      rectShape(2, 0, 0, 20, 20),
      sprite(20, [[place(1, 1, { name: 'sq' })]]),
      sprite(30, [[place(1, 20, { name: 'kid', m: mat(5, 5) })]]),
    ],
    exports: { Child: 20, Parent: 30 },
  });
}

describe('depth & name semantics', () => {
  it('attachMovie returns undefined for unknown linkage and names children as properties', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const root = p.root;
    expect(root.attachMovie('Nope', 'x', 1)).toBeUndefined();
    const a = root.attachMovie('Child', 'a', 3)!;
    expect(a).toBeInstanceOf(MovieClip);
    expect(root.a).toBe(a);
    expect(a._name).toBe('a');
    expect(a._parent).toBe(root);
    expect(a.getDepth()).toBe(3);
    expect(root.getNextHighestDepth()).toBe(4);
    expect(a.sq).toBeDefined();
    expect(_root).toBe(root);
  });

  it('getNextHighestDepth ignores negative (timeline) depths', () => {
    const p = Player.fromJson(makeLibrary({ chars: [rectShape(1, 0, 0, 1, 1)], rootFrames: [[place(-16383, 1)]] }));
    p.enterFrame();
    expect(p.root.getNextHighestDepth()).toBe(0);
    p.root.createEmptyMovieClip('e', 0);
    expect(p.root.getNextHighestDepth()).toBe(1);
  });

  it('attaching at an occupied depth replaces the old clip and its property', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    const b = p.root.attachMovie('Child', 'b', 1)!;
    expect(a.$removed).toBe(true);
    expect(p.root.a).toBeUndefined();
    expect(p.root.b).toBe(b);
    expect(p.root.getInstanceAtDepth(1)).toBe(b);
  });

  it('removal deletes the parent property only if it still points to the child', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    p.root.a = 'game value';
    a.removeMovieClip();
    expect(p.root.a).toBe('game value');
    const b = p.root.attachMovie('Child', 'b', 2)!;
    b.removeMovieClip();
    expect('b' in p.root).toBe(false);
  });

  it('removeMovieClip is a no-op for timeline (negative depth) clips', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const par = p.root.attachMovie('Parent', 'par', 0)!;
    const kid = par.kid as MovieClip;
    expect(kid.getDepth()).toBe(1);
    // timeline depths in our fixture are positive for brevity; simulate a real negative timeline depth
    kid.swapDepths(-16000);
    kid.removeMovieClip();
    expect(kid.$removed).toBe(false);
    kid.swapDepths(5);
    kid.removeMovieClip();
    expect(kid.$removed).toBe(true);
  });

  it('swapDepths swaps with the occupant', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    const b = p.root.attachMovie('Child', 'b', 2)!;
    a.swapDepths(b);
    expect(a.getDepth()).toBe(2);
    expect(b.getDepth()).toBe(1);
    expect(p.root.$list.map((c) => c._name)).toEqual(['b', 'a']);
    a.swapDepths(10);
    expect(a.getDepth()).toBe(10);
  });
});

describe('class registration & construction order', () => {
  // [ORACLE P11] Flash constructs the PARENT first (its children exist but are not constructed yet), then the
  // children; full model in tests/unit/oracle/displaylist.test.ts.
  it('runs the parent ctor() before its children ctor(), initObject before ctor, frame scripts after', () => {
    const log: string[] = [];
    class C extends MovieClip { override ctor(): void { super.ctor(); log.push(`C ctor parent.mWorld=${(this._parent as any)?.mWorld}`); } }
    class P extends MovieClip { override ctor(): void { super.ctor(); log.push(`P ctor init=${this.mInit} kid=${this.kid instanceof C}`); } }
    registerClass('Child', C);
    registerClass('Parent', P);
    const json = basicLib();
    (json.chars['30'] as any).frames[0].actions = [0];
    registerFrameScript(30, 1, function () { log.push(`P frame1 script this=${this instanceof P}`); });
    const p = Player.fromJson(json);
    p.enterFrame();
    const par = p.root.attachMovie('Parent', 'par', 1, { mInit: 7, mWorld: 'w' })!;
    expect(par).toBeInstanceOf(P);
    expect(log).toEqual(['P ctor init=7 kid=true', 'C ctor parent.mWorld=w', 'P frame1 script this=true']);
  });

  it('does not run JS constructors or class field initialisers (Object.create)', () => {
    let constructed = 0;
    class X extends MovieClip { constructor() { super(); constructed++; } }
    registerClass('Child', X);
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    expect(a).toBeInstanceOf(X);
    expect(constructed).toBe(0);
    expect(a.enabled).toBe(true);
    expect(a._visible).toBe(true);
  });

  it('calls the instance hook before ctor()', () => {
    const log: string[] = [];
    class C extends MovieClip { override ctor(): void { log.push('ctor ' + this._visible); } }
    registerClass('Child', C);
    setInstanceHook((mc, id) => { if (id === 20) { mc._visible = false; log.push('hook'); } });
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    p.root.attachMovie('Child', 'a', 1);
    expect(log).toEqual(['hook', 'ctor false']);
  });

  it('initObject goes through property setters', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1, { _visible: false, _x: 12.3456, mObject: 5 })!;
    expect(a._visible).toBe(false);
    expect(a._x).toBe(12.3); // [ORACLE P2] twips truncated toward zero
    expect(a.mObject).toBe(5);
  });

  it('duplicateMovieClip copies matrix, drawing and init object', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    a._x = 30;
    a.lineStyle(2, 0xff0000, 100);
    a.moveTo(0, 0);
    a.lineTo(100, 0);
    const d = a.duplicateMovieClip('d', 5, { _y: 7 })!;
    expect(d._x).toBe(30);
    expect(d._y).toBe(7);
    expect(d._parent).toBe(p.root);
    expect(d.getBounds(d).xMax).toBe(101);
  });
});

describe('timelines', () => {
  function timelineLib() {
    return makeLibrary({
      chars: [
        rectShape(1, 0, 0, 10, 10),
        rectShape(2, 0, 0, 20, 20),
        sprite(10, [
          [place(1, 1, { name: 'a', m: mat(0, 0) })],
          [move(1, { m: mat(5, 0) })],
          [remove(1)],
          withAction([place(1, 2, { name: 'b' })]),
          [move(1, { m: mat(1, 1) })],
        ], { end: 5 }),
      ],
      exports: { Anim: 10 },
    });
  }

  it('advances, moves, removes and loops', () => {
    const p = Player.fromJson(timelineLib());
    p.enterFrame();
    const mc = p.root.attachMovie('Anim', 'm', 1)!;
    const a = mc.a;
    expect(mc._currentframe).toBe(1);
    p.enterFrame();
    expect(mc._currentframe).toBe(2);
    expect(mc.a).toBe(a);
    expect(a._x).toBe(5);
    p.enterFrame();
    expect(mc.a).toBeUndefined();
    expect(a.$removed).toBe(true);
    p.enterFrame();
    expect(mc.b).toBeDefined();
    p.enterFrame();
    expect(mc.b._x).toBe(1);
    p.enterFrame(); // loop to 1
    expect(mc._currentframe).toBe(1);
    expect(mc.b).toBeUndefined();
    expect(mc.a).toBeDefined();
    expect(mc.a).not.toBe(a);
  });

  it('backward goto keeps instances placed at or before the target (same char & depth)', () => {
    const p = Player.fromJson(timelineLib());
    p.enterFrame();
    const mc = p.root.attachMovie('Anim', 'm', 1)!;
    const a = mc.a;
    mc.gotoAndStop(2);
    expect(a._x).toBe(5);
    mc.gotoAndStop(1);
    expect(mc.a).toBe(a);
    expect(a._x).toBe(0);
    mc.gotoAndStop('end');
    expect(mc._currentframe).toBe(5);
    expect(mc.b._x).toBe(1);
    const b = mc.b;
    mc.gotoAndStop(4);
    expect(mc.b).toBe(b);
    expect(b._x).toBe(0);
  });

  it('forward goto runs only the target frame script', () => {
    const ran: number[] = [];
    registerFrameScript(10, 4, () => ran.push(4));
    const p = Player.fromJson(timelineLib());
    p.enterFrame();
    const mc = p.root.attachMovie('Anim', 'm', 1)!;
    mc.gotoAndStop(5);
    p.flushActions();
    expect(ran).toEqual([]);
    mc.gotoAndStop(4);
    p.flushActions();
    expect(ran).toEqual([4]);
    mc.gotoAndStop(4); // same frame: nothing
    p.flushActions();
    expect(ran).toEqual([4]);
  });

  it('script transforms survive timeline moves', () => {
    const p = Player.fromJson(timelineLib());
    p.enterFrame();
    const mc = p.root.attachMovie('Anim', 'm', 1)!;
    mc.a._x = 50;
    mc.gotoAndStop(2);
    expect(mc.a._x).toBe(50);
  });

  it('clamps out-of-range frames and ignores unknown labels', () => {
    const p = Player.fromJson(timelineLib());
    p.enterFrame();
    const mc = p.root.attachMovie('Anim', 'm', 1)!;
    mc.gotoAndStop(99);
    expect(mc._currentframe).toBe(5);
    mc.gotoAndStop('nolabel');
    expect(mc._currentframe).toBe(5);
    mc.gotoAndStop(0);
    expect(mc._currentframe).toBe(1);
  });

  it('morph ratio and character replacement come from PlaceObject', () => {
    const json = makeLibrary({
      chars: [
        rectShape(1, 0, 0, 10, 10), rectShape(2, 0, 0, 20, 20),
        sprite(40, [[place(1, 1, { ratio: 100 })], [move(1, { id: 2 })]]),
      ],
      exports: { R: 40 },
    });
    const p = Player.fromJson(json);
    p.enterFrame();
    const mc = p.root.attachMovie('R', 'r', 1)!;
    const shape = mc.$list[0]!;
    expect(shape.$ratio).toBe(100);
    expect(mc.getBounds(mc).xMax).toBe(10);
    mc.nextFrame();
    expect(mc.$list[0]).toBe(shape);
    expect(mc.getBounds(mc).xMax).toBe(20);
  });
});

describe('frame & event order', () => {
  it('visits newest clips first; queues onEnterFrame before the frame script of the same clip', () => {
    const log: string[] = [];
    const json = makeLibrary({
      chars: [rectShape(1, 0, 0, 1, 1), sprite(50, [[], withAction([])])],
      exports: { Two: 50 },
    });
    registerFrameScript(50, 2, function () { log.push(`${this._name}:script`); });
    const p = Player.fromJson(json);
    p.enterFrame();
    const a = p.root.attachMovie('Two', 'a', 1)!;
    const b = p.root.attachMovie('Two', 'b', 2)!;
    a.onEnterFrame = function () { log.push('a:ef'); };
    b.onEnterFrame = function () { log.push('b:ef'); };
    p.enterFrame();
    expect(log).toEqual(['b:ef', 'b:script', 'a:ef', 'a:script']);
  });

  it('a clip created during a frame gets its first onEnterFrame next frame', () => {
    const log: string[] = [];
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    p.root.onEnterFrame = function () {
      if (!this.made) {
        this.made = this.attachMovie('Child', 'c', 1);
        this.made.onEnterFrame = () => log.push('child');
      }
      log.push('root');
    };
    p.enterFrame();
    p.enterFrame();
    expect(log).toEqual(['root', 'child', 'root']);
  });

  it('actions of removed clips are dropped', () => {
    const log: string[] = [];
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    const b = p.root.attachMovie('Child', 'b', 2)!;
    b.onEnterFrame = () => { a.removeMovieClip(); log.push('b'); };
    a.onEnterFrame = () => log.push('a');
    p.enterFrame();
    expect(log).toEqual(['b']);
  });
});

describe('transform properties', () => {
  it('quantises _alpha to 8.8', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    a._alpha = 0;
    const seq: number[] = [];
    while (a._alpha < 100) { a._alpha += 10; seq.push(a._alpha); }
    expect(seq.length).toBe(11);
    expect(seq[0]).toBeCloseTo(9.765625, 10);
    a._alpha = 50;
    expect(a._alpha).toBe(50);
    a._alpha = 33;
    expect(a._alpha).toBe(Math.floor(0.33 * 256) / 256 * 100);
  });

  it('keeps rotation/scale separately once set', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    a._xscale = 0;
    a._rotation = 90;
    a._xscale = 200;
    expect(a._rotation).toBeCloseTo(90, 9);
    expect(a._xscale).toBeCloseTo(200, 9);
    a._rotation = 270;
    expect(a._rotation).toBeCloseTo(-90, 9);
    a._x = 1.234;
    expect(a._x).toBe(1.2); // [ORACLE P2] twips truncated toward zero
    a._x = NaN;
    expect(a._x).toBe(1.2);
  });

  it('_width/_height use transformed bounds and the setter rescales', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const a = p.root.attachMovie('Child', 'a', 1)!;
    expect(a._width).toBe(10);
    a._width = 25;
    expect(a._xscale).toBeCloseTo(250, 9);
    expect(a._width).toBe(25);
    expect(a._height).toBe(10);
  });
});

describe('getBounds / coordinates', () => {
  it('uses shape tag bounds, children transforms, Flash invalid bounds and target spaces', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const par = p.root.attachMovie('Parent', 'par', 1)!;
    par._x = 100;
    expect(par.getBounds(par)).toEqual({ xMin: 5, xMax: 15, yMin: 5, yMax: 15 });
    expect(par.getBounds(p.root)).toEqual({ xMin: 105, xMax: 115, yMin: 5, yMax: 15 });
    expect(par.getBounds()).toEqual({ xMin: 5, xMax: 15, yMin: 5, yMax: 15 });
    const e = p.root.createEmptyMovieClip('e', 2);
    expect(e.getBounds(e).xMin).toBe(INVALID_BOUNDS);
    e.lineStyle(4, 0, 100);
    e.moveTo(0, 0);
    e.lineTo(10, 0);
    const b = e.getBounds(e);
    expect(b.xMin).toBe(-2);
    expect(b.xMax).toBe(12);
    expect(b.yMin).toBe(-2);
  });

  it('localToGlobal / globalToLocal round-trip through nested transforms', () => {
    const p = Player.fromJson(basicLib());
    p.enterFrame();
    const par = p.root.attachMovie('Parent', 'par', 1)!;
    par._x = 10; par._y = 20; par._rotation = 90;
    const pt = { x: 1, y: 0 };
    par.kid.localToGlobal(pt);
    expect(pt.x).toBeCloseTo(10 - 5, 9);
    expect(pt.y).toBeCloseTo(20 + 6, 9);
    par.kid.globalToLocal(pt);
    expect(pt.x).toBeCloseTo(1, 9);
    expect(pt.y).toBeCloseTo(0, 9);
  });
});
