/**
 * Library geometry helpers (build-time only): matrix maths, frame-1 display lists and character bounds as Flash
 * reports them for `_width`/`_height`/getBounds (shape bounds include strokes; sprites = union of children).
 */
import type { CharDef, CX, LibraryJson, Mat, PlaceOp, Rect, SpriteDef } from '../../src/shared/assetSchema.ts';

export const IDENT: Mat = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/** Concatenate: result maps child-local -> parent's parent space (= parent ∘ child). */
export function mul(parent: Mat, child: Mat): Mat {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  };
}

export function apply(m: Mat, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
}

/** Axis-aligned bounds of a rect transformed by m. */
export function transformRect(m: Mat, r: Rect): Rect {
  const pts = [apply(m, r.xMin, r.yMin), apply(m, r.xMax, r.yMin), apply(m, r.xMin, r.yMax), apply(m, r.xMax, r.yMax)];
  return {
    xMin: Math.min(...pts.map((p) => p[0])), xMax: Math.max(...pts.map((p) => p[0])),
    yMin: Math.min(...pts.map((p) => p[1])), yMax: Math.max(...pts.map((p) => p[1])),
  };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return { xMin: Math.min(a.xMin, b.xMin), yMin: Math.min(a.yMin, b.yMin), xMax: Math.max(a.xMax, b.xMax), yMax: Math.max(a.yMax, b.yMax) };
}

/** Flash _rotation (degrees) of a matrix. */
export function rotationDeg(m: Mat): number { return (Math.atan2(m.b, m.a) * 180) / Math.PI; }

export interface DisplayEntry { depth: number; id: number; m: Mat; cx?: CX; name?: string; ratio?: number; clipDepth?: number }

/** Display list after executing frames 1..frame of a timeline (place / move / replace / remove). Sorted by depth. */
export function displayListAt(sprite: SpriteDef, frame = 1): DisplayEntry[] {
  const list = new Map<number, DisplayEntry>();
  for (let f = 0; f < frame && f < sprite.frames.length; f++) {
    for (const op of sprite.frames[f].ops) {
      if (op.op === 'remove') { list.delete(op.depth); continue; }
      applyPlace(list, op);
    }
  }
  return [...list.values()].sort((x, y) => x.depth - y.depth);
}

function applyPlace(list: Map<number, DisplayEntry>, op: PlaceOp) {
  const cur = list.get(op.depth);
  if (op.move && cur) {
    if (op.id !== undefined) cur.id = op.id;
    if (op.m) cur.m = op.m;
    if (op.cx) cur.cx = op.cx;
    if (op.ratio !== undefined) cur.ratio = op.ratio;
    if (op.name !== undefined) cur.name = op.name;
    if (op.clipDepth !== undefined) cur.clipDepth = op.clipDepth;
    return;
  }
  if (op.id === undefined) return; // move of an empty depth: ignored by Flash
  list.set(op.depth, { depth: op.depth, id: op.id, m: op.m ?? IDENT, cx: op.cx, name: op.name, ratio: op.ratio, clipDepth: op.clipDepth });
}

/** Local bounds (px) of a character as shown at frame 1 (sprites: union of transformed children). */
export function charBounds(lib: LibraryJson, id: number, ratio = 0, depth = 0): Rect | null {
  const c: CharDef | undefined = lib.chars[id];
  if (!c || depth > 64) return null;
  switch (c.t) {
    case 'shape': return c.bounds;
    case 'morph': {
      const t = ratio / 65535, s = c.startBounds, e = c.endBounds;
      return { xMin: s.xMin + (e.xMin - s.xMin) * t, yMin: s.yMin + (e.yMin - s.yMin) * t, xMax: s.xMax + (e.xMax - s.xMax) * t, yMax: s.yMax + (e.yMax - s.yMax) * t };
    }
    case 'text': return c.bounds; // TextBounds are already in the object's space (the TextMatrix only places glyphs)
    case 'edit': return c.bounds;
    case 'bitmap': return { xMin: 0, yMin: 0, xMax: c.w, yMax: c.h };
    case 'button': {
      let r: Rect | null = null;
      for (const rec of c.records) if (rec.up) { const b = charBounds(lib, rec.id, 0, depth + 1); if (b) r = unionRect(r, transformRect(rec.m, b)); }
      return r;
    }
    case 'sprite': {
      let r: Rect | null = null;
      for (const e of displayListAt(c, 1)) {
        const b = charBounds(lib, e.id, e.ratio ?? 0, depth + 1);
        if (b) r = unionRect(r, transformRect(e.m, b));
      }
      return r;
    }
    default: return null;
  }
}
