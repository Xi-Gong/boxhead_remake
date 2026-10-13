/**
 * Basic SWF records (SWF File Format Specification v19, chapter "Basic Data Types" + filters/sound/button records).
 *
 * Unit conversions happen here, once:
 *   - RECT -> px (twips / 20)
 *   - MATRIX -> `Mat` with tx/ty in px (twips / 20); scale/rotate terms unchanged (16.16 fixed).
 *     `matrixAll20` divides all six terms by 20 (gradient + bitmap fill matrices, see assetSchema.ts).
 *   - CXFORM / CXFORMWITHALPHA -> multipliers / 256, offsets as stored.
 *   - Filters: blur/distance FIXED 16.16 (px), angle FIXED 16.16 (radians), strength FIXED8, passes = quality bits.
 */
import type { ByteReader } from './ByteReader.ts';
import type { ButtonRecord, CX, Filter, GradStop, Mat, Rect, RGBA, SoundInfo } from '../../src/shared/assetSchema.ts';

// ---------------------------------------------------------------- geometry

/** RECT in raw twips. */
export interface RectTwips { xMin: number; xMax: number; yMin: number; yMax: number }

export function readRectTwips(r: ByteReader): RectTwips {
  r.align();
  const n = r.ub(5);
  const xMin = r.sb(n), xMax = r.sb(n), yMin = r.sb(n), yMax = r.sb(n);
  r.align();
  return { xMin, xMax, yMin, yMax };
}

export function rectToPx(t: RectTwips): Rect {
  return { xMin: t.xMin / 20, yMin: t.yMin / 20, xMax: t.xMax / 20, yMax: t.yMax / 20 };
}

/** RECT -> px. */
export function readRect(r: ByteReader): Rect { return rectToPx(readRectTwips(r)); }

/** MATRIX with translation still in twips (a,b,c,d are the 16.16 terms; b = RotateSkew0, c = RotateSkew1). */
export interface MatrixTwips { a: number; b: number; c: number; d: number; tx: number; ty: number }

export function readMatrixTwips(r: ByteReader): MatrixTwips {
  r.align();
  let a = 1, d = 1, b = 0, c = 0;
  if (r.bit()) { const n = r.ub(5); a = r.fb(n); d = r.fb(n); }
  if (r.bit()) { const n = r.ub(5); b = r.fb(n); c = r.fb(n); }
  const n = r.ub(5);
  const tx = r.sb(n), ty = r.sb(n);
  r.align();
  return { a, b, c, d, tx, ty };
}

/** Display matrix: translation in px. */
export function matrixPx(m: MatrixTwips): Mat { return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx / 20, ty: m.ty / 20 }; }

/** Fill-space matrix (gradient / bitmap fills): all six components / 20. */
export function matrixAll20(m: MatrixTwips): Mat {
  return { a: m.a / 20, b: m.b / 20, c: m.c / 20, d: m.d / 20, tx: m.tx / 20, ty: m.ty / 20 };
}

export function readMatrix(r: ByteReader): Mat { return matrixPx(readMatrixTwips(r)); }

export const IDENTITY: Readonly<Mat> = Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

// ---------------------------------------------------------------- color

export function readRGB(r: ByteReader): RGBA { return [r.u8(), r.u8(), r.u8(), 255]; }
export function readRGBA(r: ByteReader): RGBA { return [r.u8(), r.u8(), r.u8(), r.u8()]; }
export function readARGB(r: ByteReader): RGBA { const a = r.u8(); return [r.u8(), r.u8(), r.u8(), a]; }

/** CXFORM (withAlpha=false, PlaceObject v1 / DefineButtonCxform) or CXFORMWITHALPHA. */
export function readCxform(r: ByteReader, withAlpha: boolean): CX {
  r.align();
  const hasAdd = r.bit(), hasMult = r.bit();
  const n = r.ub(4);
  const cx: CX = { rm: 1, gm: 1, bm: 1, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 };
  if (hasMult) {
    cx.rm = r.sb(n) / 256; cx.gm = r.sb(n) / 256; cx.bm = r.sb(n) / 256;
    if (withAlpha) cx.am = r.sb(n) / 256;
  }
  if (hasAdd) {
    cx.ra = r.sb(n); cx.ga = r.sb(n); cx.ba = r.sb(n);
    if (withAlpha) cx.aa = r.sb(n);
  }
  r.align();
  return cx;
}

// ---------------------------------------------------------------- gradients

const SPREAD = ['pad', 'reflect', 'repeat', 'pad'] as const; // 3 is reserved; Flash treats it as pad
const INTERP = ['rgb', 'linear', 'rgb', 'rgb'] as const;

export interface GradientInfo {
  spread: 'pad' | 'reflect' | 'repeat';
  interp: 'rgb' | 'linear';
  stops: GradStop[];
}

/** GRADIENT (and the common part of FOCALGRADIENT). Colors are RGB for DefineShape1/2, RGBA for 3/4. */
export function readGradient(r: ByteReader, rgba: boolean): GradientInfo {
  const flags = r.u8();
  const spread = SPREAD[flags >> 6];
  const interp = INTERP[(flags >> 4) & 3];
  const n = flags & 15;
  const stops: GradStop[] = [];
  for (let i = 0; i < n; i++) {
    const ratio = r.u8();
    stops.push({ r: ratio, c: rgba ? readRGBA(r) : readRGB(r) });
  }
  return { spread, interp, stops };
}

// ---------------------------------------------------------------- filters

/**
 * BEVEL COLOR ORDER — single source of truth.
 * The SWF spec lists ShadowColor first, then HighlightColor. Real Flash Player (and Ruffle's reader, which notes the
 * spec is wrong here) stores the HIGHLIGHT color first. We therefore emit `highlight` = first RGBA in the record and
 * `shadow` = second. To be verified against Flash Player screenshots (plan "风险与对策": Bevel 高光/阴影顺序).
 */
export const BEVEL_FIRST_COLOR_IS_HIGHLIGHT = true;

export const FILTER_TYPES = ['dropShadow', 'blur', 'glow', 'bevel', 'gradientGlow', 'convolution', 'colorMatrix', 'gradientBevel'] as const;

export function readFilterList(r: ByteReader): Filter[] {
  const n = r.u8();
  const out: Filter[] = [];
  for (let i = 0; i < n; i++) out.push(readFilter(r));
  return out;
}

export function readFilter(r: ByteReader): Filter {
  const type = r.u8();
  switch (type) {
    case 0: { // DropShadow
      const color = readRGBA(r);
      const blurX = r.fixed(), blurY = r.fixed(), angle = r.fixed(), distance = r.fixed();
      const strength = r.fixed8();
      const inner = r.bit(), knockout = r.bit(), composite = r.bit();
      const passes = r.ub(5);
      return { t: 'dropShadow', color, blurX, blurY, angle, distance, strength, inner, knockout, hideObject: !composite, passes };
    }
    case 1: { // Blur
      const blurX = r.fixed(), blurY = r.fixed();
      const passes = r.ub(5); r.ub(3);
      return { t: 'blur', blurX, blurY, passes };
    }
    case 2: { // Glow
      const color = readRGBA(r);
      const blurX = r.fixed(), blurY = r.fixed();
      const strength = r.fixed8();
      const inner = r.bit(), knockout = r.bit(); r.bit(); // CompositeSource (always 1)
      const passes = r.ub(5);
      return { t: 'glow', color, blurX, blurY, strength, inner, knockout, passes };
    }
    case 3: { // Bevel
      const c1 = readRGBA(r), c2 = readRGBA(r);
      const [highlight, shadow] = BEVEL_FIRST_COLOR_IS_HIGHLIGHT ? [c1, c2] : [c2, c1];
      const blurX = r.fixed(), blurY = r.fixed(), angle = r.fixed(), distance = r.fixed();
      const strength = r.fixed8();
      const inner = r.bit(), knockout = r.bit(); r.bit(); // CompositeSource
      const onTop = r.bit();
      const passes = r.ub(4);
      return { t: 'bevel', highlight, shadow, blurX, blurY, angle, distance, strength, inner, knockout, onTop, passes };
    }
    case 4: case 7: { // GradientGlow / GradientBevel
      const n = r.u8();
      const colors: RGBA[] = [];
      for (let i = 0; i < n; i++) colors.push(readRGBA(r));
      const ratios: number[] = [];
      for (let i = 0; i < n; i++) ratios.push(r.u8());
      const blurX = r.fixed(), blurY = r.fixed(), angle = r.fixed(), distance = r.fixed();
      const strength = r.fixed8();
      const inner = r.bit(), knockout = r.bit(); r.bit(); // CompositeSource
      const onTop = r.bit();
      const passes = r.ub(4);
      return { t: type === 4 ? 'gradientGlow' : 'gradientBevel', colors, ratios, blurX, blurY, angle, distance, strength, inner, knockout, onTop, passes };
    }
    case 5: { // Convolution
      const matrixX = r.u8(), matrixY = r.u8();
      const divisor = r.f32(), bias = r.f32();
      const m: number[] = [];
      for (let i = 0; i < matrixX * matrixY; i++) m.push(r.f32());
      const color = readRGBA(r);
      r.ub(6);
      const clamp = r.bit(), preserveAlpha = r.bit();
      return { t: 'convolution', matrixX, matrixY, divisor, bias, m, color, clamp, preserveAlpha };
    }
    case 6: { // ColorMatrix
      const m: number[] = [];
      for (let i = 0; i < 20; i++) m.push(r.f32());
      return { t: 'colorMatrix', m };
    }
    default:
      throw new Error(`Unknown filter type ${type} at ${r.pos - 1}`);
  }
}

// ---------------------------------------------------------------- clip actions

export interface ClipActionRecord {
  /** ClipEventFlags (UI32 for SWF6+). */
  events: number;
  keyCode?: number;
  /** Offset/length of the action bytes in the reader's buffer. */
  offset: number;
  length: number;
}

/** CLIPACTIONS: parsed only to locate the action blocks (bytecode is not exported). */
export function readClipActions(r: ByteReader, swfVersion: number): ClipActionRecord[] {
  const wide = swfVersion >= 6;
  r.u16(); // reserved
  if (wide) r.u32(); else r.u16(); // AllEventFlags
  const out: ClipActionRecord[] = [];
  for (;;) {
    const events = wide ? r.u32() : r.u16();
    if (events === 0) break;
    let size = r.u32();
    let keyCode: number | undefined;
    if (events & 0x00020000 && wide) { keyCode = r.u8(); size -= 1; } // ClipEventKeyPress
    const offset = r.pos;
    r.bytes(size);
    out.push({ events, keyCode, offset, length: size });
  }
  return out;
}

// ---------------------------------------------------------------- sound

export function readSoundInfo(r: ByteReader): SoundInfo {
  const flags = r.u8();
  const info: SoundInfo = {};
  if (flags & 0x20) info.stop = true;
  if (flags & 0x10) info.noMultiple = true;
  const hasEnvelope = !!(flags & 0x08), hasLoops = !!(flags & 0x04), hasOut = !!(flags & 0x02), hasIn = !!(flags & 0x01);
  if (hasIn) info.inPoint = r.u32();
  if (hasOut) info.outPoint = r.u32();
  if (hasLoops) info.loops = r.u16();
  if (hasEnvelope) {
    const n = r.u8();
    info.envelope = [];
    for (let i = 0; i < n; i++) info.envelope.push({ pos44: r.u32(), left: r.u16(), right: r.u16() });
  }
  return info;
}

// ---------------------------------------------------------------- buttons

/**
 * BUTTONRECORD list terminated by CharacterEndFlag (0). `v2` = DefineButton2 (records carry a CXFORMWITHALPHA).
 * Filters / blend mode are only present when their flags are set (SWF8+).
 */
export function readButtonRecords(r: ByteReader, v2: boolean): ButtonRecord[] {
  const out: ButtonRecord[] = [];
  for (;;) {
    const flags = r.u8();
    if (flags === 0) break;
    const rec: ButtonRecord = {
      up: !!(flags & 0x01), over: !!(flags & 0x02), down: !!(flags & 0x04), hit: !!(flags & 0x08),
      id: r.u16(), depth: r.u16(), m: readMatrix(r),
    };
    if (v2) rec.cx = readCxform(r, true);
    if (v2 && flags & 0x10) rec.filters = readFilterList(r);
    if (v2 && flags & 0x20) rec.blend = r.u8();
    out.push(rec);
  }
  return out;
}
