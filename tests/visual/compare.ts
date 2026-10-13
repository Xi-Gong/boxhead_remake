/**
 * Compare remake captures with the original-game references (lane V, visual fidelity).
 *
 *   node tests/visual/compare.ts [scene ...]
 *   node tests/visual/compare.ts --legacy   # captures of captureRemake.ts --legacy (renderer before lane V's fixes)
 *                                            # -> results-legacy.json, shown as "before" in report.html
 *
 * Inputs: tests/visual/reference/<scene>.png (tools/oracle/visual/captureRef.ts, real Flash Player 28) and
 * tests/visual/out/remake/<scene>.png (+ remake2x/) (tests/visual/captureRemake.ts).
 * Outputs: tests/visual/out/<scene>-diff.png (pixelmatch, threshold 0.1, anti-aliased pixels ignored),
 * tests/visual/out/report.html (side by side: reference | remake | diff | remake 2x), tests/visual/out/results.json
 * (results-legacy.json, when present, gives the "before lane V fixes" numbers shown next to each scene).
 * Two numbers per scene: `mismatch` = % of all 640x480 pixels pixelmatch flags; `masked` = the same with the scene's
 * EXPECTED regions (scope-hidden promo elements, see src/dev/sceneList.ts `masks`) excluded, i.e. what is left to
 * explain. `mae` = mean absolute RGB difference (0..255) over the unmasked pixels.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { SCENES, type SceneDef } from '../../src/dev/sceneList.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REF = resolve(ROOT, 'tests', 'visual', 'reference');
const OUT = resolve(ROOT, 'tests', 'visual', 'out');
const W = 640, H = 480;
/** --legacy: compare tests/visual/out/remake-legacy/ (captureRemake.ts --legacy) and write results-legacy.json only. */
const LEGACY = process.argv.includes('--legacy');

export interface SceneResult {
  scene: string;
  title: string;
  mismatch: number;
  masked: number;
  mae: number;
  missing?: string;
}

function read(p: string): PNG | null {
  if (!existsSync(p)) return null;
  const img = PNG.sync.read(readFileSync(p));
  return img.width === W && img.height === H ? img : null;
}

function inMask(scene: SceneDef, x: number, y: number): boolean {
  for (const m of scene.masks ?? []) if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return true;
  return false;
}

export function compareScene(scene: SceneDef): SceneResult {
  const base: SceneResult = { scene: scene.id, title: scene.title, mismatch: NaN, masked: NaN, mae: NaN };
  const ref = read(join(REF, `${scene.id}.png`));
  const rem = read(join(OUT, LEGACY ? 'remake-legacy' : 'remake', `${scene.id}.png`));
  if (!ref || !rem) return { ...base, missing: !ref ? 'reference' : 'remake' };
  const diff = new PNG({ width: W, height: H });
  pixelmatch(ref.data, rem.data, diff.data, W, H, { threshold: 0.1, includeAA: false, alpha: 0.25, diffColor: [255, 0, 0], aaColor: [255, 220, 0] });
  let all = 0, masked = 0, absSum = 0, n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const red = diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0;
      const m = inMask(scene, x, y);
      if (red) { all++; if (!m) masked++; }
      if (!m) {
        absSum += Math.abs(ref.data[i] - rem.data[i]) + Math.abs(ref.data[i + 1] - rem.data[i + 1]) + Math.abs(ref.data[i + 2] - rem.data[i + 2]);
        n += 3;
      }
      if (m) { diff.data[i + 2] = Math.min(255, diff.data[i + 2] + 90); } // tint masked regions blue
    }
  }
  writeFileSync(join(OUT, `${scene.id}-diff${LEGACY ? '-legacy' : ''}.png`), PNG.sync.write(diff));
  return { ...base, mismatch: (all * 100) / (W * H), masked: (masked * 100) / (W * H), mae: n ? absSum / n : 0 };
}

const pct = (v: number): string => (Number.isNaN(v) ? '-' : `${v.toFixed(2)}%`);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function html(results: SceneResult[], previous: Record<string, SceneResult> | null): string {
  const rows = results.map((r) => {
    const scene = SCENES.find((s) => s.id === r.scene)!;
    const prev = previous?.[r.scene];
    const notes = (scene.expected ?? []).map((e) => `<li>${esc(e)}</li>`).join('');
    return `<section>
<h2>${esc(r.scene)} <small>${esc(r.title)}</small></h2>
<p class="nums">mismatch <b>${pct(r.mismatch)}</b> &middot; outside expected masks <b>${pct(r.masked)}</b> &middot; MAE ${Number.isNaN(r.mae) ? '-' : r.mae.toFixed(2)}${prev && !Number.isNaN(prev.masked) ? ` &middot; before lane V fixes: ${pct(prev.mismatch)} / ${pct(prev.masked)}` : ''}${r.missing ? ` &middot; <b>missing ${r.missing}</b>` : ''}</p>
${notes ? `<ul class="notes">${notes}</ul>` : ''}
<div class="row">
<figure><img src="../reference/${r.scene}.png"><figcaption>original (Flash Player 28)</figcaption></figure>
<figure><img src="remake/${r.scene}.png"><figcaption>remake 1x</figcaption></figure>
<figure><img src="${r.scene}-diff.png"><figcaption>diff (red = mismatch, yellow = AA, blue = expected)</figcaption></figure>
<figure><img src="remake2x/${r.scene}.png" class="x2"><figcaption>remake 2x (scaled down)</figcaption></figure>
</div></section>`;
  }).join('\n');
  const table = results.map((r) => `<tr><td><a href="#${r.scene}">${esc(r.scene)}</a></td><td>${pct(r.mismatch)}</td><td>${pct(r.masked)}</td><td>${Number.isNaN(r.mae) ? '-' : r.mae.toFixed(2)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Visual fidelity report</title><style>
body{font:14px system-ui,sans-serif;background:#1b1b1b;color:#ddd;margin:16px}
h2{margin:24px 0 4px}h2 small{color:#999;font-weight:normal}
.row{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0}figure img{width:640px;height:480px;image-rendering:pixelated;display:block;border:1px solid #444}
figcaption{color:#aaa;font-size:12px}.nums b{color:#fff}.notes{color:#9c9;margin:4px 0}
table{border-collapse:collapse}td,th{border:1px solid #444;padding:2px 8px;text-align:right}td:first-child{text-align:left}
</style></head><body><h1>Boxhead 2Play Rooms remake - visual fidelity</h1>
<p>Generated ${new Date().toISOString()} by tests/visual/compare.ts.</p>
<table><tr><th>scene</th><th>mismatch</th><th>outside masks</th><th>MAE</th></tr>${table}</table>
${rows.replace(/<section>\n<h2>(\S+)/g, (m, id) => m.replace('<section>', `<section id="${id}">`))}
</body></html>`;
}

function main(): void {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const scenes = ids.length ? SCENES.filter((s) => ids.includes(s.id)) : SCENES;
  mkdirSync(OUT, { recursive: true });
  const resultsPath = join(OUT, LEGACY ? 'results-legacy.json' : 'results.json');
  const baselinePath = join(OUT, 'results-legacy.json');
  const merged: Record<string, SceneResult> = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : {};
  const previous: Record<string, SceneResult> | null = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
  const results = scenes.map(compareScene);
  for (const r of results) {
    merged[r.scene] = r;
    console.log(`${r.scene.padEnd(16)} mismatch ${pct(r.mismatch).padStart(7)}  outside masks ${pct(r.masked).padStart(7)}  MAE ${Number.isNaN(r.mae) ? '-' : r.mae.toFixed(2)}${r.missing ? `  (missing ${r.missing})` : ''}`);
  }
  writeFileSync(resultsPath, JSON.stringify(merged, null, 1) + '\n');
  if (LEGACY) return;
  const all = SCENES.map((s) => merged[s.id]).filter((r): r is SceneResult => !!r);
  writeFileSync(join(OUT, 'report.html'), html(all, previous));
  console.log(`report: ${join(OUT, 'report.html')}`);
}

main();
