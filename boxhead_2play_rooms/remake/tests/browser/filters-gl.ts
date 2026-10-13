/**
 * GL filter backend vs CPU reference (lane P). Loaded by tests/browser/filters-gl.html, driven by
 * tests/browser/run-filters-gl.ts (playwright-core + installed Chrome).
 *
 *  1. synthetic premultiplied buffers (random shapes / colours / alpha, every filter type and mode, quality 0..15,
 *     integer and fractional blur, offsets, device scales 1 / 2 / 1.37): glFilterPixels vs applyFiltersToPixels on
 *     the SAME input -> algorithmic agreement (max channel difference must be <= 2);
 *  2. real library symbols (Screen_Main, Screen_SelectWorld, Object.Wall, a ROOM floor, muzzle flash, Shot.Rocket,
 *     intro logo frames...): every filtered display object is rendered like the renderer does (padded canvas) and
 *     filtered (a) by the CPU (getImageData -> premultiply -> applyFiltersToPixels) and (b) by the GL path the renderer
 *     uses (canvas upload -> glFilterImage -> read back); max channel difference (premultiplied) must be <= 2;
 *  3. timings of both paths.
 * Results: window.__glResults (name, pass, detail), window.__glPerf, window.__glDone.
 */
import * as F from '../../src/engine/flash/filters.ts';
import { applyFiltersToPixels, filterPadding, type Pixels } from '../../src/engine/flash/filters/apply.ts';
import { cxToFixed, premultiplyInPlace } from '../../src/engine/flash/color.ts';
import { ColorTransform } from '../../src/engine/flash/geom.ts';
import { filterBackend, glFilterImage, glFilterPixels, glFilterStats, glReadOutput } from '../../src/engine/flash/filters/gl.ts';
import { applyCxToPixels } from '../../src/engine/flash/color.ts';
import { Library } from '../../src/engine/swf/Library.ts';
import { Player } from '../../src/engine/swf/Player.ts';
import { DisplayObject, MovieClip, destroyDetached, instantiateDetached } from '../../src/engine/swf/DisplayObject.ts';
import { renderObjectAt } from '../../src/engine/swf/render/renderer.ts';
import { mul, transformBounds, type M6 } from '../../src/engine/swf/mat.ts';

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
const perf: Record<string, number> = {};
const logEl = document.getElementById('log')!;
const TOL = 2;

function check(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
  logEl.textContent += `${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}\n`;
}

function maxDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number): { d: number; where: string; n: number } {
  let d = 0, where = '', n = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]! - b[i]!);
    if (v) n++;
    if (v > d) { d = v; const p = i >> 2; where = `(${p % w},${Math.floor(p / w)}) ch${i & 3} cpu=${a[i]} gl=${b[i]}`; }
  }
  return { d, where, n };
}

// ------------------------------------------------------------------------------------------------ synthetic

let seed = 12345;
const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (n: number): number => Math.floor(rnd() * n);

function synthetic(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  const shapes = 3 + ri(5);
  for (let s = 0; s < shapes; s++) {
    const x0 = ri(w), y0 = ri(h), sw = 2 + ri(w / 2), sh = 2 + ri(h / 2);
    const a = rnd() < 0.5 ? 255 : 1 + ri(255);
    const r = ri(256), g = ri(256), b = ri(256);
    const circle = rnd() < 0.5;
    for (let y = y0; y < Math.min(h, y0 + sh); y++) for (let x = x0; x < Math.min(w, x0 + sw); x++) {
      if (circle && ((x - x0 - sw / 2) ** 2 / (sw * sw / 4) + (y - y0 - sh / 2) ** 2 / (sh * sh / 4)) > 1) continue;
      const o = (y * w + x) * 4;
      data[o] = Math.round(r * a / 255); data[o + 1] = Math.round(g * a / 255); data[o + 2] = Math.round(b * a / 255); data[o + 3] = a;
    }
  }
  // a few isolated pixels / anti-aliased edges
  for (let k = 0; k < 40; k++) {
    const o = (ri(h) * w + ri(w)) * 4, a = ri(256);
    data[o] = ri(a + 1); data[o + 1] = ri(a + 1); data[o + 2] = ri(a + 1); data[o + 3] = a;
  }
  return { data, width: w, height: h };
}

const syntheticFilters = (): [string, F.BitmapFilter[]][] => [
  ['blur 4 q1', [new F.BlurFilter(4, 4, 1)]],
  ['blur 7 q3', [new F.BlurFilter(7, 7, 3)]],
  ['blur 2.5x6 q2', [new F.BlurFilter(2.5, 6, 2)]],
  ['blur 1.7x0.9 q1 (rollover)', [new F.BlurFilter(1.7213, 0.913, 1)]],
  ['blur 26.64 q2', [new F.BlurFilter(26.640625, 26.640625, 2)]],
  ['blur 4 q15', [new F.BlurFilter(4, 4, 15)]],
  ['blur 255 q1', [new F.BlurFilter(255, 3, 1)]],
  ['glow default', [new F.GlowFilter()]],
  ['glow XSI outline', [new F.GlowFilter(0, 1, 4, 4, 2, 1)]],
  ['glow white 14 str10 q3', [new F.GlowFilter(0xffffff, 1, 14, 14, 10, 3)]],
  ['glow inner', [new F.GlowFilter(0x00ff80, 0.7, 5, 3, 1.5, 2, true)]],
  ['glow knockout', [new F.GlowFilter(0xff0000, 1, 4, 4, 2, 1, false, true)]],
  ['glow inner knockout', [new F.GlowFilter(0xff0000, 1, 4, 4, 2, 1, true, true)]],
  ['drop default', [new F.DropShadowFilter()]],
  ['drop XSI hideObject', [new F.DropShadowFilter(0, 0, 0, 1, 4, 4, 0.25, 1, false, false, true)]],
  ['drop 2.7 @200 q3', [new F.DropShadowFilter(2.7, 200, 0x3366cc, 0.8, 3, 5, 1.3, 3)]],
  ['drop inner', [new F.DropShadowFilter(4, 45, 0xff0000, 1, 4, 4, 1, 1, true)]],
  ['drop knockout', [new F.DropShadowFilter(4, 45, 0xff0000, 1, 4, 4, 1, 1, false, true)]],
  ['drop rollover', [new F.DropShadowFilter(2.43, 311), new F.BlurFilter(1.37, 0.4)]],
  ['bevel room floor', [new F.BevelFilter(1, 228, 0xffffff, 1, 0, 1, 2, 2, 0.296875, 3, 'inner')]],
  ['bevel outer', [new F.BevelFilter(1, 219, 0xffffff, 1, 0, 1, 2, 2, 1.59765625, 3, 'outer')]],
  ['bevel full knockout', [new F.BevelFilter(2.5, 30, 0xff0000, 0.6, 0x0000ff, 1, 3, 3, 1, 1, 'full', true)]],
  ['gradient glow rocket', [new F.GradientGlowFilter(0, 342, [0xffff00, 0xffffff], [0, 1], [0, 210], 16, 16, 2.3984375, 1, 'outer')]],
  ['gradient glow 3 stops inner', [new F.GradientGlowFilter(3, 45, [0xff0000, 0x00ff00, 0x0000ff], [0, 1, 1], [0, 128, 255], 4, 4, 1, 1, 'inner')]],
  ['gradient glow full', [new F.GradientGlowFilter(2, 120, [0xff0000, 0x00ff00, 0x0000ff], [0.2, 1, 0.5], [0, 100, 255], 5, 2, 1.5, 2, 'full')]],
  ['color matrix brightness', [new F.ColorMatrixFilter([1, 0, 0, 0, 76, 0, 1, 0, 0, 76, 0, 0, 1, 0, 76, 0, 0, 0, 1, 0])]],
  ['color matrix gray + alpha', [new F.ColorMatrixFilter([0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 0.8, 10])]],
  ['chain glow+drop+blur', [new F.GlowFilter(0xffffff, 1, 6, 6, 4, 2), new F.DropShadowFilter(), new F.BlurFilter(2, 2, 1)]],
];

function runSynthetic(): void {
  const sizes: [number, number][] = [[64, 64], [97, 41], [300, 200]];
  for (const ds of [1, 2, 1.37]) {
    for (const [name, filters] of syntheticFilters()) {
      let worst = { d: 0, where: '', n: 0 }, bad = '';
      for (const [w, h] of sizes) {
        const src = synthetic(w, h);
        const cpu = applyFiltersToPixels(src, filters, ds);
        const gl = glFilterPixels(src, filters, ds);
        if (!gl) { bad = 'GL unavailable'; break; }
        const d = maxDiff(cpu.data, gl.data, w);
        if (d.d > worst.d) { worst = d; bad = `${w}x${h} ${d.where}`; }
      }
      check(`synthetic ds${ds}: ${name}`, bad !== 'GL unavailable' && worst.d <= TOL, `max ${worst.d}${worst.d ? ` at ${bad}` : ''}`);
    }
  }
  // colour transform + opaque present paths
  const src = synthetic(80, 60);
  const cx = cxToFixed(new ColorTransform(0.5, 1.2, 0.8, 0.7, 30, -20, 5, 0));
  const f = [new F.GlowFilter(0x00ff00, 1, 5, 5, 2, 1)];
  const cpu = applyFiltersToPixels(src, f, 2);
  applyCxToPixels(cpu, cx);
  const gl = glFilterPixels(src, f, 2, { cx });
  const d = gl ? maxDiff(cpu.data, gl.data, 80) : { d: 999, where: 'GL unavailable', n: 0 };
  check('present: colour transform', d.d <= TOL, `max ${d.d} ${d.where}`);
}

// ------------------------------------------------------------------------------------------------ library symbols

interface Filtered { o: DisplayObject; m: M6 }

function collectFiltered(o: DisplayObject, m: M6, out: Filtered[], depth = 0): void {
  if (depth > 30) return;
  const mm = depth === 0 ? m : mul(m, o.$m);
  if (o.$filters) out.push({ o, m: mm });
  const kids = o.$kids();
  if (kids) for (const k of kids) collectFiltered(k, mm, out, depth + 1);
}

function compareObject(name: string, o: DisplayObject, m0: M6, ds: number): { d: number; where: string; w: number; h: number; cpuMs: number; glMs: number } | null {
  const filters = o.$filters!;
  const m: M6 = { ...m0, tx: Math.round(m0.tx), ty: Math.round(m0.ty) };
  const lb = o.$boundsWith(null);
  if (!lb) return null;
  const db = transformBounds(m, lb);
  const pad = filterPadding(filters, ds);
  const X = Math.floor(db.xMin) - 1 - pad.left, Y = Math.floor(db.yMin) - 1 - pad.top;
  const W = Math.ceil(db.xMax) + 1 + pad.right - X, H = Math.ceil(db.yMax) + 1 + pad.bottom - Y;
  if (W <= 0 || H <= 0 || W * H > 4096 * 4096) return null;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  renderObjectAt(o, ctx, { ...m, tx: m.tx - X, ty: m.ty - Y }, ds, false);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let t = performance.now();
  const img = ctx.getImageData(0, 0, W, H);
  premultiplyInPlace(img.data);
  const cpu = applyFiltersToPixels({ data: img.data, width: W, height: H }, filters, ds);
  const cpuMs = performance.now() - t;
  // GL path as the renderer uses it: upload the canvas itself
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const ctx2 = c2.getContext('2d')!;
  // identical content (a second render could rasterise anti-aliased edges differently on a GPU canvas)
  ctx2.drawImage(c, 0, 0);
  t = performance.now();
  const out = glFilterImage(c2, 0, 0, W, H, filters, ds);
  const glMs = performance.now() - t;
  if (!out) { check(`symbol ${name}`, false, 'GL unavailable'); return null; }
  const gl = glReadOutput(W, H)!;
  const d = maxDiff(cpu.data, gl, W);
  return { d: d.d, where: d.where, w: W, h: H, cpuMs, glMs };
}

async function runSymbols(): Promise<void> {
  const lib = await Library.load('/assets');
  const player = new Player(lib, { renderScale: 2 });
  player.enterFrame();
  const symbols: [string, number[]][] = [
    ['Screen_Main', [1]], ['Screen_SelectWorld', [1]], ['Screen_LoadingWorld', [1]], ['SubScreen_Single', [1]], ['SubScreen_Coop', [1]],
    ['LevelIcons_Single', [1, 7]], ['Object.Wall', [1, 5]], ['ROOM_Single_0001', [1]], ['ROOM_Single_0008', [1]],
    ['Pistol.MuzzleFlash', [1, 2]], ['Shot.Rocket', [1]], ['Screen_Intro', [1, 60, 120, 200]], ['Hud.Message', [1]],
  ];
  let cpuTotal = 0, glTotal = 0, count = 0;
  for (const [link, frames] of symbols) {
    const id = lib.charIdForLinkage(link);
    if (id === undefined) { check(`symbol ${link}`, false, 'no such linkage'); continue; }
    for (const frame of frames) {
      const obj = instantiateDetached(id);
      if (!obj) continue;
      if (obj instanceof MovieClip && frame > 1) obj.gotoAndStop(frame);
      for (const ds of [2, 1]) {
        const list: Filtered[] = [];
        collectFiltered(obj, { a: ds, b: 0, c: 0, d: ds, tx: 0, ty: 0 }, list);
        let worst = 0, where = '', n = 0;
        for (const { o, m } of list) {
          const r = compareObject(link, o, m, ds);
          if (!r) continue;
          n++; cpuTotal += r.cpuMs; glTotal += r.glMs; count++;
          if (r.d > worst) { worst = r.d; where = `${o._name || o.$kind} ${r.w}x${r.h} ${r.where}`; }
        }
        check(`symbol ${link} f${frame} ds${ds} (${n} filtered objects)`, worst <= TOL, `max ${worst}${worst ? ' ' + where : ''}`);
      }
      destroyDetached(obj);
    }
  }
  perf['symbols: CPU filter ms (total)'] = cpuTotal;
  perf['symbols: GL filter ms (total, CPU-side)'] = glTotal;
  perf['symbols: filtered objects'] = count;
}

// ------------------------------------------------------------------------------------------------ timing

function runTiming(): void {
  const big = synthetic(1318, 998);
  const f = [new F.BlurFilter(7, 7, 3)];
  let t = performance.now();
  applyFiltersToPixels(big, f, 2);
  perf['CPU blur 7 q3 1318x998 @2x ms'] = performance.now() - t;
  glFilterPixels(big, f, 2); // warm-up (shader compile)
  t = performance.now();
  glFilterPixels(big, f, 2);
  perf['GL blur 7 q3 1318x998 @2x ms (incl. upload + readback)'] = performance.now() - t;
  const c = document.createElement('canvas');
  c.width = 1318; c.height = 998;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8af'; ctx.fillRect(100, 100, 900, 700);
  const probe = document.createElement('canvas');
  probe.width = 1; probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;
  t = performance.now();
  for (let i = 0; i < 10; i++) {
    const out = glFilterImage(c, 0, 0, 1318, 998, f, 2)!;
    ctx.drawImage(out, 0, 0, 1318, 998, 0, 0, 1318, 998);
  }
  perf['GL blur 7 q3 1318x998 canvas->canvas ms (CPU side, avg of 10)'] = (performance.now() - t) / 10;
  t = performance.now();
  pctx.drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1);
  pctx.getImageData(0, 0, 1, 1);
  perf['GPU sync after 10 runs ms'] = performance.now() - t;
  const small = synthetic(120, 160);
  const xsi = [new F.GlowFilter(0, 1, 4, 4, 2, 1)];
  t = performance.now();
  for (let i = 0; i < 100; i++) applyFiltersToPixels(small, xsi, 2);
  perf['CPU XSI glow 120x160 @2x ms (avg)'] = (performance.now() - t) / 100;
  const sc = document.createElement('canvas');
  sc.width = 120; sc.height = 160;
  sc.getContext('2d')!.fillRect(20, 20, 80, 120);
  const dstC = document.createElement('canvas');
  dstC.width = 120; dstC.height = 160;
  const dctx = dstC.getContext('2d')!;
  t = performance.now();
  for (let i = 0; i < 100; i++) {
    const out = glFilterImage(sc, 0, 0, 120, 160, xsi, 2)!;
    dctx.clearRect(0, 0, 120, 160);
    dctx.drawImage(out, 0, 0, 120, 160, 0, 0, 120, 160);
  }
  perf['GL XSI glow 120x160 canvas->canvas ms (CPU side, avg)'] = (performance.now() - t) / 100;
}

async function main(): Promise<void> {
  try {
    filterBackend.current = 'gl';
    runSynthetic();
    runTiming();
    await runSymbols();
    perf['gl passes'] = glFilterStats.passes;
    perf['gl fallbacks'] = glFilterStats.fallbacks;
    if (glFilterStats.lastError) check('no GL errors', false, glFilterStats.lastError);
  } catch (e) {
    check('exception', false, String(e instanceof Error ? e.stack : e));
  }
  (window as unknown as { __glResults: Result[] }).__glResults = results;
  (window as unknown as { __glPerf: Record<string, number> }).__glPerf = perf;
  (window as unknown as { __glDone: boolean }).__glDone = true;
}

void main();
