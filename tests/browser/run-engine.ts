/**
 * Browser verification of the canvas-backed engine core (lane C).
 *
 *   node tests/browser/run-engine.ts [--headed] [--gpu]
 *
 * Starts a Vite dev server (port 5199, or the next free one), opens tests/browser/engine.html in the INSTALLED Chrome
 * via playwright-core (no browser download), waits for the page checks, prints a summary, and writes
 * generated/reports/engine/{results.json,summary.md,*.png}. Exit code 1 if any check fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

interface Result { name: string; pass: boolean; detail: string }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'generated/reports/engine');
const headed = process.argv.includes('--headed');
const gpu = process.argv.includes('--gpu');

const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'warn',
  server: { port: 5199, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5199/';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : [],
});
let exitCode = 0;
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}tests/browser/engine.html`);
  await page.waitForFunction(() => (window as unknown as { __engineDone?: boolean }).__engineDone === true, null, { timeout: 180_000 });
  const results = await page.evaluate(() => (window as unknown as { __engineResults: Result[] }).__engineResults);
  const snaps = await page.evaluate(() => (window as unknown as { __engineSnapshots: Record<string, string> }).__engineSnapshots);
  const perf = await page.evaluate(() => (window as unknown as { __enginePerf: Record<string, number> }).__enginePerf);
  const gpuInfo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });

  mkdirSync(outDir, { recursive: true });
  for (const [name, b64] of Object.entries(snaps)) writeFileSync(resolve(outDir, `${name}.png`), Buffer.from(b64, 'base64'));
  writeFileSync(resolve(outDir, 'results.json'), JSON.stringify({ results, perf, errors, gpuInfo }, null, 2));

  const failed = results.filter((r) => !r.pass);
  const lines = [
    `# Engine core browser checks`,
    ``,
    `${results.length - failed.length}/${results.length} passed (Chrome ${browser.version()}, ${headed ? 'headed' : 'headless'}, renderer: ${gpuInfo})`,
    ``,
    ...(failed.length ? ['## Failures', '', ...failed.map((f) => `- ${f.name}: ${f.detail}`), ''] : []),
    `## Performance (2x)`, '', ...Object.entries(perf).map(([k, v]) => `- ${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`), '',
    `Snapshots: ${Object.keys(snaps).map((n) => `${n}.png`).join(', ')}`,
  ];
  writeFileSync(resolve(outDir, 'summary.md'), lines.join('\n') + '\n');

  for (const f of failed) console.log(`FAIL ${f.name}: ${f.detail}`);
  if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
  console.log(`${results.length - failed.length}/${results.length} browser checks passed (renderer: ${gpuInfo})`);
  console.log('perf (2x):', JSON.stringify(perf));
  console.log(`report: ${resolve(outDir, 'summary.md')}`);
  if (failed.length || errors.length) exitCode = 1;
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
process.exit(exitCode);
