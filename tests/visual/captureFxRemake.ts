/**
 * Capture the REMAKE's EFFECT scenes (lane X2; twin of captureRemake.ts, lane V).
 *
 *   node tests/visual/captureFxRemake.ts                     # all scenes of src/dev/fxSceneList.ts, 1x
 *   node tests/visual/captureFxRemake.ts fx-muzzle --2x      # + a 2x capture (qualitative)
 *
 * Vite dev server + the installed Chrome (playwright-core, channel 'chrome', HEADLESS - no window), 640x480 viewport,
 * `index.html?fxscene=<id>&scale=1&seed=1`; waits for window.__vis.ready (src/dev/fxScenes.ts) and screenshots the
 * canvas -> tests/visual/fx/remake/<scene>.png (+ remake2x/), driver reports -> tests/visual/fx/remake/manifest.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { createServer } from 'vite';
import { FX_SCENES } from '../../src/dev/fxSceneList.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FX_OUT = resolve(ROOT, 'tests', 'visual', 'fx');

interface Shot { scene: string; scale: number; ok: boolean; ms: number; error?: string; report?: Record<string, string>; png?: string }

async function shoot(browser: Browser, base: string, scene: string, scale: 1 | 2): Promise<Shot> {
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 640 * scale, height: 480 * scale }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${base}index.html?fxscene=${scene}&scale=${scale}&seed=1`);
    await page.waitForFunction('window.__vis && window.__vis.ready === true', null, { timeout: 240_000, polling: 100 });
    await page.waitForTimeout(250);
    const vis = await page.evaluate(() => (window as any).__vis);
    const gameErrors: string[] = await page.evaluate(() => (window as any).__game?.errors ?? []);
    const dir = join(FX_OUT, scale === 1 ? 'remake' : 'remake2x');
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
  const scenes = ids.length ? FX_SCENES.filter((s) => ids.includes(s.id)) : FX_SCENES;
  if (ids.length && scenes.length !== ids.length) throw new Error(`unknown scene in ${ids.join(' ')}`);
  const scales: (1 | 2)[] = args.includes('--2x') ? [1, 2] : [1];
  const server = await createServer({
    root: ROOT, configFile: resolve(ROOT, 'vite.config.ts'), logLevel: 'warn',
    server: { port: 5299, strictPort: false, host: '127.0.0.1' },
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5299/';
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--force-color-profile=srgb'],
  });
  const manifest: Record<string, Shot> = {};
  let failed = 0;
  try {
    for (const s of scenes) {
      for (const scale of scales) {
        const r = await shoot(browser, base, s.id, scale);
        manifest[`${s.id}@${scale}x`] = r;
        if (!r.ok) failed++;
        console.log(`${s.id.padEnd(22)} ${scale}x ${r.ok ? 'ok  ' : 'FAIL'} ${String(r.ms).padStart(6)} ms  ${r.error ?? ''}  ${r.report?.world ?? r.report?.screen ?? ''}  lcg=${r.report?.lcg}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  mkdirSync(join(FX_OUT, 'remake'), { recursive: true });
  writeFileSync(join(FX_OUT, 'remake', 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  if (failed) { console.error(`${failed} capture(s) failed`); process.exitCode = 1; }
}

await main();
