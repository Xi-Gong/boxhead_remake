// Synthetic LibraryJson fixtures for the display-list player tests (lane E).
import type {
  CharDef, EditTextDef, FontDef, FrameDef, LibraryJson, PlaceOp, ShapeDef, SpriteDef, TimelineOp,
} from '../../../src/shared/assetSchema.ts';

export function rectShape(id: number, x0: number, y0: number, x1: number, y1: number, color: [number, number, number, number] = [255, 0, 0, 255]): ShapeDef {
  return {
    t: 'shape', id, ver: 1,
    bounds: { xMin: x0, yMin: y0, xMax: x1, yMax: y1 },
    layers: [{
      fillStyles: [{ t: 'solid', c: color }],
      lineStyles: [],
      fills: [{ s: 0, d: `M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}L${x0} ${y0}Z` }],
      strokes: [],
    }],
  };
}

export const place = (depth: number, id: number, extra: Partial<PlaceOp> = {}): PlaceOp => ({ op: 'place', depth, move: false, id, ...extra });
export const move = (depth: number, extra: Partial<PlaceOp> = {}): PlaceOp => ({ op: 'place', depth, move: true, ...extra });
export const remove = (depth: number): TimelineOp => ({ op: 'remove', depth });
export const mat = (tx: number, ty: number, a = 1, d = 1, b = 0, c = 0) => ({ a, b, c, d, tx, ty });

export function sprite(id: number, frames: (TimelineOp[] | FrameDef)[], labels: Record<string, number> = {}): SpriteDef {
  const fr: FrameDef[] = frames.map((f) => (Array.isArray(f) ? { ops: f } : f));
  return { t: 'sprite', id, frameCount: fr.length, frames: fr, labels };
}

/** Font with 1024-unit em: every glyph advance = 512 (half an em), ascent 800, descent 200, kerning A-V = -100. */
export function testFont(id: number, name = 'TestFont', bold = false): FontDef {
  const glyphs = [];
  for (let c = 32; c < 127; c++) {
    glyphs.push({ code: c, adv: 512, d: c === 32 ? '' : 'M0 -700L400 -700L400 0L0 0L0 -700Z' });
  }
  return { t: 'font', id, ver: 3, name, bold, italic: false, smallText: false, ascent: 800, descent: 200, leading: 0, glyphs, kerning: [[65, 86, -100]] };
}

export function editText(id: number, fontId: number, extra: Partial<EditTextDef> = {}): EditTextDef {
  return {
    t: 'edit', id, bounds: { xMin: -2, yMin: -2, xMax: 102, yMax: 22 }, fontId, height: 20, color: [255, 255, 255, 255],
    align: 0, leftMargin: 0, rightMargin: 0, indent: 0, leading: 2, varName: '', initialText: '', wordWrap: false,
    multiline: false, password: false, readOnly: true, noSelect: true, border: false, html: false, useOutlines: true,
    autoSize: false, wasStatic: false, ...extra,
  };
}

export interface FixtureOptions {
  chars?: CharDef[];
  exports?: Record<string, number>;
  rootFrames?: (TimelineOp[] | FrameDef)[];
  actionsPerFrame?: boolean;
}

/** Build a LibraryJson; frames listed in `actions` get DoAction refs automatically. */
export function makeLibrary(opt: FixtureOptions): LibraryJson {
  const chars: Record<string, CharDef> = {};
  for (const c of opt.chars ?? []) chars[String(c.id)] = c;
  const root = sprite(0, opt.rootFrames ?? [[]]);
  return {
    v: 1, swfSha256: 'test',
    stage: { w: 640, h: 480, bg: [0, 0, 0, 255], frameRate: 50, frameCount: root.frameCount, swfVersion: 8 },
    exports: opt.exports ?? {}, classes: {}, chars, root, actions: [],
  };
}

/** Mark a frame as having a DoAction (so registered frame scripts run). */
export function withAction(ops: TimelineOp[]): FrameDef { return { ops, actions: [0] }; }
