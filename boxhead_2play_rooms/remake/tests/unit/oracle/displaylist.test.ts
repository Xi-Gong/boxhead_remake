// P2 / P4 / P11: MovieClip property storage, bounds, BitmapData.draw(mc) and construction order (Flash Player 32,
// identical in FP28 and FP8) vs the lane E display list (src/engine/swf/DisplayObject.ts), run headless.
// `it.fails` = measured deviation (TODO lane E); flip to `it` once fixed.
import { BitmapData } from '../../../src/engine/flash/BitmapData.ts';
BitmapData.headless = true;
import { describe, expect, it } from 'vitest';
import { Player, clearFrameScripts, clearRegisteredClasses, registerClass, registerFrameScript, setInstanceHook } from '../../../src/engine/swf/Player.ts';
import { MovieClip } from '../../../src/engine/swf/DisplayObject.ts';
import { numberToString, toAS2String } from '../../../src/engine/flash/as2.ts';
import { makeLibrary, place, sprite, withAction } from '../swf-runtime/fixtures.ts';
import { ALPHA_VALUES, ROT_VALUES, SCALE_VALUES, XY_VALUES } from '../../../tools/oracle/probes/p2_numeric.ts';
import { golden } from './golden.ts';

function root(): any {
  const p = Player.fromJson({
    v: 1, swfSha256: '', stage: { w: 640, h: 480, bg: [0, 0, 0, 255], frameRate: 50, frameCount: 1, swfVersion: 8 },
    exports: {}, classes: {}, chars: {}, root: { t: 'sprite', id: 0, frameCount: 1, frames: [{ ops: [] }], labels: {} }, actions: [],
  } as any);
  return p.root;
}
const s = numberToString;
const P2 = () => golden('p2_numeric').results;

describe('P2 MovieClip numeric storage (engine vs Flash)', () => {
  it('_alpha is an 8.8 multiplier: get(set(v)) = trunc(v * 2.56) / 2.56', () => {
    const m = root().createEmptyMovieClip('m', 1);
    const seq: string[] = [];
    for (let i = 0; i <= 100; i++) { m._alpha = i; seq.push(s(m._alpha)); }
    expect(seq.join(',')).toBe(P2()['alpha_0_100']);
    for (const v of ALPHA_VALUES) { m._alpha = v; expect(s(m._alpha), `alpha ${v}`).toBe(P2()[`alpha:${s(v)}`]); }
  });
  it('_xscale/_yscale are stored exactly; _rotation is normalised to [-180, 180]', () => {
    const m = root().createEmptyMovieClip('m', 1);
    for (const v of SCALE_VALUES) { m._xscale = v; m._yscale = v; expect(`${s(m._xscale)}|${s(m._yscale)}`).toBe(P2()[`scale:${s(v)}`]); }
    m._xscale = 100; m._yscale = 100;
    for (const v of ROT_VALUES) { m._rotation = v; expect(s(m._rotation), `rot ${v}`).toBe(P2()[`rotation:${s(v)}`]); }
  });
  it('_width of a drawn square rounds to twips; setting _width rescales', () => {
    const q = root().createEmptyMovieClip('q', 2);
    q.beginFill(0xff0000, 100); q.moveTo(0, 0); q.lineTo(100, 0); q.lineTo(100, 100); q.lineTo(0, 100); q.lineTo(0, 0); q.endFill();
    expect(`${q._width}|${q._height}`).toBe(P2()['square_wh']);
    q._width = 33.33; expect(`${s(q._width)}|${s(q._xscale)}`).toBe(P2()['square_width33.33']);
    q._xscale = 100; q._rotation = 45; expect(`${s(q._width)}|${s(q._height)}`).toBe(P2()['square_rot45_wh']);
  });
  // [ORACLE P2] fixed by lane O-fix: Flash stores _x/_y as twips TRUNCATED toward zero (1.26 -> 1.25, 0.975 -> 0.95,
  // -0.03 -> 0), and a value whose twips overflow int32 becomes -107374182.4 (FP28/32). Small increments are lost:
  // `_x += 0.04` never moves a clip.
  it('_x/_y truncate to twips', () => {
    const m = root().createEmptyMovieClip('m', 1);
    for (const v of XY_VALUES) { m._x = v; m._y = v; expect(`${s(m._x)}|${s(m._y)}`, `x ${v}`).toBe(P2()[`x:${s(v)}`]); }
    m._x = 0; for (let i = 0; i < 20; i++) m._x += 0.04;
    expect(s(m._x)).toBe(P2()['x_accumulate_0.04x20']);
  });
});

describe('P4 bounds (engine vs Flash)', () => {
  const P4 = () => golden('p4_bounds').results;
  const b4 = (mc: any, t: any) => { const b = mc.getBounds(t); return `${s(b.xMin)},${s(b.yMin)},${s(b.xMax)},${s(b.yMax)}`; };
  const rect = (d: any, x: number, y: number, w: number, h: number) => { d.moveTo(x, y); d.lineTo(x + w, y); d.lineTo(x + w, y + h); d.lineTo(x, y + h); d.lineTo(x, y); };
  const api = (thick: number | null, fill: boolean) => {
    const d = root().createEmptyMovieClip('d', 1);
    if (thick != null) d.lineStyle(thick, 0, 100);
    if (fill) d.beginFill(0xff0000, 100);
    rect(d, 0, 0, 100, 50);
    if (fill) d.endFill();
    return `${b4(d, d)}|wh=${s(d._width)},${s(d._height)}`;
  };
  it('drawing-API strokes extend bounds by thickness/2 on every side (hairline 0 adds nothing)', () => {
    expect(api(4, true)).toBe(P4()['api:stroke4_fill']);
    expect(api(4, false)).toBe(P4()['api:stroke4']);
    expect(api(1, false)).toBe(P4()['api:stroke1']);
    expect(api(0, false)).toBe(P4()['api:stroke0_hairline']);
    expect(api(null, true)).toBe(P4()['api:fill_only']);
    expect(api(3, false)).toBe(P4()['api:stroke3']);
    expect(api(255, false)).toBe(P4()['api:stroke255']);
    expect(api(300, false)).toBe(P4()['api:stroke300']); // thickness is capped at 255
  });
  // [ORACLE P4] fixed by lane O-fix (src/engine/flash/Graphics.ts): Flash truncates a fractional lineStyle thickness to an
  // integer (5.5 behaves like 5).
  it('fractional lineStyle thickness is truncated (5.5 -> 5)', () => {
    expect(api(5.5, false)).toBe(P4()['api:stroke5.5']);
  });
  it('curves use the true curve extrema, not the control point', () => {
    const c = root().createEmptyMovieClip('c', 1); c.lineStyle(0, 0, 100); c.moveTo(0, 0); c.curveTo(50, -50, 100, 0);
    expect(b4(c, c)).toBe(P4()['api:curve_ctrl_above']);
  });
  it('empty clip bounds are 6710886.35', () => {
    const e = root().createEmptyMovieClip('e', 1);
    expect(`${b4(e, e)}|wh=${e._width},${e._height}`).toBe(P4()['empty_clip']);
  });
  it('documents: SWF DefineShape bounds come from the tag (ShapeBounds is trusted as stored, incl. stroke)', () => {
    expect(P4()['tag:S1']).toBe('-2,-2,102,52|wh=104,54');
    expect(P4()['tag:S2']).toBe('-50,-50,200,200|wh=250,250'); // bogus tag bounds are returned verbatim
    expect(P4()['filters:bounds_with_glow']).toBe('0,0,20,20|wh=20,20'); // filters never change bounds
  });
  it('documents BitmapData.draw(mc): own matrix/_alpha/_visible/colour transform/blend mode IGNORED, own FILTERS APPLIED, children fully applied', () => {
    const r = P4();
    expect(r['draw:base_x30']).toBe('5,5,10,10|px=FFFF0000');
    expect(r['draw:own_alpha50']).toBe(r['draw:base_x30']);
    expect(r['draw:own_invisible']).toBe(r['draw:base_x30']);
    expect(r['draw:own_scale_rotation']).toBe(r['draw:base_x30']);
    expect(r['draw:own_colorTransform']).toBe(r['draw:base_x30']);
    expect(r['draw:own_blendMode_multiply']).toBe(r['draw:base_x30']);
    expect(r['draw:own_glow']).toBe('1,1,18,18|px=9E00FF00'); // <- the source clip's own filters ARE rendered
    expect(r['draw:child_alpha50']).toBe('5,5,19,19|px=7F00FF00');
    expect(r['draw:child_invisible']).toBe('5,5,10,10|px=00000000');
    expect(r['draw:child_glow']).toBe('5,5,21,21|px=A60000FF');
    expect(r['draw:invisible_parent_visible_child']).toBe('FF0000FF');
  });
});

describe('P11 construction order (golden documentation)', () => {
  const log = () => { const r = golden('p11_construct').results; return Object.keys(r).filter((k) => k.startsWith('log.')).map((k) => r[k]!); };
  it('attachMovie from a FRAME SCRIPT: parent ctor first (initObject visible, children exist but unconstructed), then children in depth order, depth-first; all before attachMovie returns', () => {
    expect(log().slice(0, 6)).toEqual([
      'attach A begin',
      'ctor CA a1 init=7 b1=raw b2=raw c=movieclip c.d=raw frame=1',
      'ctor CB b1 parent=built init=undefined',
      'ctor CB b2 parent=built init=undefined',
      'ctor CD d parent=raw grandparent=built',
      'attach A returned: a1=built b1=built b2=built c.d=built init=7',
    ]);
  });
  it('attachMovie INSIDE a constructor: the nested clip\'s children are constructed after the outer constructor returns', () => {
    expect(log().slice(7, 11)).toEqual([
      'ctor CA2 begin a2', 'ctor CA2 after attach R: r=movieclip r.rb=raw', 'ctor CB rb parent=raw init=undefined',
      'attach A2 returned: a2=built r.rb=built',
    ]);
  });
  it('attachMovie from an onEnterFrame HANDLER: only the attached clip\'s own ctor runs inside attachMovie; its children are constructed right after the handler returns (CMain attaches "World" this way)', () => {
    const l = log();
    const i = l.indexOf('handler attach: ctors during A=1 during A2=1');
    expect(i).toBeGreaterThan(0);
    expect(l[i + 1]).toBe('handler attach: h1=built h1.b1=raw ctors=14');
    expect(l.slice(i + 3, i + 7)).toEqual([
      'ctor CB b1 parent=built init=undefined', 'ctor CB b2 parent=built init=undefined', 'ctor CD d parent=raw grandparent=built',
      'ctor CB rb parent=raw init=undefined',
    ]);
  });
  it('frame scripts of new clips run after all constructors (children before parent), then onLoad (parent before children)', () => {
    expect(log().slice(13, 22)).toEqual([
      'frame1 script end', 'B.f1 b1', 'B.f1 b2', 'D.f1 d', 'A.f1 a1 b1=built', 'onLoad a1 b1=built', 'onLoad b1', 'onLoad b2', 'onLoad d',
    ]);
  });
});

// [ORACLE P11] The probe's library rebuilt as a LibraryJson fixture and run through the real engine (Player +
// DisplayObject construction model): the complete 75-entry event log must equal Flash's (FP8 = FP28 = FP32).
describe('P11 construction order: engine reproduces the full Flash log', () => {
  it('attachMovie from frame script / constructor / onEnterFrame handler, timeline placement, frame scripts, onLoad', () => {
    clearRegisteredClasses();
    clearFrameScripts();
    setInstanceHook(undefined);
    const log: string[] = [];
    const L = (s: string): void => { log.push(s); };
    let n = 0;
    const st = (o: any): string => (o == undefined ? 'undef' : o.__ctorDone ? 'built' : 'raw');
    const ty = (o: any): string => (o instanceof MovieClip ? 'movieclip' : typeof o);
    const S = toAS2String;
    class CB extends MovieClip {
      override ctor(): void { n++; L(`ctor CB ${this._name} parent=${st(this._parent)} init=${S(this.initProp)}`); this.__ctorDone = true; }
      onLoad(): void { L(`onLoad ${this._name}`); }
    }
    class CD extends MovieClip {
      override ctor(): void { n++; L(`ctor CD ${this._name} parent=${st(this._parent)} grandparent=${st(this._parent?._parent)}`); this.__ctorDone = true; }
      onLoad(): void { L(`onLoad ${this._name}`); }
    }
    class CA extends MovieClip {
      override ctor(): void {
        n++;
        L(`ctor CA ${this._name} init=${S(this.initProp)} b1=${st(this.b1)} b2=${st(this.b2)} c=${ty(this.c)} c.d=${st(this.c?.d)} frame=${this._currentframe}`);
        this.__ctorDone = true;
      }
      onLoad(): void { L(`onLoad ${this._name} b1=${st(this.b1)}`); }
    }
    class CA2 extends MovieClip {
      override ctor(): void {
        n++;
        L(`ctor CA2 begin ${this._name}`);
        const r: any = this.attachMovie('R', 'r', 1);
        L(`ctor CA2 after attach R: r=${ty(r)} r.rb=${st(r?.rb)}`);
        this.__ctorDone = true;
      }
    }
    registerClass('A', CA); registerClass('A2', CA2); registerClass('B', CB); registerClass('D', CD);
    registerFrameScript(10, 1, function () { L(`B.f1 ${this._name}`); });
    registerFrameScript(11, 1, function () { L(`D.f1 ${this._name}`); });
    registerFrameScript(13, 1, function (this: any) { L(`A.f1 ${this._name} b1=${this.b1.__ctorDone ? 'built' : 'raw'}`); });
    registerFrameScript(13, 2, function () { L(`A.f2 ${this._name}`); this.stop(); });
    let tick = 0;
    registerFrameScript(0, 1, function (this: any) {
      const root = this;
      root.onEnterFrame = function (): void {
        tick++;
        L(`tick ${tick} frame=${root._currentframe} ctors=${n} a1.b1=${st(root.a1?.b1)} a1.b3=${st(root.a1?.b3)} a2.r.rb=${st(root.a2?.r?.rb)} placedA=${st(root.placedA)} h2.r.rb=${st(root.h2?.r?.rb)} h1.b1=${st(root.h1?.b1)}`);
        if (tick === 1) {
          const n0 = n;
          const h1 = root.attachMovie('A', 'h1', 30);
          const n1 = n;
          const h2 = root.attachMovie('A2', 'h2', 31);
          const n2 = n;
          L(`handler attach: ctors during A=${n1 - n0} during A2=${n2 - n1}`);
          L(`handler attach: h1=${st(h1)} h1.b1=${st(h1.b1)} ctors=${n}`);
          L(`handler attach: h2=${st(h2)} h2.r=${ty(h2.r)} h2.r.rb=${st(h2.r.rb)} ctors=${n}`);
        }
      };
      L('attach A begin');
      const a1 = root.attachMovie('A', 'a1', 1, { initProp: 7 });
      L(`attach A returned: a1=${st(a1)} b1=${st(a1.b1)} b2=${st(a1.b2)} c.d=${st(a1.c.d)} init=${S(a1.initProp)}`);
      L(`access again: b1=${st(a1.b1)}`);
      const a2 = root.attachMovie('A2', 'a2', 2);
      L(`attach A2 returned: a2=${st(a2)} r.rb=${st(a2.r.rb)}`);
      const e = root.createEmptyMovieClip('e', 3);
      const eb = e.attachMovie('B', 'eb', 1);
      L(`attach B into empty clip returned: eb=${st(eb)}`);
      L('frame1 script end');
    });
    registerFrameScript(0, 2, function (this: any) { L(`root.f2 placedA=${st(this.placedA)} placedA.b1=${st(this.placedA?.b1)}`); });
    registerFrameScript(0, 4, function (this: any) { L('root.f4'); delete this.onEnterFrame; this.stop(); });
    const json = makeLibrary({
      chars: [
        sprite(10, [withAction([])]),
        sprite(11, [withAction([])]),
        sprite(12, [[place(1, 11, { name: 'd' })]]),
        sprite(13, [
          withAction([place(1, 10, { name: 'b1' }), place(2, 10, { name: 'b2' }), place(3, 12, { name: 'c' })]),
          withAction([place(4, 10, { name: 'b3' })]),
        ]),
        sprite(14, [[place(1, 10, { name: 'rb' })]]),
        sprite(15, [[]]),
      ],
      exports: { A: 13, A2: 15, R: 14, B: 10, D: 11, C: 12 },
      rootFrames: [withAction([]), withAction([place(20, 13, { name: 'placedA' })]), [], withAction([])],
    });
    const p = Player.fromJson(json);
    for (let i = 0; i < 6; i++) p.enterFrame();
    const r = golden('p11_construct').results;
    const want = Object.keys(r).filter((k) => k.startsWith('log.')).map((k) => r[k]!);
    expect(want.length).toBe(75);
    expect(log).toEqual(want);
    clearRegisteredClasses();
    clearFrameScripts();
  });
});
