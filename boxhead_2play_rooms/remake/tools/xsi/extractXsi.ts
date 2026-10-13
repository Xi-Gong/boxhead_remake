/**
 * XSI character data extractor (lane B2).
 *
 * The characters (player skins, zombie, devil) are Softimage XSI polygon data built at runtime by one ~4.6 MB DoAction
 * inside sprite 755 (export name `TMP2639qh3hat`), which fills `_global.mXSI_Data.mItems`. We evaluate that
 * straight-line script with tools/avm1/dataVm.ts and write public/assets/xsi.json (XsiJson, see assetSchema.ts).
 *
 *   node tools/xsi/extractXsi.ts [--out <dir>] [--no-report]
 *
 * writes <dir>/xsi.json (default public/assets) and generated/reports/xsi-summary.md.
 * Library use: `extractXsi(swf, outDir)` (writes only xsi.json).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AsValue, XsiJson } from '../../src/shared/assetSchema.ts';
import { SwfFile } from '../swf/SwfFile.ts';
import { ASSETS_OUT, GENERATED, SWF_PATH, isMain } from '../paths.ts';
import { evaluateXsi } from './xsiScript.ts';
import { buildXsiSummary } from './xsiSummary.ts';
import { computeXsiStats } from './xsiModel.ts';

export { evaluateXsi, findXsiScript, XSI_EXPORT_NAME } from './xsiScript.ts';
export type { XsiEvaluation, XsiScript } from './xsiScript.ts';

export function buildXsiJson(items: AsValue[]): XsiJson {
  return { v: 1, items, stats: computeXsiStats(items) };
}

/** Evaluate the XSI script and write `<outDir>/xsi.json`. Returns the stats stored in the file. */
export function extractXsi(swf: SwfFile, outDir: string): XsiJson['stats'] {
  const json = buildXsiJson(evaluateXsi(swf).items);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'xsi.json'), JSON.stringify(json));
  return json.stats;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--out');
  const outDir = oi >= 0 ? args[oi + 1] : ASSETS_OUT;
  const t0 = performance.now();
  const swf = SwfFile.fromPath(SWF_PATH);
  const ev = evaluateXsi(swf);
  const json = buildXsiJson(ev.items);
  const text = JSON.stringify(json);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'xsi.json'), text);
  console.log(`xsi.json: ${(text.length / 1024 / 1024).toFixed(2)} MB (${text.length} bytes) -> ${join(outDir, 'xsi.json')}`);
  console.log(`stats: ${JSON.stringify(json.stats)}; ${ev.vm.actions} actions; shared refs ${ev.sharedRefs}`);
  if (!args.includes('--no-report')) {
    const reportDir = join(GENERATED, 'reports');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'xsi-summary.md'), buildXsiSummary(ev));
    console.log(`report -> ${join(reportDir, 'xsi-summary.md')}`);
  }
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(2)} s`);
}
