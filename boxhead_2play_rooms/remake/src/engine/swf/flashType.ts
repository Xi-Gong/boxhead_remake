/**
 * FlashType ("anti-alias for readability", Adobe Saffron) text rasterizer (lane T). Pure: no DOM, unit-testable.
 *
 * Saffron renders a glyph from its signed distance field: every device pixel samples the signed distance d (px,
 * positive inside) of its CENTRE to the grid-fitted glyph outline and maps it with Continuous Stroke Modulation,
 *     alpha = clamp((d - outsideCutoff) / (insideCutoff - outsideCutoff), 0, 1).
 * The colour is then blended linearly (sRGB, like every other Flash fill): out = bg + (color - bg) * alpha * a.
 *
 * Everything below was measured in the real Flash Player 28 (tools/oracle/visual/csmProbe.ts; goldens
 * tests/goldens/flash/csm_*.json; fit and verification tests/unit/oracle/flashtype.test.ts). In DEVICE pixels:
 *
 *  1. Positions are quantized to QUARTER pixels: q4(v) = round(4v) / 4.
 *  2. Text origin: X0 = rhe(q4(tx) + q4(mtx)) + 1, Y0 = rhe(q4(ty) + q4(mty)) - 1, where (tx, ty) is the device
 *     translation of the text character, (mtx, mty) its TextMatrix translation in device units and rhe() rounds
 *     half to EVEN (an origin fraction of 0.4..0.6 quantizes to .5 and goes to the even pixel). Yes, FlashType text
 *     sits one pixel right of and one pixel above its outline position (also at 2x zoom: one DEVICE pixel).
 *  3. Glyph pens: X0 + q4(record x + sum of advances) (device units); baselines Y0 + record y.
 *  4. Grid fitting with the font's DefineFontAlignZones record [x, y, xRange, yRange] (EM units) per glyph:
 *       - Y: the zone [baseline, yRange] is stretched to H = floor(h + 0.8) pixels (h = yRange in px; fraction
 *         < 0.2 rounds down, >= 0.2 up); the whole glyph is scaled by H / h about the baseline;
 *       - X (GridFit subpixel): the stem edge pen + x is snapped to the nearest THIRD of a pixel; a glyph with a
 *         second stem (xRange > 0) is also scaled in X so that xRange becomes a whole number of thirds;
 *         GridFit pixel: the same with whole pixels.
 *  5. CSM cutoffs depend on the device font size (px per EM), the font's CSMTableHint (thin/medium/thick) and
 *     whether the text colour is LIGHT (luminance * alpha >= 201 of 255: thicker strokes) or dark — two tables,
 *     like AS3's TextRenderer.setAdvancedAntialiasingTable(..., colorType "light"/"dark", ...).
 *  6. Static text is clipped to its DefineText bounds: [floor(X0 - mtx + xMin), floor(X0 - mtx + xMax)) etc.
 *
 * A rasterized glyph depends only on (glyph, device size, sub-pixel phase of its x origin — a multiple of 1/12 —,
 * cutoffs), so glyph masks are cached and a text is composited by stamping masks at integer offsets.
 */

/** Flattened outline: line segments x0,y0,x1,y1 (EM units, 1024 per EM, y down), consistently closed contours. */
export interface GlyphOutline {
  segs: Float64Array;
  /** bounds in EM units (empty glyph: all 0) */
  xMin: number; yMin: number; xMax: number; yMax: number;
}

const outlineCache = new Map<string, GlyphOutline>();

/**
 * Parse an extractor glyph path (M/L/Q/Z, EM units) into line segments. Quadratic curves are subdivided until the
 * chord deviates less than `tol` EM units (default 0.2 = 0.02 px at 96 px).
 */
export function glyphOutline(d: string, tol = 0.2): GlyphOutline {
  const key = `${tol}|${d}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const out: number[] = [];
  const tok = d.match(/[MLQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = '';
  const line = (x1: number, y1: number): void => {
    if (x1 !== x || y1 !== y) out.push(x, y, x1, y1);
    x = x1; y = y1;
  };
  const close = (): void => { if (x !== sx || y !== sy) line(sx, sy); };
  while (i < tok.length) {
    const t = tok[i]!;
    if (/^[MLQZ]$/i.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === 'Z') close();
      continue;
    }
    if (cmd === 'M') {
      close();
      x = sx = Number(t); y = sy = Number(tok[i + 1]); i += 2;
      cmd = 'L';
    } else if (cmd === 'L') {
      line(Number(t), Number(tok[i + 1])); i += 2;
    } else if (cmd === 'Q') {
      const cx = Number(t), cy = Number(tok[i + 1]), ex = Number(tok[i + 2]), ey = Number(tok[i + 3]);
      i += 4;
      const ddx = x - 2 * cx + ex, ddy = y - 2 * cy + ey;
      const dev = Math.sqrt(ddx * ddx + ddy * ddy) / 4;
      const n = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(dev / tol))));
      const x0 = x, y0 = y;
      for (let k = 1; k <= n; k++) {
        const s = k / n, u = 1 - s;
        line(u * u * x0 + 2 * u * s * cx + s * s * ex, u * u * y0 + 2 * u * s * cy + s * s * ey);
      }
    } else i++;
  }
  close();
  const segs = new Float64Array(out);
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (let k = 0; k < segs.length; k += 2) {
    const px = segs[k]!, py = segs[k + 1]!;
    if (px < xMin) xMin = px;
    if (px > xMax) xMax = px;
    if (py < yMin) yMin = py;
    if (py > yMax) yMax = py;
  }
  const g: GlyphOutline = segs.length ? { segs, xMin, yMin, xMax, yMax } : { segs, xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  if (outlineCache.size > 4096) outlineCache.clear();
  outlineCache.set(key, g);
  return g;
}

/** Axis-separable glyph -> device mapping: X = ax * x + bx, Y = ay * y + by (EM units -> device px). */
export interface AxisMap { ax: number; bx: number; ay: number; by: number }

/**
 * Signed distance field of the mapped outline sampled at the pixel centres of the w x h block whose top-left device
 * pixel is (px0, py0); values clamped to [-R, R] (px), positive inside (nonzero winding). Row-major Float32Array.
 */
export function distanceField(g: GlyphOutline, m: AxisMap, px0: number, py0: number, w: number, h: number, R: number): Float32Array {
  const n = g.segs.length >> 2;
  const s = new Float64Array(n * 4);
  for (let k = 0; k < n; k++) {
    s[k * 4] = m.ax * g.segs[k * 4]! + m.bx - px0;
    s[k * 4 + 1] = m.ay * g.segs[k * 4 + 1]! + m.by - py0;
    s[k * 4 + 2] = m.ax * g.segs[k * 4 + 2]! + m.bx - px0;
    s[k * 4 + 3] = m.ay * g.segs[k * 4 + 3]! + m.by - py0;
  }
  const d2 = new Float64Array(w * h).fill(R * R);
  // unsigned distance: each segment updates the pixels within R of its bounding box
  for (let k = 0; k < n; k++) {
    const x0 = s[k * 4]!, y0 = s[k * 4 + 1]!, x1 = s[k * 4 + 2]!, y1 = s[k * 4 + 3]!;
    const ix0 = Math.max(0, Math.floor(Math.min(x0, x1) - R - 0.5)), ix1 = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + R - 0.5));
    const iy0 = Math.max(0, Math.floor(Math.min(y0, y1) - R - 0.5)), iy1 = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + R - 0.5));
    if (ix0 > ix1 || iy0 > iy1) continue;
    const dx = x1 - x0, dy = y1 - y0, ll = dx * dx + dy * dy;
    for (let iy = iy0; iy <= iy1; iy++) {
      const cy = iy + 0.5;
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = ix + 0.5;
        let t = ll > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / ll : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x0 + t * dx - cx, ey = y0 + t * dy - cy;
        const e = ex * ex + ey * ey;
        const j = iy * w + ix;
        if (e < d2[j]!) d2[j] = e;
      }
    }
  }
  // sign: nonzero winding along each pixel-centre row
  const out = new Float32Array(w * h);
  const xs: number[] = [], ws: number[] = [];
  for (let iy = 0; iy < h; iy++) {
    const cy = iy + 0.5;
    xs.length = 0; ws.length = 0;
    for (let k = 0; k < n; k++) {
      const y0 = s[k * 4 + 1]!, y1 = s[k * 4 + 3]!;
      if ((y0 <= cy) === (y1 <= cy)) continue;
      const x0 = s[k * 4]!, x1 = s[k * 4 + 2]!;
      xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
      ws.push(y1 > y0 ? 1 : -1);
    }
    const ord = xs.map((_, k) => k).sort((a, b) => xs[a]! - xs[b]!);
    let wind = 0, q = 0;
    for (let ix = 0; ix < w; ix++) {
      const cx = ix + 0.5;
      while (q < ord.length && xs[ord[q]!]! <= cx) { wind += ws[ord[q]!]!; q++; }
      const d = Math.sqrt(d2[iy * w + ix]!);
      out[iy * w + ix] = wind !== 0 ? d : -d;
    }
  }
  return out;
}

/** CSM ramp: alpha (0..1) from a signed distance (px). */
export function csmAlpha(d: number, inside: number, outside: number): number {
  const a = (d - outside) / (inside - outside);
  return a <= 0 ? 0 : a >= 1 ? 1 : a;
}

// ==================================================================================================== Flash model

/** Quarter-pixel quantization of device positions. */
export const q4 = (v: number): number => Math.round(v * 4) / 4;

/** Round half to even (Flash's FlashType origin rounding; ties come from q4: fractions 0.4..0.6). */
export function roundHalfEven(v: number): number {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Nearest third of a pixel (GridFit subpixel) / whole pixel (GridFit pixel). */
export const snapThird = (v: number): number => Math.round(v * 3) / 3;

/**
 * CSM cutoff tables measured in Flash Player 28 with thickness = sharpness = 0 (all this game uses): rows
 * [device font size px, insideCutoff, outsideCutoff], linear interpolation, clamped at both ends. "1" = medium
 * CSMTableHint (Calibri, Arial Rounded MT Bold regular), "2" = thick (Arial Rounded MT Bold bold). The thin table
 * (hint 0) was not measured (no font uses it) and falls back to medium. Fitted per size on 6 glyphs x 7 fonts
 * (dark) / 4 glyphs x 3 fonts (light); residual MAE 0.2-0.5 of 255 per pixel.
 */
export const CSM_TABLES: Record<'dark1' | 'dark2' | 'light1' | 'light2', readonly (readonly [number, number, number])[]> = {
  dark1: [[8, 0.45, -0.44], [9, 0.47, -0.44], [10, 0.49, -0.43], [11, 0.52, -0.42], [12, 0.565, -0.415], [16, 0.565, -0.41],
    [18, 0.57, -0.42], [20, 0.58, -0.43], [22, 0.59, -0.44], [24, 0.60, -0.45], [26, 0.62, -0.46], [36, 0.62, -0.465], [96, 0.62, -0.47]],
  dark2: [[8, 0.57, -0.41], [16, 0.57, -0.41], [18, 0.58, -0.42], [20, 0.59, -0.43], [22, 0.60, -0.44], [24, 0.61, -0.45], [26, 0.62, -0.46]],
  light1: [[8, 0.08, -0.67], [9, 0.14, -0.64], [10, 0.19, -0.60], [11, 0.25, -0.57], [12, 0.31, -0.54], [13, 0.35, -0.53], [14, 0.38, -0.52],
    [16, 0.45, -0.49], [18, 0.49, -0.50], [20, 0.53, -0.51], [22, 0.56, -0.52], [24, 0.61, -0.53], [26, 0.65, -0.54], [28, 0.66, -0.54]],
  light2: [[8, 0.18, -0.56], [9, 0.25, -0.52], [10, 0.31, -0.44], [11, 0.40, -0.43], [12, 0.47, -0.39], [14, 0.49, -0.39], [16, 0.53, -0.41],
    [18, 0.55, -0.43], [20, 0.58, -0.46], [22, 0.60, -0.48], [24, 0.63, -0.51], [26, 0.65, -0.53], [28, 0.66, -0.54]],
};

/** [insideCutoff, outsideCutoff] (px) for a device font size, CSMTableHint and text colour class. */
export function csmCutoffs(size: number, hint: number, light: boolean): [number, number] {
  const t = CSM_TABLES[light ? (hint >= 2 ? 'light2' : 'light1') : (hint >= 2 ? 'dark2' : 'dark1')];
  const first = t[0]!, last = t[t.length - 1]!;
  if (!(size > first[0])) return [first[1], first[2]];
  if (size >= last[0]) return [last[1], last[2]];
  let i = 1;
  while (t[i]![0] < size) i++;
  const a = t[i - 1]!, b = t[i]!, k = (size - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Light text (the light CSM table): luminance (Rec.601) * alpha >= 201 of 255 (measured: 200 dark, 202.5 light). */
export function isLightText(r: number, g: number, b: number, a: number): boolean {
  return ((0.299 * r + 0.587 * g + 0.114 * b) * a) / 255 >= 201;
}

/** One glyph to draw: device pen x (already quarter-quantized), integer baseline, RGBA colour (0..255). */
export interface FtGlyph {
  /** extractor glyph path (EM units) */
  d: string;
  /** DefineFontAlignZones record of the glyph ([x, y, xRange, yRange] EM units), if any */
  zone: readonly [number, number, number, number] | null | undefined;
  /** font id + glyph index: mask cache key */
  key: string;
  /** device font size (px per EM) in x / y */
  sizeX: number;
  sizeY: number;
  pen: number;
  base: number;
  /** CSMTableHint of the font */
  hint: number;
  color: readonly [number, number, number, number];
}

/** A rasterized glyph: 8-bit coverage, top-left at (ix + x0, base + y0) where ix = floor of the glyph's x origin. */
export interface GlyphMask { x0: number; y0: number; w: number; h: number; a: Uint8Array }

const maskCache = new Map<string, GlyphMask>();
export const flashTypeStats = { masks: 0, maskHits: 0, maskMs: 0 };

/** GridFit: 1 pixel, 2 subpixel (others: like subpixel; GridFit none is not used by this SWF). */
function gridFitMap(g: FtGlyph, gridFit: number): { ax: number; bx: number; ay: number } {
  const sx = g.sizeX / 1024, sy = g.sizeY / 1024;
  const snap = gridFit === 1 ? Math.round : snapThird;
  const z = g.zone;
  let ax = sx, bx = g.pen, ay = sy;
  if (z) {
    const h = z[3] * sy;
    if (h > 0) ay = (sy * Math.floor(h + 0.8)) / h;
    const xz = g.pen + z[0] * sx;
    const a = snap(xz);
    const rr = z[2] * sx;
    if (rr > 0) {
      const r2 = snap(rr);
      if (r2 > 0) { ax = (sx * r2) / rr; bx = a - z[0] * ax; } else bx = g.pen + (a - xz);
    } else bx = g.pen + (a - xz);
  }
  return { ax, bx, ay };
}

/** The coverage mask of a glyph (cached) and its integer x origin. */
export function glyphMask(g: FtGlyph, gridFit: number): { ix: number; mask: GlyphMask } | null {
  if (!g.d) return null;
  const { ax, bx, ay } = gridFitMap(g, gridFit);
  const ix = Math.floor(bx + 1e-9);
  const phase = Math.round((bx - ix) * 48) / 48; // thirds and quarters are multiples of 1/12; 1/48 keeps sub-grid scales exact
  const light = isLightText(g.color[0], g.color[1], g.color[2], g.color[3]);
  const [cin, cout] = csmCutoffs(g.sizeY, g.hint, light);
  const key = `${g.key}|${g.sizeX}|${g.sizeY}|${gridFit}|${ax.toFixed(6)}|${ay.toFixed(6)}|${phase}|${cin.toFixed(4)}|${cout.toFixed(4)}`;
  let mask = maskCache.get(key);
  if (mask) { flashTypeStats.maskHits++; return { ix, mask }; }
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const o = glyphOutline(g.d);
  const R = Math.max(Math.abs(cin), Math.abs(cout)) + 0.01;
  const x0 = Math.floor(o.xMin * ax + phase - R) - 1, x1 = Math.ceil(o.xMax * ax + phase + R) + 1;
  const y0 = Math.floor(o.yMin * ay - R) - 1, y1 = Math.ceil(o.yMax * ay + R) + 1;
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  const df = distanceField(o, { ax, bx: phase, ay, by: 0 }, x0, y0, w, h, R);
  const a = new Uint8Array(w * h);
  for (let k = 0; k < a.length; k++) a[k] = Math.round(csmAlpha(df[k]!, cin, cout) * 255);
  mask = { x0, y0, w, h, a };
  if (maskCache.size > 20000) maskCache.clear();
  maskCache.set(key, mask);
  flashTypeStats.masks++;
  if (t0) flashTypeStats.maskMs += performance.now() - t0;
  return { ix, mask };
}

/** Integer clip rectangle (device px, half-open). */
export interface ClipRect { x0: number; y0: number; x1: number; y1: number }

/**
 * Composite glyphs into an RGBA (straight alpha, sRGB) buffer of w x h whose top-left device pixel is (ox, oy).
 * Overlapping glyphs blend over each other like Flash's per-glyph fills.
 */
export function compositeGlyphs(glyphs: readonly FtGlyph[], gridFit: number, out: Uint8ClampedArray, w: number, h: number, ox: number, oy: number, clip?: ClipRect): void {
  const cx0 = Math.max(0, (clip?.x0 ?? -Infinity) - ox), cy0 = Math.max(0, (clip?.y0 ?? -Infinity) - oy);
  const cx1 = Math.min(w, (clip?.x1 ?? Infinity) - ox), cy1 = Math.min(h, (clip?.y1 ?? Infinity) - oy);
  for (const g of glyphs) {
    const gm = glyphMask(g, gridFit);
    if (!gm) continue;
    const { ix, mask } = gm;
    const [cr, cg, cb] = g.color;
    const ca = g.color[3] / 255;
    const bx = ix + mask.x0 - ox, by = g.base + mask.y0 - oy;
    const xa = Math.max(cx0, bx), xb = Math.min(cx1, bx + mask.w);
    const ya = Math.max(cy0, by), yb = Math.min(cy1, by + mask.h);
    for (let y = ya; y < yb; y++) {
      let mi = (y - by) * mask.w + (xa - bx);
      let oi = (y * w + xa) * 4;
      for (let x = xa; x < xb; x++, mi++, oi += 4) {
        const m = mask.a[mi]!;
        if (!m) continue;
        const sa = (m / 255) * ca;
        const da = out[oi + 3]! / 255;
        const ra = sa + da * (1 - sa);
        if (ra <= 0) continue;
        // straight-alpha "source over"
        out[oi] = (cr * sa + out[oi]! * da * (1 - sa)) / ra;
        out[oi + 1] = (cg * sa + out[oi + 1]! * da * (1 - sa)) / ra;
        out[oi + 2] = (cb * sa + out[oi + 2]! * da * (1 - sa)) / ra;
        out[oi + 3] = ra * 255;
      }
    }
  }
}

/** Device bounds [x0, y0, x1, y1) covered by the glyphs (integer), or null. */
export function glyphsBounds(glyphs: readonly FtGlyph[], gridFit: number): ClipRect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) {
    const gm = glyphMask(g, gridFit);
    if (!gm) continue;
    const { ix, mask } = gm;
    x0 = Math.min(x0, ix + mask.x0); y0 = Math.min(y0, g.base + mask.y0);
    x1 = Math.max(x1, ix + mask.x0 + mask.w); y1 = Math.max(y1, g.base + mask.y0 + mask.h);
  }
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
}
