import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { hitConfig, MovieClip, TextField } from '../../../src/engine/swf/DisplayObject.ts';
import {
  Player, clearFrameScripts, clearRegisteredClasses, setInstanceHook, setScriptErrorHandler,
} from '../../../src/engine/swf/Player.ts';
import { pointInPolys } from '../../../src/engine/swf/paths.ts';
import { TextFormat } from '../../../src/engine/flash/TextFormat.ts';
import { Mouse } from '../../../src/engine/flash/input.ts';
import { layoutText, parseHtml, toHtml, defaultFmt, restrictAllows } from '../../../src/engine/swf/text.ts';
import { ftEditCodesCovered, renderObjectAt } from '../../../src/engine/swf/render/renderer.ts';
import { engine } from '../../../src/engine/swf/state.ts';
import { editText, makeLibrary, mat, place, rectShape, sprite, testFont } from './fixtures.ts';

beforeEach(() => {
  clearRegisteredClasses();
  clearFrameScripts();
  setInstanceHook(undefined);
  setScriptErrorHandler((e) => { throw e; });
  hitConfig.pointInFill = (polys, x, y, eo) => pointInPolys(polys, x, y, eo);
});

function textLib(extra: Parameters<typeof editText>[2] = {}) {
  return makeLibrary({
    chars: [
      testFont(5, 'TestFont'),
      testFont(6, 'TestFont', true),
      editText(7, 5, extra),
      sprite(8, [[place(1, 7, { name: 'tf' })]]),
    ],
    exports: { T: 8 },
  });
}

describe('TextField model', () => {
  it('lays out embedded glyphs with the 2px gutter, advances, letterSpacing and alignment', () => {
    const p = Player.fromJson(textLib({ initialText: 'AB' }));
    p.enterFrame();
    const tf = p.root.attachMovie('T', 't', 1)!.tf as TextField;
    expect(tf).toBeInstanceOf(TextField);
    expect(tf.text).toBe('AB');
    const lay = tf.$getLayout();
    expect(lay.lines.length).toBe(1);
    // size 20: advance 512/1024*20 = 10 px; ascent 800/1024*20 = 15.625
    expect(lay.lines[0]!.glyphs.map((g) => g.x)).toEqual([0, 10]);
    expect(lay.lines[0]!.baseline).toBeCloseTo(15.625, 9);
    expect(tf.textWidth).toBe(20);
    expect(tf.textHeight).toBeCloseTo(19.53125, 9);
    const f = tf.getTextFormat();
    f.letterSpacing = -2;
    f.align = 'center';
    tf.setTextFormat(f);
    const l2 = tf.$getLayout().lines[0]!;
    // advances 8 each, width = 10 + 8 = 18 (trailing spacing excluded); field inner width 104-4 = 100
    expect(l2.glyphs.map((g) => g.x)).toEqual([41, 49]);
  });

  it('text assignment resets formats applied with setTextFormat (uses the new text format)', () => {
    const p = Player.fromJson(textLib({ initialText: 'x' }));
    p.enterFrame();
    const tf = p.root.attachMovie('T', 't', 1)!.tf as TextField;
    const f = new TextFormat();
    f.letterSpacing = -2;
    tf.setTextFormat(f);
    expect(tf.getTextFormat().letterSpacing).toBe(-2);
    tf.text = 'hello';
    expect(tf.getTextFormat().letterSpacing).toBe(0);
    const nf = new TextFormat();
    nf.color = 0xff0000;
    tf.setNewTextFormat(nf);
    tf.text = 'red';
    expect(tf.getTextFormat().color).toBe(0xff0000);
    tf.textColor = 0x00ff00;
    expect(tf.getTextFormat().color).toBe(0x00ff00);
    tf.text = 5 as unknown as string;
    expect(tf.text).toBe('5');
  });

  it('parses Flash HTML (p align, font face/size/color/letterSpacing, b, entities)', () => {
    const base = { ...defaultFmt(), font: 'TestFont', size: 10 };
    const spans = parseHtml('<p align="center"><font face="TestFont" size="26" color="#ffffff" letterSpacing="-2.000000" kerning="1">&lt;ENTER NAME&gt; <b>x</b></font></p>', base);
    expect(spans.map((s) => s.text).join('')).toBe('<ENTER NAME> x');
    expect(spans[0]!.fmt).toMatchObject({ align: 'center', size: 26, color: 0xffffff, letterSpacing: -2, kerning: true, bold: false });
    expect(spans[spans.length - 1]!.fmt.bold).toBe(true);
    const two = parseHtml('<p>a</p><p>b</p>', base);
    expect(two.map((s) => s.text).join('')).toBe('a\rb');
    expect(toHtml(two)).toContain('<P ALIGN="LEFT">');
  });

  it('html fields pick the embedded font by face+style; kerning applies when enabled', () => {
    const p = Player.fromJson(textLib({ html: true, initialText: '<p><font face="TestFont" kerning="1"><b>AV</b></font></p>' }));
    p.enterFrame();
    const tf = p.root.attachMovie('T', 't', 1)!.tf as TextField;
    const g = tf.$getLayout().lines[0]!.glyphs;
    expect(tf.$font(g[0]!.fmt).font!.id).toBe(6);
    // A-V kern -100/1024*20 = -1.953125
    expect(g[1]!.x - g[0]!.x).toBeCloseTo(10 - 1.953125, 9);
  });

  it('word wraps at spaces', () => {
    const env = { advance: () => 10, kern: () => 0, metrics: () => ({ ascent: 8, descent: 2 }) };
    const lay = layoutText([{ text: 'aaa bbb ccc', fmt: { ...defaultFmt(), leading: 2 } }], env, { width: 4 + 75, wordWrap: true, multiline: true });
    expect(lay.lines.map((l) => l.glyphs.map((g) => String.fromCharCode(g.code)).join(''))).toEqual(['aaa bbb ', 'ccc']);
    expect(lay.lines[1]!.top).toBe(12);
  });

  it('input fields: focus by click, typing with maxChars/restrict, backspace', () => {
    const json = textLib({ readOnly: false, noSelect: false, maxLength: 5, initialText: '' });
    const p = Player.fromJson(json);
    p.enterFrame();
    const mc = p.root.attachMovie('T', 't', 1)!;
    mc._x = 100; mc._y = 100;
    const tf = mc.tf as TextField;
    expect(tf.type).toBe('input');
    tf.restrict = 'A-Z ';
    p.mouseMove(110, 105);
    expect(p.cursor).toBe('text');
    p.mouseDown();
    p.mouseUp();
    for (const k of ['H', 'i', 'I', ' ', 'X', 'Y', 'Z']) p.keyInput({ key: k, keyCode: k.charCodeAt(0), type: 'down' });
    expect(tf.text).toBe('HI XY');
    p.keyInput({ key: 'Backspace', keyCode: 8, type: 'down' });
    expect(tf.text).toBe('HI X');
    p.mouseMove(500, 400);
    p.mouseDown();
    expect(p.keyInput({ key: 'A', keyCode: 65, type: 'down' })).toBe(false);
  });

  it('a non-selectable input field takes no focus and shows no I-beam (lane X1: debrief name after SEND SCORE)', () => {
    const json = textLib({ readOnly: false, noSelect: false, maxLength: 5, initialText: '' });
    const p = Player.fromJson(json);
    p.enterFrame();
    const mc = p.root.attachMovie('T', 't', 1)!;
    mc._x = 100; mc._y = 100;
    const tf = mc.tf as TextField;
    p.mouseMove(110, 105);
    p.mouseDown();
    p.mouseUp();
    expect(p.keyInput({ key: 'A', keyCode: 65, type: 'down' })).toBe(true);
    tf.selectable = false; // CScreen_Debrief.DisableSubmitScore
    expect(p.keyInput({ key: 'B', keyCode: 66, type: 'down' })).toBe(false);
    p.mouseMove(111, 105);
    expect(p.cursor).toBe('default');
    p.mouseDown();
    p.mouseUp();
    expect(p.keyInput({ key: 'C', keyCode: 67, type: 'down' })).toBe(false);
    expect(tf.text).toBe('A');
  });

  it('restrict patterns', () => {
    expect(restrictAllows('A-Z', 'Q')).toBe(true);
    expect(restrictAllows('A-Z', 'q')).toBe(false);
    expect(restrictAllows('^0-9', 'a')).toBe(true);
    expect(restrictAllows('^0-9', '5')).toBe(false);
    expect(restrictAllows(null, '#')).toBe(true);
  });
});

describe('hit testing & mouse', () => {
  function mouseLib() {
    return makeLibrary({
      chars: [
        rectShape(1, 0, 0, 10, 10),
        sprite(2, [[place(1, 1)]]),
        // a 'cover' shape on top that is NOT interactive must not block
        sprite(3, [[place(1, 2, { name: 'btn', m: mat(100, 100) }), place(2, 1, { m: mat(100, 100) })]]),
      ],
      exports: { Box: 2, Screen: 3 },
    });
  }

  it('hitTest(x, y, shapeFlag) uses shape geometry and the injected point-in-path', () => {
    const p = Player.fromJson(mouseLib());
    p.enterFrame();
    const s = p.root.attachMovie('Screen', 's', 1)!;
    s._rotation = 45;
    const btn = s.btn as MovieClip;
    const pt = { x: 5, y: 5 };
    btn.localToGlobal(pt);
    expect(btn.hitTest(pt.x, pt.y, true)).toBe(true);
    expect(btn.hitTest(pt.x + 20, pt.y, true)).toBe(false);
    let calls = 0;
    hitConfig.pointInFill = (polys, x, y, eo) => { calls++; return pointInPolys(polys, x, y, eo); };
    btn.hitTest(pt.x, pt.y, true);
    expect(calls).toBeGreaterThan(0);
    hitConfig.pointInFill = () => false;
    expect(btn.hitTest(pt.x, pt.y, true)).toBe(false);
    expect(btn.hitTest(pt.x, pt.y, false)).toBe(true); // bounding box test
  });

  it('dispatches rollOver/press/release/rollOut/releaseOutside with Flash rules', () => {
    const p = Player.fromJson(mouseLib());
    p.enterFrame();
    const s = p.root.attachMovie('Screen', 's', 1)!;
    const btn = s.btn as MovieClip;
    const log: string[] = [];
    for (const ev of ['onRollOver', 'onRollOut', 'onPress', 'onRelease', 'onReleaseOutside', 'onDragOut', 'onDragOver']) {
      btn[ev] = () => log.push(ev);
    }
    const listener = { onMouseDown: () => log.push('Mouse.down') };
    Mouse.addListener(listener);
    p.mouseMove(105, 105);
    expect(p.cursor).toBe('pointer');
    p.mouseDown();
    p.mouseUp();
    p.mouseMove(300, 300);
    p.mouseMove(105, 105);
    p.mouseDown();
    p.mouseMove(300, 300);
    p.mouseUp();
    Mouse.removeListener(listener);
    expect(log).toEqual(['onRollOver', 'onPress', 'Mouse.down', 'onRelease', 'onRollOut', 'onRollOver', 'onPress',
      'Mouse.down', 'onDragOut', 'onReleaseOutside']);
  });

  it('disabled clips block but get no events; useHandCursor=false hides the hand', () => {
    const p = Player.fromJson(mouseLib());
    p.enterFrame();
    const s = p.root.attachMovie('Screen', 's', 1)!;
    const btn = s.btn as MovieClip;
    const log: string[] = [];
    btn.onRelease = () => log.push('release');
    btn.enabled = false;
    p.mouseMove(105, 105);
    expect(p.cursor).toBe('default');
    p.mouseDown(); p.mouseUp();
    expect(log).toEqual([]);
    btn.enabled = true;
    btn.useHandCursor = false;
    p.mouseMove(106, 106);
    p.mouseMove(105, 105);
    expect(p.cursor).toBe('default');
    p.mouseDown(); p.mouseUp();
    expect(log).toEqual(['release']);
    // onPress = 0 makes a clip button-mode (covers in the original game)
    const cover = p.root.attachMovie('Box', 'cover', 5)!;
    cover._x = 100; cover._y = 100;
    cover.onPress = 0;
    p.mouseMove(104, 104);
    p.mouseDown(); p.mouseUp();
    expect(log).toEqual(['release']);
  });

  it('invisible clips are not picked', () => {
    const p = Player.fromJson(mouseLib());
    p.enterFrame();
    const s = p.root.attachMovie('Screen', 's', 1)!;
    const btn = s.btn as MovieClip;
    let n = 0;
    btn.onRelease = () => n++;
    s._visible = false;
    p.mouseMove(105, 105);
    p.mouseDown(); p.mouseUp();
    expect(n).toBe(0);
  });
});

// v0.1.8 (EMBEDDED_FONT_CJK_FALLBACK): the game's embedded fonts are Latin-only; before this, codepoints missing
// from the font had advance 0 and were skipped in BOTH draw paths - Chinese names in the debrief field (and the
// local highscore table) rendered blank. Missing codes now measure/draw with the CSS device-font stack instead.
describe('CJK fallback for embedded fonts (v0.1.8)', () => {
  // Node has no Path2D: without the stub Library.glyphPath returns null and every embedded glyph would be skipped.
  const g0 = globalThis as unknown as { Path2D?: unknown };
  let savedPath2D: unknown;
  beforeAll(() => { savedPath2D = g0.Path2D; g0.Path2D = class { constructor(public d: string) {} }; });
  afterAll(() => { g0.Path2D = savedPath2D; });

  /** Recording context: only the surface drawEditText touches (Node has no canvas). */
  function recordingCtx(): { ctx: any; ops: { m: string; args: any[]; font?: string }[] } {
    const ops: { m: string; args: any[]; font?: string }[] = [];
    const ctx: Record<string, any> = {
      canvas: undefined, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '',
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      setTransform: (...a: any[]) => { ops.push({ m: 'setTransform', args: a }); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      fill: (...a: any[]) => { ops.push({ m: 'fill', args: a }); },
      fillText: (...a: any[]) => { ops.push({ m: 'fillText', args: a, font: String(ctx.font) }); },
      fillRect: (...a: any[]) => { ops.push({ m: 'fillRect', args: a }); },
    };
    return { ctx, ops };
  }

  it('missing codes advance by the device fallback instead of 0', () => {
    const p = Player.fromJson(textLib({ initialText: 'A王A' }));
    p.enterFrame();
    const tf = p.root.attachMovie('T', 't', 1)!.tf as TextField;
    const g = tf.$getLayout().lines[0]!.glyphs;
    expect(g.map((x) => String.fromCharCode(x.code)).join('')).toBe('A王A');
    expect(g[1]!.x - g[0]!.x).toBe(10); // embedded A: advance 512/1024*20
    const cjk = g[2]!.x - g[1]!.x;
    expect(cjk).toBeGreaterThan(5); // was 0 before: 王 neither drew nor advanced
    expect(cjk).toBeCloseTo(20 * 0.55, 9); // node's measureDevice fallback; a real canvas measures the system font
  });

  it('the outline renderer draws missing codes with the device font stack, embedded ones as outlines', () => {
    const p = Player.fromJson(textLib({ readOnly: false, noSelect: false, initialText: 'A王A' }));
    p.enterFrame();
    const tf = p.root.attachMovie('T', 't', 1)!.tf as TextField;
    engine.focus = tf; // focused input fields draw uncached, straight through drawEditText
    try {
      const { ctx, ops } = recordingCtx();
      renderObjectAt(tf, ctx, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, 1, false);
      expect(ops.filter((o) => o.m === 'fill').length).toBe(2); // the two As as embedded outlines
      const texts = ops.filter((o) => o.m === 'fillText');
      expect(texts.map((t) => t.args[0])).toEqual(['王']); // device-stack fillText for the missing code
      expect(texts[0]!.font).toContain('20px');
    } finally {
      engine.focus = null;
    }
  });

  it('a FlashType edit field with any missing code drops to the outline renderer', () => {
    const p = Player.fromJson(textLib({ initialText: 'AB' }));
    p.enterFrame();
    const tf = p.root.attachMovie('T', 't', 1)!.tf as TextField;
    expect(ftEditCodesCovered(tf)).toBe(true); // every code embedded
    tf.text = 'A王B';
    expect(ftEditCodesCovered(tf)).toBe(false); // 王 is not in the font -> no FlashType for the field
    const p2 = Player.fromJson(textLib({ initialText: 'AB', useOutlines: false }));
    p2.enterFrame();
    const tf2 = p2.root.attachMovie('T', 't', 1)!.tf as TextField;
    expect(ftEditCodesCovered(tf2)).toBe(false); // device-font fields never take the FT path
  });
});
