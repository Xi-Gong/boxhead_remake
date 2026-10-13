/**
 * Compare the remake's EFFECT scene captures with the original-game references (lane X2; twin of compare.ts).
 *
 *   node tests/visual/compareFx.ts [scene ...]
 *
 * Inputs: tests/visual/fx/reference/<scene>.png (tools/oracle/visual/captureFxRef.ts) and tests/visual/fx/remake/
 * <scene>.png (tests/visual/captureFxRemake.ts). pixelmatch (threshold 0.1, AA pixels ignored) -> <scene>-diff.png,
 * results.json and report.html in tests/visual/fx/. Numbers: `mismatch` % of all pixels; `masked` the same outside the
 * scene's expected-difference masks; `mae` mean absolute RGB difference. The two driver reports' world lines (tick,
 * shake, brightness) and LCG states must agree for a comparison to be meaningful; they are printed / reported.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { FX_SCENES, type FxSceneDef } from '../../src/dev/fxSceneList.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = resolve(ROOT, 'tests', 'visual', 'fx');
const W = 640, H = 480;

interface Result { scene: string; title: string; mismatch: number; masked: number; mae: number; missing?: string; refWorld?: string; remWorld?: string; lcg?: string }

const read = (p: string): PNG | null => {
  if (!existsSync(p)) return null;
  const img = PNG.sync.read(readFileSync(p));
  return img.width === W && img.height === H ? img : null;
};
const inMask = (s: FxSceneDef, x: number, y: number): boolean => (s.masks ?? []).some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);

function compare(s: FxSceneDef, refMan: any, remMan: any): Result {
  const base: Result = { scene: s.id, title: s.title, mismatch: NaN, masked: NaN, mae: NaN };
  base.refWorld = refMan?.[s.id]?.report?.world;
  base.remWorld = remMan?.[`${s.id}@1x`]?.report?.world;
  base.lcg = `${refMan?.[s.id]?.report?.lcg} / ${remMan?.[`${s.id}@1x`]?.report?.lcg}`;
  const ref = read(join(DIR, 'reference', `${s.id}.png`));
  const rem = read(join(DIR, 'remake', `${s.id}.png`));
  if (!ref || !rem) return { ...base, missing: !ref ? 'reference' : 'remake' };
  const diff = new PNG({ width: W, height: H });
  pixelmatch(ref.data, rem.data, diff.data, W, H, { threshold: 0.1, includeAA: false, alpha: 0.25, diffColor: [255, 0, 0], aaColor: [255, 220, 0] });
  let all = 0, masked = 0, abs = 0, n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const red = diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0;
      const m = inMask(s, x, y);
      if (red) { all++; if (!m) masked++; }
      if (!m) {
        abs += Math.abs(ref.data[i]! - rem.data[i]!) + Math.abs(ref.data[i + 1]! - rem.data[i + 1]!) + Math.abs(ref.data[i + 2]! - rem.data[i + 2]!);
        n += 3;
      }
    }
  }
  writeFileSync(join(DIR, `${s.id}-diff.png`), PNG.sync.write(diff));
  return { ...base, mismatch: (all * 100) / (W * H), masked: (masked * 100) / (W * H), mae: n ? abs / n : 0 };
}

const pct = (v: number): string => (Number.isNaN(v) ? '-' : `${v.toFixed(2)}%`);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function main(): void {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const scenes = ids.length ? FX_SCENES.filter((s) => ids.includes(s.id)) : FX_SCENES;
  mkdirSync(DIR, { recursive: true });
  const man = (p: string): any => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
  const refMan = man(join(DIR, 'reference', 'manifest.json'));
  const remMan = man(join(DIR, 'remake', 'manifest.json'));
  const resultsPath = join(DIR, 'results.json');
  const merged: Record<string, Result> = man(resultsPath);
  for (const s of scenes) {
    const r = compare(s, refMan, remMan);
    merged[s.id] = r;
    console.log(`${s.id.padEnd(22)} mismatch ${pct(r.mismatch).padStart(7)}  outside masks ${pct(r.masked).padStart(7)}  MAE ${Number.isNaN(r.mae) ? '-' : r.mae.toFixed(2)}${r.missing ? `  (missing ${r.missing})` : ''}`);
    if (r.refWorld !== r.remWorld) console.log(`   world differs: original ${r.refWorld}\n                  remake   ${r.remWorld}`);
    console.log(`   lcg ${r.lcg}`);
  }
  writeFileSync(resultsPath, JSON.stringify(merged, null, 1) + '\n');
  const all = FX_SCENES.map((s) => merged[s.id]).filter((r): r is Result => !!r);
  const rows = all.map((r) => `<section id="${r.scene}"><h2>${esc(r.scene)} <small>${esc(r.title)}</small></h2>
<p>mismatch <b>${pct(r.mismatch)}</b> &middot; outside masks <b>${pct(r.masked)}</b> &middot; MAE ${Number.isNaN(r.mae) ? '-' : r.mae.toFixed(2)}${r.missing ? ` &middot; <b>missing ${r.missing}</b>` : ''}<br>
<small>original: ${esc(String(r.refWorld))}<br>remake: ${esc(String(r.remWorld))}<br>LCG: ${esc(String(r.lcg))}</small></p>
<div class="row"><figure><img src="reference/${r.scene}.png"><figcaption>original (Flash Player 28)</figcaption></figure>
<figure><img src="remake/${r.scene}.png"><figcaption>remake 1x</figcaption></figure>
<figure><img src="${r.scene}-diff.png"><figcaption>diff (red = mismatch, yellow = AA)</figcaption></figure></div></section>`).join('\n');
  writeFileSync(join(DIR, 'report.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Effect fidelity report</title><style>
body{font:14px system-ui,sans-serif;background:#1b1b1b;color:#ddd;margin:16px}h2 small{color:#999;font-weight:normal}
.row{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0}figure img{width:640px;height:480px;image-rendering:pixelated;display:block;border:1px solid #444}
figcaption{color:#aaa;font-size:12px}b{color:#fff}</style></head><body><h1>Boxhead 2Play Rooms remake - effect fidelity</h1>
<p>Generated ${new Date().toISOString()} by tests/visual/compareFx.ts.</p>${rows}</body></html>`);
  console.log(`report: ${join(DIR, 'report.html')}`);
}

main();
