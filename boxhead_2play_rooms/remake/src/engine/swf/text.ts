/**
 * TextField text model (lane E): formatted spans, Flash-8 style minimal HTML, TextFormat merging and line layout.
 * Pure (no DOM) — glyph metrics come from a `TextEnv` supplied by the caller, so layout is unit-testable.
 *
 * Flash semantics modelled:
 *   - `text = s` replaces the whole content using the field's "new text format" (formats applied with
 *     setTextFormat are lost — that is why the game re-applies letterSpacing after setting text);
 *   - `htmlText = h` parses <p align>, <font face size color letterSpacing kerning>, <b>, <i>, <u>, <br>, entities;
 *     paragraphs become "\r" in `text`;
 *   - paragraph properties (align, margins, indent, leading) come from the first character of the paragraph;
 *   - layout: 2 px gutter on every side, line height = max ascent + max descent of the line's runs + leading,
 *     advances = glyph advance * size / 1024 + letterSpacing (+ kerning pairs when enabled), alignment inside
 *     (width - 4 - leftMargin - rightMargin), optional word wrap at spaces.
 */

export type Align = 'left' | 'right' | 'center' | 'justify';

/** Fully resolved character format. */
export interface TextFmt {
  font: string;
  size: number;
  color: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  url: string;
  target: string;
  align: Align;
  leftMargin: number;
  rightMargin: number;
  indent: number;
  leading: number;
  letterSpacing: number;
  kerning: boolean;
}

export const FMT_KEYS: (keyof TextFmt)[] = [
  'font', 'size', 'color', 'bold', 'italic', 'underline', 'url', 'target', 'align', 'leftMargin', 'rightMargin',
  'indent', 'leading', 'letterSpacing', 'kerning',
];

export interface Span { text: string; fmt: TextFmt }

export function defaultFmt(): TextFmt {
  return {
    font: 'Times New Roman', size: 12, color: 0, bold: false, italic: false, underline: false, url: '', target: '',
    align: 'left', leftMargin: 0, rightMargin: 0, indent: 0, leading: 0, letterSpacing: 0, kerning: false,
  };
}

const sameFmt = (a: TextFmt, b: TextFmt): boolean => {
  for (const k of FMT_KEYS) if (a[k] !== b[k]) return false;
  return true;
};

/** Merge adjacent spans with identical formats and drop empty ones (keeps at least one span). */
export function normalizeSpans(spans: Span[], fallback: TextFmt): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    if (s.text === '') continue;
    const last = out[out.length - 1];
    if (last && sameFmt(last.fmt, s.fmt)) last.text += s.text;
    else out.push({ text: s.text, fmt: { ...s.fmt } });
  }
  if (out.length === 0) out.push({ text: '', fmt: { ...(spans[0]?.fmt ?? fallback) } });
  return out;
}

export function spansText(spans: readonly Span[]): string {
  let s = '';
  for (const sp of spans) s += sp.text;
  return s;
}

/** Split spans so that a boundary exists at `index`; returns the span index starting at `index`. */
function splitAt(spans: Span[], index: number): number {
  let pos = 0;
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!;
    if (index === pos) return i;
    if (index < pos + s.text.length) {
      const cut = index - pos;
      spans.splice(i + 1, 0, { text: s.text.slice(cut), fmt: { ...s.fmt } });
      s.text = s.text.slice(0, cut);
      return i + 1;
    }
    pos += s.text.length;
  }
  return spans.length;
}

/** Apply a partial format to characters [begin, end). Paragraph properties extend to whole paragraphs (Flash). */
export function applyFormat(spans: Span[], begin: number, end: number, f: Partial<TextFmt>): Span[] {
  const text = spansText(spans);
  if (text.length === 0) {
    for (const s of spans) Object.assign(s.fmt, f);
    return spans;
  }
  begin = Math.max(0, Math.min(text.length, begin));
  end = Math.max(begin, Math.min(text.length, end));
  const para: Partial<TextFmt> = {};
  const chr: Partial<TextFmt> = {};
  for (const k of FMT_KEYS) {
    const v = f[k];
    if (v === undefined) continue;
    if (k === 'align' || k === 'leftMargin' || k === 'rightMargin' || k === 'indent' || k === 'leading') (para as any)[k] = v;
    else (chr as any)[k] = v;
  }
  if (Object.keys(para).length) {
    // extend to paragraph boundaries
    let pb = begin, pe = end;
    while (pb > 0 && !isBreak(text.charCodeAt(pb - 1))) pb--;
    while (pe < text.length && !isBreak(text.charCodeAt(pe))) pe++;
    if (pe < text.length) pe++;
    setRange(spans, pb, pe, para);
  }
  if (Object.keys(chr).length && end > begin) setRange(spans, begin, end, chr);
  return normalizeSpans(spans, spans[0]!.fmt);
}

function setRange(spans: Span[], begin: number, end: number, f: Partial<TextFmt>): void {
  if (end <= begin) return;
  const i0 = splitAt(spans, begin);
  const i1 = splitAt(spans, end);
  for (let i = i0; i < i1; i++) Object.assign(spans[i]!.fmt, f);
}

/** Common format of [begin, end): properties that differ are undefined (Flash getTextFormat). */
export function commonFormat(spans: readonly Span[], begin: number, end: number, fallback: TextFmt): Partial<TextFmt> {
  const text = spansText(spans);
  if (text.length === 0 || end <= begin) {
    // empty range: format of the character at begin (or the first span)
    let pos = 0;
    for (const s of spans) { if (begin < pos + s.text.length || s === spans[spans.length - 1]) return { ...s.fmt }; pos += s.text.length; }
    return { ...fallback };
  }
  let out: Partial<TextFmt> | null = null;
  let pos = 0;
  for (const s of spans) {
    const s0 = pos, s1 = pos + s.text.length;
    pos = s1;
    if (s1 <= begin || s0 >= end) continue;
    if (!out) { out = { ...s.fmt }; continue; }
    for (const k of FMT_KEYS) if (out[k] !== s.fmt[k]) delete out[k];
  }
  return out ?? { ...fallback };
}

/** Replace characters [begin, end) with `text` in format `fmt` (or the format at `begin` if omitted). */
export function replaceRange(spans: Span[], begin: number, end: number, text: string, fmt?: TextFmt): Span[] {
  const total = spansText(spans).length;
  begin = Math.max(0, Math.min(total, begin));
  end = Math.max(begin, Math.min(total, end));
  const f = fmt ?? (commonFormat(spans, begin, begin, spans[0]!.fmt) as TextFmt);
  const i0 = splitAt(spans, begin);
  const i1 = splitAt(spans, end);
  spans.splice(i0, i1 - i0, { text, fmt: { ...f } });
  return normalizeSpans(spans, f);
}

const isBreak = (c: number): boolean => c === 13 || c === 10;

// ------------------------------------------------------------------ HTML

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]!.toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

function parseColor(v: string): number | undefined {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(v.trim());
  if (!m) return undefined;
  let h = m[1]!;
  if (h.length === 3) h = h[0]! + h[0] + h[1] + h[1] + h[2] + h[2];
  return parseInt(h, 16);
}

/** Parse Flash HTML into spans. `base` is the field's default format. */
export function parseHtml(html: string, base: TextFmt, multiline = true): Span[] {
  const spans: Span[] = [];
  const stack: TextFmt[] = [{ ...base }];
  const top = (): TextFmt => stack[stack.length - 1]!;
  let paraOpen = false;
  let any = false;
  const push = (text: string): void => {
    if (!text) return;
    spans.push({ text, fmt: { ...top() } });
    any = true;
  };
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      // Flash ignores raw newlines in HTML text when the field is not condensing white space? It keeps them as breaks
      // only for multiline fields; single-line fields drop them.
      let t = decodeEntities(m[4]);
      if (!multiline) t = t.replace(/[\r\n]/g, '');
      else t = t.replace(/\r\n?|\n/g, '\r');
      push(t);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2]!.toLowerCase();
    const attrs = closing ? {} : parseAttrs(m[3] ?? '');
    switch (tag) {
      case 'p':
      case 'li':
      case 'textformat':
        if (closing) {
          if (tag === 'p' || tag === 'li') { push('\r'); paraOpen = false; }
          if (stack.length > 1) stack.pop();
        } else {
          if (tag === 'p' && paraOpen) push('\r');
          const f = { ...top() };
          if (attrs.align) {
            const a = attrs.align.toLowerCase();
            if (a === 'left' || a === 'right' || a === 'center' || a === 'justify') f.align = a;
          }
          if (tag === 'textformat') {
            if (attrs.leftmargin !== undefined) f.leftMargin = Number(attrs.leftmargin) || 0;
            if (attrs.rightmargin !== undefined) f.rightMargin = Number(attrs.rightmargin) || 0;
            if (attrs.indent !== undefined) f.indent = Number(attrs.indent) || 0;
            if (attrs.leading !== undefined) f.leading = Number(attrs.leading) || 0;
          }
          stack.push(f);
          if (tag === 'p') paraOpen = true;
        }
        break;
      case 'font': {
        if (closing) { if (stack.length > 1) stack.pop(); break; }
        const f = { ...top() };
        if (attrs.face) f.font = attrs.face;
        if (attrs.size !== undefined) {
          const sz = attrs.size.trim();
          const n = Number(sz);
          if (Number.isFinite(n)) f.size = /^[+-]/.test(sz) ? f.size + n : n;
        }
        if (attrs.color !== undefined) { const c = parseColor(attrs.color); if (c !== undefined) f.color = c; }
        if (attrs.letterspacing !== undefined) f.letterSpacing = Number(attrs.letterspacing) || 0;
        if (attrs.kerning !== undefined) f.kerning = attrs.kerning !== '0' && attrs.kerning.toLowerCase() !== 'false';
        stack.push(f);
        break;
      }
      case 'b': case 'i': case 'u': case 'a': {
        if (closing) { if (stack.length > 1) stack.pop(); break; }
        const f = { ...top() };
        if (tag === 'b') f.bold = true;
        else if (tag === 'i') f.italic = true;
        else if (tag === 'u') f.underline = true;
        else { f.url = attrs.href ?? ''; f.target = attrs.target ?? ''; }
        stack.push(f);
        break;
      }
      case 'br':
        if (!closing) push('\r');
        break;
      default:
        break; // unknown tags are ignored (Flash)
    }
  }
  void any;
  // Flash does not keep the paragraph break after the last paragraph.
  const last = spans[spans.length - 1];
  if (last && last.text.endsWith('\r')) {
    last.text = last.text.slice(0, -1);
  }
  return normalizeSpans(spans, base);
}

const hex6 = (n: number): string => '#' + (n & 0xffffff).toString(16).padStart(6, '0').toUpperCase();

/** Flash-style HTML serialisation (`htmlText` getter). */
export function toHtml(spans: readonly Span[]): string {
  const text = spansText(spans);
  const paras: { start: number; end: number }[] = [];
  let s = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || isBreak(text.charCodeAt(i))) { paras.push({ start: s, end: i }); s = i + 1; }
  }
  let out = '';
  for (const p of paras) {
    const pf = commonFormat(spans, p.start, p.start, spans[0]!.fmt) as TextFmt;
    out += `<P ALIGN="${(pf.align ?? 'left').toUpperCase()}">`;
    let pos = 0;
    let wrote = false;
    for (const sp of spans) {
      const a = Math.max(pos, p.start), b = Math.min(pos + sp.text.length, p.end);
      pos += sp.text.length;
      if (b <= a && !(p.start === p.end && !wrote && a === p.start)) continue;
      const f = sp.fmt;
      let inner = escapeHtml(text.slice(a, b));
      if (f.underline) inner = `<U>${inner}</U>`;
      if (f.italic) inner = `<I>${inner}</I>`;
      if (f.bold) inner = `<B>${inner}</B>`;
      out += `<FONT FACE="${escapeHtml(f.font)}" SIZE="${f.size}" COLOR="${hex6(f.color)}" LETTERSPACING="${f.letterSpacing}" KERNING="${f.kerning ? 1 : 0}">${inner}</FONT>`;
      wrote = true;
      if (p.start === p.end) break;
    }
    out += '</P>';
  }
  return out;
}

// ------------------------------------------------------------------ layout

/** Glyph metrics provider. All values in px for the given format. */
export interface TextEnv {
  /** Advance of `code` (px, without letterSpacing/kerning). */
  advance(fmt: TextFmt, code: number): number;
  /** Kerning adjustment between two codes (px). */
  kern(fmt: TextFmt, c1: number, c2: number): number;
  /** Ascent / descent (px) of the font of `fmt`. */
  metrics(fmt: TextFmt): { ascent: number; descent: number };
}

export interface LaidGlyph { code: number; x: number; adv: number; fmt: TextFmt; index: number }
export interface LaidLine {
  glyphs: LaidGlyph[];
  /** Line top (relative to the text area origin = field rect origin + 2 px gutter). */
  top: number;
  baseline: number;
  ascent: number;
  descent: number;
  leading: number;
  /** Left edge of the line content after alignment. */
  x: number;
  width: number;
  start: number;
  end: number;
}
export interface TextLayout { lines: LaidLine[]; textWidth: number; textHeight: number }

export interface LayoutOptions { width: number; wordWrap: boolean; multiline: boolean }

/** Lay out spans inside a field of `width` px (the field rect width; the 2 px gutters are subtracted here). */
export function layoutText(spans: readonly Span[], env: TextEnv, opt: LayoutOptions): TextLayout {
  // flatten to per-char formats
  const chars: { code: number; fmt: TextFmt; index: number }[] = [];
  let idx = 0;
  for (const s of spans) {
    for (let i = 0; i < s.text.length; i++) chars.push({ code: s.text.charCodeAt(i), fmt: s.fmt, index: idx++ });
  }
  const fallbackFmt = spans[0]?.fmt ?? defaultFmt();
  const lines: LaidLine[] = [];
  let y = 0;
  let textWidth = 0;
  // split into paragraphs
  let p0 = 0;
  const paras: [number, number][] = [];
  for (let i = 0; i <= chars.length; i++) {
    if (i === chars.length || isBreak(chars[i]!.code)) {
      paras.push([p0, i]);
      // CRLF counts as one break
      if (i < chars.length && chars[i]!.code === 13 && chars[i + 1]?.code === 10) i++;
      p0 = i + 1;
    }
  }
  for (const [a, b] of paras) {
    const pf = chars[a]?.fmt ?? (a > 0 ? chars[a - 1]!.fmt : fallbackFmt);
    const avail = opt.width - 4 - pf.leftMargin - pf.rightMargin;
    let lineStart = a;
    let first = true;
    while (true) {
      const indent = first ? pf.indent : 0;
      const maxW = avail - indent;
      // measure greedily
      let x = 0;
      let lastBreak = -1; // index after a space where we may break
      let end = b;
      const positions: number[] = [];
      for (let i = lineStart; i < b; i++) {
        const c = chars[i]!;
        const w = advanceOf(env, c.fmt, c.code, chars[i + 1] && i + 1 < b ? chars[i + 1]!.code : -1);
        if (opt.wordWrap && i > lineStart && x + w - c.fmt.letterSpacing > maxW && c.code !== 32) {
          end = lastBreak > lineStart ? lastBreak : i;
          break;
        }
        positions.push(x);
        x += w;
        if (c.code === 32) lastBreak = i + 1;
      }
      const glyphs: LaidGlyph[] = [];
      let width = 0;
      let asc = 0, desc = 0, lead = pf.leading;
      for (let i = lineStart; i < end; i++) {
        const c = chars[i]!;
        const px = positions[i - lineStart] ?? 0;
        const adv = advanceOf(env, c.fmt, c.code, chars[i + 1] && i + 1 < end ? chars[i + 1]!.code : -1);
        glyphs.push({ code: c.code, x: px, adv, fmt: c.fmt, index: c.index });
        const mt = env.metrics(c.fmt);
        if (mt.ascent > asc) asc = mt.ascent;
        if (mt.descent > desc) desc = mt.descent;
        if (c.code !== 32) width = px + adv - c.fmt.letterSpacing;
      }
      if (glyphs.length === 0) {
        const mt = env.metrics(pf);
        asc = mt.ascent; desc = mt.descent;
      }
      let lx = pf.leftMargin + indent;
      const slack = maxW - width;
      if (pf.align === 'right') lx += slack;
      else if (pf.align === 'center') lx += slack / 2;
      for (const g of glyphs) g.x += lx;
      lines.push({
        glyphs, top: y, baseline: y + asc, ascent: asc, descent: desc, leading: lead, x: lx, width,
        start: chars[lineStart]?.index ?? idx, end: end < chars.length ? chars[end]!.index : idx,
      });
      if (width > textWidth) textWidth = width;
      y += asc + desc + lead;
      first = false;
      if (end >= b || !opt.wordWrap) break;
      lineStart = end;
      // skip leading spaces of the continuation line
      while (lineStart < b && chars[lineStart]!.code === 32) lineStart++;
      if (lineStart >= b) break;
    }
    if (!opt.multiline) {
      // single-line fields still show every paragraph on its own line in Flash when text contains breaks;
      // keep laying out (Flash 8 behaviour for \r in dynamic single-line fields is to break the line).
    }
  }
  const last = lines[lines.length - 1];
  const textHeight = last ? last.top + last.ascent + last.descent : 0;
  return { lines, textWidth, textHeight };
}

function advanceOf(env: TextEnv, fmt: TextFmt, code: number, next: number): number {
  let w = env.advance(fmt, code) + fmt.letterSpacing;
  if (fmt.kerning && next >= 0) w += env.kern(fmt, code, next);
  return w;
}

/** Character index nearest to local x on a line (caret placement). */
export function caretIndexAt(line: LaidLine, x: number): number {
  for (const g of line.glyphs) if (x < g.x + g.adv / 2) return g.index;
  return line.glyphs.length ? line.glyphs[line.glyphs.length - 1]!.index + 1 : line.start;
}

/** Test whether `ch` passes an AS2 `restrict` pattern (e.g. "A-Z0-9", "^abc"). null = everything allowed. */
export function restrictAllows(restrict: string | null | undefined, ch: string): boolean {
  if (restrict === null || restrict === undefined) return true;
  if (restrict === '') return false;
  let allowed = false;
  let anyPositive = false;
  let negate = false;
  const r = restrict;
  for (let i = 0; i < r.length; i++) {
    let c = r[i]!;
    if (c === '^') { negate = !negate; continue; }
    if (c === '\\' && i + 1 < r.length) c = r[++i]!;
    let lo = c, hi = c;
    if (r[i + 1] === '-' && i + 2 < r.length) { hi = r[i + 2] === '\\' && i + 3 < r.length ? r[i + 3]! : r[i + 2]!; i += r[i + 2] === '\\' ? 3 : 2; }
    if (!negate) anyPositive = true;
    if (ch >= lo && ch <= hi) allowed = !negate;
  }
  if (!anyPositive && !allowed) {
    // only negative ranges: everything else allowed
    let blocked = false;
    negate = false;
    for (let i = 0; i < r.length; i++) {
      let c = r[i]!;
      if (c === '^') { negate = !negate; continue; }
      if (c === '\\' && i + 1 < r.length) c = r[++i]!;
      let lo = c, hi = c;
      if (r[i + 1] === '-' && i + 2 < r.length) { hi = r[i + 2]!; i += 2; }
      if (negate && ch >= lo && ch <= hi) blocked = true;
    }
    return !blocked;
  }
  return allowed;
}
