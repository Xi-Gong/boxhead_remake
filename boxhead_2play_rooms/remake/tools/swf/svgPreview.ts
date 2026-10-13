/**
 * Visual sanity check: render library characters to standalone SVG files (frame 1, no filters / blend modes,
 * color transforms approximated by opacity). Masks (clipDepth) become SVG clip paths.
 *
 *   node tools/swf/svgPreview.ts [--lib public/assets/library.json] [--out generated/reports/svg] <id|linkage>...
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { FillStyle, LibraryJson, LineStyle, Mat, MorphDef, Rect, RGBA } from '../../src/shared/assetSchema.ts';
import { charBounds, displayListAt } from './bounds.ts';
import { ASSETS_OUT, GENERATED, isMain } from '../paths.ts';

const col = (c: RGBA) => `rgb(${c[0]},${c[1]},${c[2]})`;
const op = (c: RGBA) => (c[3] === 255 ? '' : ` fill-opacity="${(c[3] / 255).toFixed(3)}"`);
const mat = (m: Mat) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`;

export class SvgRenderer {
  private defs: string[] = [];
  private uid = 0;
  readonly lib: LibraryJson;
  readonly assetsHref: string;
  constructor(lib: LibraryJson, assetsHref: string) { this.lib = lib; this.assetsHref = assetsHref; }

  private paint(f: FillStyle): string {
    if (f.t === 'solid') return `fill="${col(f.c)}"${op(f.c)}`;
    const id = `p${this.uid++}`;
    if (f.t === 'bitmap') {
      const b = this.lib.chars[f.bitmapId];
      if (!b || b.t !== 'bitmap') return 'fill="magenta"';
      this.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${b.w}" height="${b.h}" patternTransform="${mat(f.m)}"><image href="${this.assetsHref}/${b.file}" width="${b.w}" height="${b.h}"/></pattern>`);
      return `fill="url(#${id})"`;
    }
    const stops = f.stops.map((s) => `<stop offset="${(s.r / 255).toFixed(4)}" stop-color="${col(s.c)}" stop-opacity="${(s.c[3] / 255).toFixed(3)}"/>`).join('');
    const spread = f.spread === 'pad' ? 'pad' : f.spread === 'reflect' ? 'reflect' : 'repeat';
    if (f.t === 'linear') this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-16384" y1="0" x2="16384" y2="0" spreadMethod="${spread}" gradientTransform="${mat(f.m)}">${stops}</linearGradient>`);
    else this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="16384" fx="${(f.focal ?? 0) * 16384}" fy="0" spreadMethod="${spread}" gradientTransform="${mat(f.m)}">${stops}</radialGradient>`);
    return `fill="url(#${id})"`;
  }

  private stroke(l: LineStyle): string {
    const paint = l.fill ? this.paint(l.fill).replace(/^fill=/, 'stroke=').replace('fill-opacity', 'stroke-opacity') : `stroke="${col(l.c!)}"${l.c![3] === 255 ? '' : ` stroke-opacity="${(l.c![3] / 255).toFixed(3)}"`}`;
    const cap = l.startCap === 'none' ? 'butt' : l.startCap ?? 'round';
    const w = l.w === 0 ? '1" vector-effect="non-scaling-stroke' : String(l.w);
    return `fill="none" ${paint} stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="${l.join ?? 'round'}"${l.miter ? ` stroke-miterlimit="${l.miter}"` : ''}`;
  }

  private morphD(cmd: string, a: number[]): string {
    let d = '', k = 0;
    for (const c of cmd) {
      const n = c === 'Q' ? 4 : c === 'Z' ? 0 : 2;
      d += c + a.slice(k, k + n).join(' ');
      k += n;
    }
    return d;
  }

  render(id: number, ratio = 0, depth = 0): string {
    const c = this.lib.chars[id];
    if (!c || depth > 40) return '';
    switch (c.t) {
      case 'shape':
        return c.layers.map((l) =>
          l.fills.map((f) => `<path fill-rule="evenodd" ${this.paint(l.fillStyles[f.s])} d="${f.d}"/>`).join('') +
          l.strokes.map((s) => `<path ${this.stroke(l.lineStyles[s.s])} d="${s.d}"/>`).join('')).join('');
      case 'morph': {
        const m = c as MorphDef;
        return m.layers.map((l) =>
          l.fills.map((f) => `<path fill-rule="evenodd" ${this.paint(l.fillStyles[f.s][ratio > 32767 ? 1 : 0])} d="${this.morphD(f.cmd, ratio > 32767 ? f.b : f.a)}"/>`).join('') +
          l.strokes.map((s) => `<path ${this.stroke(l.lineStyles[s.s][0])} d="${this.morphD(s.cmd, ratio > 32767 ? s.b : s.a)}"/>`).join('')).join('');
      }
      case 'bitmap':
        return `<image href="${this.assetsHref}/${c.file}" width="${c.w}" height="${c.h}"/>`;
      case 'text': {
        let out = `<g transform="${mat(c.m)}">`;
        for (const r of c.records) {
          const font = this.lib.chars[r.fontId];
          if (!font || font.t !== 'font') continue;
          let x = r.x;
          for (const g of r.glyphs) {
            out += `<path fill="${col(r.color)}"${op(r.color)} transform="translate(${x} ${r.y}) scale(${r.height / 1024})" d="${font.glyphs[g.i]?.d ?? ''}"/>`;
            x += g.adv;
          }
        }
        return out + '</g>';
      }
      case 'edit': {
        const b = c.bounds, txt = (c.initialText ?? '').replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return `<rect x="${b.xMin}" y="${b.yMin}" width="${b.xMax - b.xMin}" height="${b.yMax - b.yMin}" fill="none" stroke="#0aa" stroke-dasharray="2 2" stroke-width="0.5"/>` +
          `<text x="${b.xMin + 2}" y="${b.yMin + (c.height ?? 12)}" font-size="${c.height ?? 12}" fill="${c.color ? col(c.color) : '#000'}" font-family="sans-serif">${txt}</text>`;
      }
      case 'button':
        return c.records.filter((r) => r.up).sort((x, y) => x.depth - y.depth).map((r) => `<g transform="${mat(r.m)}">${this.render(r.id, 0, depth + 1)}</g>`).join('');
      case 'sprite': {
        const list = displayListAt(c, 1);
        let out = '';
        let clipEnd = -1, open = false;
        for (const e of list) {
          if (open && e.depth > clipEnd) { out += '</g>'; open = false; }
          const alpha = e.cx ? Math.max(0, Math.min(1, e.cx.am + e.cx.aa / 255)) : 1;
          const inner = `<g transform="${mat(e.m)}"${alpha < 1 ? ` opacity="${alpha.toFixed(3)}"` : ''}>${this.render(e.id, e.ratio ?? 0, depth + 1)}</g>`;
          if (e.clipDepth) {
            const id2 = `c${this.uid++}`;
            this.defs.push(`<clipPath id="${id2}">${inner}</clipPath>`);
            if (open) out += '</g>';
            out += `<g clip-path="url(#${id2})">`;
            open = true; clipEnd = e.clipDepth;
            continue;
          }
          out += inner;
        }
        return out + (open ? '</g>' : '');
      }
      default:
        return '';
    }
  }

  /** Full SVG document for a character, framed by its bounds (+ margin), scaled by `scale`. */
  document(id: number, scale = 1, background = '#7f7f7f'): string {
    this.defs = [];
    const body = this.render(id);
    const b: Rect = charBounds(this.lib, id) ?? { xMin: 0, yMin: 0, xMax: 100, yMax: 100 };
    const m = 4, w = b.xMax - b.xMin + 2 * m, h = b.yMax - b.yMin + 2 * m;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * scale).toFixed(1)}" height="${(h * scale).toFixed(1)}" viewBox="${b.xMin - m} ${b.yMin - m} ${w} ${h}">` +
      `<rect x="${b.xMin - m}" y="${b.yMin - m}" width="${w}" height="${h}" fill="${background}"/><defs>${this.defs.join('')}</defs>${body}</svg>`;
  }
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const take = (name: string) => { const i = argv.indexOf(name); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const libPath = resolve(take('--lib') ?? join(ASSETS_OUT, 'library.json'));
  const outDir = resolve(take('--out') ?? join(GENERATED, 'reports', 'svg'));
  const scale = Number(take('--scale') ?? 1);
  const lib = JSON.parse(readFileSync(libPath, 'utf8')) as LibraryJson;
  mkdirSync(outDir, { recursive: true });
  const r = new SvgRenderer(lib, relative(outDir, resolve(libPath, '..')).replace(/\\/g, '/'));
  for (const a of argv) {
    const id = /^\d+$/.test(a) ? Number(a) : lib.exports[a];
    if (id === undefined || !lib.chars[id]) { console.error(`unknown character ${a}`); continue; }
    const file = join(outDir, `${id}.svg`);
    writeFileSync(file, r.document(id, scale));
    console.log(`${a} -> ${file}`);
  }
}
