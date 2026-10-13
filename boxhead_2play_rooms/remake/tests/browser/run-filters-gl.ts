/**
 * GL filter backend vs CPU reference (lane P).
 *
 *   node tests/browser/run-filters-gl.ts [--headed]
 *
 * Starts a Vite dev server, opens tests/browser/filters-gl.html in the INSTALLED Chrome (playwright-core), waits for
 * the checks (synthetic buffers + library symbols, max channel difference <= 2) and prints a summary; writes
 * generated/reports/perf/filters-gl.json. Exit code 1 if any check fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

interface Result { name: string; pass: boolean; detail: string }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const headed = process.argv.includes('--headed');
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'warn',
  server: { port: 5196, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5196/';
const browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
let code = 0;
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`${base}tests/browser/filters-gl.html`);
  await page.waitForFunction(() => (window as unknown as { __glDone?: boolean }).__glDone === true, null, { timeout: 300_000 });
  const results = await page.evaluate(() => (window as unknown as { __glResults: Result[] }).__glResults);
  const perf = await page.evaluate(() => (window as unknown as { __glPerf: Record<string, number> }).__glPerf);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  const failed = results.filter((r) => !r.pass);
  for (const r of results) if (!r.pass || process.argv.includes('--verbose')) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`);
  console.log(`${results.length - failed.length}/${results.length} GL-vs-CPU checks passed (renderer: ${gpu})`);
  for (const [k, v] of Object.entries(perf)) console.log(`  ${k}: ${v.toFixed(2)}`);
  if (errors.length) console.log(`page messages:\n  ${errors.slice(0, 20).join('\n  ')}`);
  const out = resolve(root, 'generated/reports/perf');
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'filters-gl.json'), JSON.stringify({ gpu, results, perf, errors }, null, 2));
  if (failed.length || errors.some((e) => !e.startsWith('warning'))) code = 1;
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await server.close();
}
process.exit(code);
