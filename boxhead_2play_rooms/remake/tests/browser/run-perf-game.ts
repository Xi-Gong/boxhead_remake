/**
 * Real-game performance probe for the filter pipeline (lane P).
 *
 *   node tests/browser/run-perf-game.ts [--backend=gl|cpu] [--scale=1|2] [--headed] [--profile=<phase>] [--electron]
 *
 * Starts a Vite dev server (or, with --electron, launches the built app from dist/ in Electron — run `npm run build`
 * first), opens the game at a 1280x960 viewport (presenter device scale 2, BitmapData render scale --scale, default 2)
 * and drives it through: intro -> main (first Screen_Main draw) -> menu rollover -> main->select(single) -> options
 * window -> select->main -> main->select(coop) -> room load -> 3 s in game. Every enterFrame / render is timed in the
 * page (performance.now around Player.enterFrame / Player.render); XSI RenderToBitmap and BitmapData.draw/applyFilter
 * calls are timed too. Prints a table and writes generated/reports/perf/<backend>-<scale>x[-electron].json.
 * --profile=<phase> records a CDP CPU profile for that phase and prints the top self-time functions.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron, chromium, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const backend = arg('backend', 'default');
const scale = Number(arg('scale', '2'));
const profilePhase = arg('profile', '');
const headed = process.argv.includes('--headed');
const useElectron = process.argv.includes('--electron');

interface Ev { t: number; d: number; s?: string; k?: string }
interface PerfLog { ef: Ev[]; render: Ev[]; xsi: Ev[]; draw: Ev[]; applyFilter: Ev[]; marks: Ev[] }

/** Installed before any page script: times Player.enterFrame/render and a few engine/game entry points. */
function instrument(): void {
  const w = window as unknown as { __perf: PerfLog; __game?: any };
  const log: PerfLog = { ef: [], render: [], xsi: [], draw: [], applyFilter: [], marks: [] };
  w.__perf = log;
  const now = (): number => performance.now();
  const wrapProto = (proto: any, name: string, out: Ev[], label?: (self: any, args: any[]) => string): void => {
    const f = proto?.[name];
    if (typeof f !== 'function' || f.__perfWrapped) return;
    const g = function (this: any, ...args: any[]): any {
      const t = now();
      try { return f.apply(this, args); } finally { out.push({ t, d: now() - t, k: label ? label(this, args) : undefined }); }
    };
    (g as any).__perfWrapped = true;
    proto[name] = g;
  };
  let game: any;
  Object.defineProperty(window, '__game', {
    configurable: true,
    get() { return game; },
    set(v: any) {
      game = v;
      let player: any;
      wrapProto(v.BitmapData?.prototype, 'draw', log.draw, (self, a) => `${self.width}x${self.height}<-${a[0]?._name ?? (a[0]?.width !== undefined ? 'bmd' : '?')}`);
      wrapProto(v.BitmapData?.prototype, 'applyFilter', log.applyFilter, (self, a) => `${self.width}x${self.height}:${a[3]?.kind}`);
      wrapProto(v.pkg?.DrawPrimitive?.XSI?.CDrawPrimitive_XSI_Animation?.prototype, 'RenderToBitmap', log.xsi);
      Object.defineProperty(v, 'player', {
        configurable: true, enumerable: true,
        get() { return player; },
        set(p: any) {
          player = p;
          const ef = p.enterFrame.bind(p), render = p.render.bind(p);
          p.enterFrame = (): void => {
            const t = now();
            try { ef(); } finally { log.ef.push({ t, d: now() - t, s: v.state?.() }); }
          };
          p.render = (ctx: any, s: number): void => {
            const t = now();
            try { render(ctx, s); } finally { log.render.push({ t, d: now() - t }); }
          };
        },
      });
    },
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(page: Page, fn: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(fn, null, { timeout, polling: 50 });
}
const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());

interface PhaseStat {
  phase: string; frames: number; efMax: number; efMean: number; renderMax: number; renderMean: number;
  frameMax: number; frameP95: number; efPerSec: number; xsiMs: number; xsiCalls: number; maxEfState?: string;
}

function stats(log: PerfLog, phase: string, t0: number, t1: number): PhaseStat {
  const ef = log.ef.filter((e) => e.t >= t0 && e.t < t1);
  const rd = log.render.filter((e) => e.t >= t0 && e.t < t1);
  // frame cost = EFs + render of one rAF: pair each render with the EFs since the previous render
  const frames: number[] = [];
  let acc = 0, ei = 0;
  for (const r of rd) {
    while (ei < ef.length && ef[ei]!.t < r.t) acc += ef[ei++]!.d;
    frames.push(acc + r.d);
    acc = 0;
  }
  const sorted = [...frames].sort((a, b) => a - b);
  const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const max = (a: number[]): number => (a.length ? Math.max(...a) : 0);
  const efD = ef.map((e) => e.d);
  const xs = log.xsi.filter((e) => e.t >= t0 && e.t < t1);
  const worst = ef.reduce<Ev | null>((m, e) => (!m || e.d > m.d ? e : m), null);
  return {
    phase, frames: rd.length, efMax: max(efD), efMean: mean(efD), renderMax: max(rd.map((r) => r.d)), renderMean: mean(rd.map((r) => r.d)),
    frameMax: max(frames), frameP95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0,
    efPerSec: t1 > t0 ? (ef.length * 1000) / (t1 - t0) : 0,
    xsiMs: xs.reduce((s, e) => s + e.d, 0), xsiCalls: xs.length, maxEfState: worst?.s,
  };
}

async function main(): Promise<void> {
  let server: ViteDevServer | null = null;
  let page: Page;
  let close: () => Promise<void>;
  const query = `?scale=${scale}${backend !== 'default' ? `&filterBackend=${backend}` : ''}`;
  if (useElectron) {
    const electronPath = createRequire(import.meta.url)('electron') as string;
    const app = await _electron.launch({ executablePath: electronPath, args: ['.'], cwd: root, timeout: 30_000,
      env: { ...process.env, BOXHEAD_START_PAGE: `index.html${query}` } as Record<string, string> });
    page = await app.firstWindow();
    await page.addInitScript(instrument);
    await page.reload();
    close = async () => { await app.close(); };
  } else {
    server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'warn',
      server: { port: 5198, strictPort: false, host: '127.0.0.1' } });
    await server.listen();
    const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5198/';
    const browser = await chromium.launch({ channel: 'chrome', headless: !headed,
      args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist'] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
    page = await ctx.newPage();
    await page.addInitScript(instrument);
    await page.goto(`${base}index.html${query}`);
    close = async () => { await browser.close(); await server!.close(); };
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = useElectron ? null : await page.context().newCDPSession(page);
  const phases: PhaseStat[] = [];
  let profileOut: string | null = null;

  const phase = async (name: string, run: () => Promise<void>): Promise<void> => {
    const prof = profilePhase === name && cdp;
    if (prof) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    const t0 = await now(page);
    await run();
    const t1 = await now(page);
    if (prof) {
      const { profile } = await cdp.send('Profiler.stop') as { profile: any };
      profileOut = summarizeProfile(profile);
    }
    const log = await page.evaluate(() => (window as unknown as { __perf: PerfLog }).__perf);
    const s = stats(log, name, t0, t1);
    phases.push(s);
    console.log(`${name.padEnd(22)} frames ${String(s.frames).padStart(4)}  EF max ${s.efMax.toFixed(1).padStart(7)} (${s.maxEfState ?? ''}) mean ${s.efMean.toFixed(2).padStart(6)}  render max ${s.renderMax.toFixed(1).padStart(6)} mean ${s.renderMean.toFixed(2).padStart(5)}  frame p95 ${s.frameP95.toFixed(1).padStart(6)} max ${s.frameMax.toFixed(1).padStart(7)}  EF/s ${s.efPerSec.toFixed(1)}  xsi ${s.xsiMs.toFixed(0)}ms/${s.xsiCalls}`);
  };
  const state = (): Promise<string | undefined> => page.evaluate(() => (window as any).__game?.state?.());
  /** Change screen like a menu button does (mcScreen.nState) and wait until the NEW screen finished its transition. */
  const go = async (st: string): Promise<void> => {
    await page.evaluate((st) => {
      const w = window as any;
      w.__prevScreen = w.__game.main().mcScreen;
      w.__prevScreen.nState = st;
    }, st);
    await waitFor(page, `(() => { const m = window.__game?.main?.(); return window.__game.state() === ${JSON.stringify(st)} && m.mcScreen !== window.__prevScreen && m.mcScreen?.mNormal === true; })()`);
  };

  try {
    await waitFor(page, 'window.__game && window.__game.ready === true', 120_000);
    const gpu = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : (gl ? 'webgl2 (no renderer info)' : 'no webgl2');
    });
    console.log(`backend=${backend} scale=${scale} ${useElectron ? 'electron' : 'chrome'} gpu=${gpu}`);
    await phase('intro', () => waitFor(page, "window.__game?.state?.() === 'State_Main'", 120_000));
    {
      // intro animation once the XSI background pre-render is done (steady state)
      const lg = await page.evaluate(() => (window as unknown as { __perf: PerfLog }).__perf);
      const lastXsi = lg.xsi.length ? lg.xsi[lg.xsi.length - 1]!.t + lg.xsi[lg.xsi.length - 1]!.d : 0;
      const introEf = lg.ef.filter((e) => e.s === 'State_Intro' && e.t > lastXsi);
      if (introEf.length > 1) {
        const st = stats(lg, 'intro (after XSI)', introEf[0]!.t, introEf[introEf.length - 1]!.t + 0.001);
        phases.push(st);
        console.log(`intro after XSI: frames ${st.frames} EF/s ${st.efPerSec.toFixed(1)} frame p95 ${st.frameP95.toFixed(1)} max ${st.frameMax.toFixed(1)} ms`);
      }
    }
    await phase('intro->main', () => waitFor(page, "window.__game.main().mcScreen?._name === '_Screen_Main' && window.__game.main().mcScreen.mNormal === true"));
    await phase('main idle', () => sleep(1500));
    // rollover on the first menu item
    const pos = await page.evaluate(() => {
      const mc = (window as any).__game.main().mcScreen.mcSinglePlay;
      const b = mc.getBounds((window as any).__game.player.root);
      return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
    });
    const canvasBox = await page.evaluate(() => {
      const c = document.querySelector('canvas.game-canvas') as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top, s: r.width / 640 };
    });
    await page.mouse.move(canvasBox.x + pos.x * canvasBox.s, canvasBox.y + pos.y * canvasBox.s);
    await phase('rollover', () => sleep(2000));
    await page.mouse.move(2, 2);
    await sleep(300);
    await phase('main->select', () => go('State_SelectWorld_Single'));
    await phase('options', async () => {
      await page.evaluate(() => { (window as any).__game.main().mcScreen.WindowOptions_Open(); });
      await sleep(600);
      await page.evaluate(() => { (window as any).__game.main().mcScreen.WindowOptions_Close(); });
      await sleep(300);
    });
    await phase('select->main', () => go('State_Main'));
    await phase('main->coop', () => go('State_SelectWorld_Coop'));
    await phase('coop->main', () => go('State_Main'));
    await phase('main->select2', () => go('State_SelectWorld_Single'));
    await phase('room load', async () => {
      await page.evaluate(() => { (window as any).__game.main().mcScreen.LoadLevel(0); });
      await waitFor(page, "window.__game?.state?.() === 'State_RunWorld'", 120_000);
    });
    await phase('in game', () => sleep(3000));
    const log = await page.evaluate(() => (window as unknown as { __perf: PerfLog }).__perf);
    const xsiTotal = log.xsi.reduce((s, e) => s + e.d, 0);
    const xsiApply = log.applyFilter.filter((e) => e.k?.endsWith(':glow')).reduce((s, e) => s + e.d, 0);
    console.log(`XSI RenderToBitmap total ${xsiTotal.toFixed(0)} ms over ${log.xsi.length} calls (glow applyFilter ${xsiApply.toFixed(0)} ms)`);
    const xs = log.xsi.map((e) => e.d).sort((x, y) => x - y);
    const pct = (p: number): number => xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * p))]! : 0;
    if (xs.length) console.log(`XSI per call: median ${pct(0.5).toFixed(2)} p90 ${pct(0.9).toFixed(2)} max ${pct(1).toFixed(1)} ms; span ${(log.xsi[log.xsi.length - 1]!.t - log.xsi[0]!.t).toFixed(0)} ms from first to last call`);
    const xsiDraw = log.draw.filter((d) => d.k?.includes('XSI_DI')).reduce((t, d) => t + d.d, 0);
    console.log(`XSI container BitmapData.draw total ${xsiDraw.toFixed(0)} ms`);
    const fst = await page.evaluate(async () => (await import('/src/engine/swf/render/renderer.ts' as string)).filterStats).catch(() => null);
    const gst = await page.evaluate(async () => (await import('/src/engine/flash/filters/gl.ts' as string)).glFilterStats).catch(() => null);
    console.log('renderer filterStats', JSON.stringify(fst), 'gl', JSON.stringify(gst));
    const draws = [...log.draw].sort((a, b) => b.d - a.d).slice(0, 8);
    console.log('slowest BitmapData.draw:', draws.map((d) => `${d.k} ${d.d.toFixed(1)}ms`).join(', '));
    if (profileOut) console.log(profileOut);
    if (errors.length) console.log(`page errors (${errors.length}):\n  ${errors.slice(0, 10).join('\n  ')}`);
    const outDir = resolve(root, 'generated/reports/perf');
    mkdirSync(outDir, { recursive: true });
    const file = resolve(outDir, `${backend}-${scale}x${useElectron ? '-electron' : ''}.json`);
    writeFileSync(file, JSON.stringify({ backend, scale, electron: useElectron, gpu, phases, xsiTotal, xsiCalls: log.xsi.length, errors }, null, 2));
    console.log(`report: ${file}  final state: ${await state()}`);
  } finally {
    await close();
  }
}

function summarizeProfile(profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number }[]; samples: number[]; timeDeltas: number[] }): string {
  const self = new Map<number, number>();
  for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i]!, (self.get(profile.samples[i]!) ?? 0) + (profile.timeDeltas[i] ?? 0));
  const byName = new Map<string, number>();
  let total = 0;
  for (const n of profile.nodes) {
    const t = self.get(n.id) ?? 0;
    total += t;
    const url = n.callFrame.url.split('/').pop()?.split('?')[0] ?? '';
    const key = `${n.callFrame.functionName || '(anon)'} ${url}:${n.callFrame.lineNumber + 1}`;
    byName.set(key, (byName.get(key) ?? 0) + t);
  }
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  return `CPU profile (${(total / 1000).toFixed(0)} ms sampled), top self time:\n` +
    top.map(([k, v]) => `  ${(v / 1000).toFixed(1).padStart(8)} ms  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');
}

await main();
process.exit(0);
