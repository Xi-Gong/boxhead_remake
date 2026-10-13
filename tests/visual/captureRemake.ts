/**
 * Capture the REMAKE's scenes (lane V, visual fidelity).
 *
 *   node tests/visual/captureRemake.ts                  # all scenes, 1x (640x480) and 2x (1280x960)
 *   node tests/visual/captureRemake.ts main room-01     # selected scenes
 *   node tests/visual/captureRemake.ts --no2x --headed
 *   node tests/visual/captureRemake.ts --legacy --no2x   # renderer without lane V's fixes -> out/remake-legacy/
 *
 * Starts a Vite dev server, opens `index.html?scene=<id>&scale=1&seed=1` in the installed Chrome (playwright-core,
 * channel 'chrome') at a 640x480 viewport / deviceScaleFactor 1 (canvas = 640x480 device px, BitmapData render scale
 * 1, so it is pixel comparable with the Flash Player reference), waits for window.__vis.ready (src/dev/scenes.ts:
 * scene reached and frozen) and screenshots the canvas -> tests/visual/out/remake/<scene>.png. The 2x pass
 * (viewport 1280x960, scale=2) writes tests/visual/out/remake2x/<scene>.png for a qualitative look.
 * The driver report of every scene goes to tests/visual/out/remake/manifest.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { createServer } from 'vite';
import { SCENES } from '../../src/dev/sceneList.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = resolve(ROOT, 'tests', 'visual', 'out');

interface Shot { scene: string; scale: number; ok: boolean; ms: number; error?: string; report?: Record<string, string>; png?: string }

const LEGACY = process.argv.includes('--legacy');

async function shoot(browser: Browser, base: string, scene: string, scale: 1 | 2): Promise<Shot> {
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 640 * scale, height: 480 * scale }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${base}index.html?scene=${scene}&scale=${scale}&seed=1${LEGACY ? '&legacyRender' : ''}`);
    await page.waitForFunction('window.__vis && window.__vis.ready === true', null, { timeout: 180_000, polling: 100 });
    await page.waitForTimeout(250); // a few rAFs: the frozen frame is presented
    const vis = await page.evaluate(() => (window as any).__vis);
    const gameErrors: string[] = await page.evaluate(() => (window as any).__game?.errors ?? []);
    const dir = join(OUT, (scale === 1 ? 'remake' : 'remake2x') + (LEGACY ? '-legacy' : ''));
    mkdirSync(dir, { recursive: true });
    const png = join(dir, `${scene}.png`);
    const canvas = page.locator('canvas.game-canvas');
    const box = await canvas.boundingBox();
    if (!box || Math.round(box.width) !== 640 * scale || Math.round(box.height) !== 480 * scale) {
      return { scene, scale, ok: false, ms: Date.now() - t0, error: `canvas box ${JSON.stringify(box)}` };
    }
    await page.screenshot({ path: png, clip: { x: box.x, y: box.y, width: 640 * scale, height: 480 * scale } });
    const error = vis.error ?? (errors.length || gameErrors.length ? [...errors, ...gameErrors].slice(0, 3).join(' | ') : undefined);
    return { scene, scale, ok: !vis.error, ms: Date.now() - t0, error, report: vis.report, png };
  } catch (e) {
    return { scene, scale, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 300) };
  } finally {
    await ctx.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const ids = args.filter((a) => !a.startsWith('--'));
  const scenes = ids.length ? SCENES.filter((s) => ids.includes(s.id)) : SCENES;
  if (ids.length && scenes.length !== ids.length) throw new Error(`unknown scene in ${ids.join(' ')}`);
  const scales: (1 | 2)[] = args.includes('--no2x') ? [1] : args.includes('--only2x') ? [2] : [1, 2];
  const server = await createServer({ root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), logLevel: 'warn',
    server: { port: 5199, strictPort: false, host: '127.0.0.1' } });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5199/';
  const browser = await chromium.launch({ channel: 'chrome', headless: !args.includes('--headed'),
    args: ['--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'] });
  const manifest: Record<string, Shot> = {};
  let failed = 0;
  try {
    for (const s of scenes) {
      for (const scale of scales) {
        const r = await shoot(browser, base, s.id, scale);
        manifest[`${s.id}@${scale}x`] = r;
        if (!r.ok) failed++;
        console.log(`${s.id.padEnd(16)} ${scale}x ${r.ok ? 'ok  ' : 'FAIL'} ${String(r.ms).padStart(6)} ms  ${r.error ?? ''}  ${r.report?.world ?? r.report?.screen ?? ''}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  mkdirSync(join(OUT, 'remake'), { recursive: true });
  writeFileSync(join(OUT, 'remake', 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  if (failed) { console.error(`${failed} capture(s) failed`); process.exitCode = 1; }
}

await main();
