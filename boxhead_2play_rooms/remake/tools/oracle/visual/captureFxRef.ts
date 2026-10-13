/**
 * Capture REFERENCE screenshots of the original game for the EFFECT scenes (lane X2; twin of captureRef.ts, lane V).
 *
 *   node tools/oracle/visual/captureFxRef.ts                    # all scenes of src/dev/fxSceneList.ts
 *   node tools/oracle/visual/captureFxRef.ts fx-muzzle fx-decals
 *   node tools/oracle/visual/captureFxRef.ts --player=8 ...      # FlashPlayer8.exe instead of FlashPlayer28.exe
 *
 * Per scene: build generated/visual/fxswf/<scene>.swf (game copy + injected AS1 driver, buildFxScene.ts), delete ONLY
 * this tool's SharedObjects (oracle_fx_*.sol and the game saves written by the generated/visual/fxswf copies, so other
 * lanes' capture runs are never disturbed and every run starts from default save data), start the release projector
 * BACKGROUND-SAFE (projector.ts: minimized without activation, off-screen, no focus change), wait for the driver's
 * END, PrintWindow-capture the stage, kill the projector by PID.
 * Output: tests/visual/fx/reference/<scene>.png + manifest.json (driver report: step frames, world state, LCG state).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, GENERATED, isMain } from '../../paths.ts';
import { findSol, readSolIfExists, solLines } from '../sol.ts';
import { buildFxSceneSwf, fxSoName } from './buildFxScene.ts';
import { captureProjector, isAlive, killProjector, launchProjector, projectorExe } from './projector.ts';
import { FX_SCENES, type FxSceneDef } from '../../../src/dev/fxSceneList.ts';

export const FX_REF_DIR = resolve(ROOT, 'tests', 'visual', 'fx', 'reference');
const SWF_DIR = resolve(GENERATED, 'visual', 'fxswf');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function cleanSols(): void {
  for (const p of findSol(/^oracle_fx_.*\.sol$/)) rmSync(p, { force: true });
  const marker = `${sep}generated${sep}visual${sep}fxswf${sep}`.toLowerCase();
  for (const p of findSol(/\.sol$/)) if (p.toLowerCase().includes(marker)) rmSync(p, { force: true });
}

interface RefResult { scene: string; ok: boolean; png?: string; ms: number; player: string; focusKept?: boolean; report: Record<string, string>; error?: string }

function parseLines(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of lines) {
    const i = l.indexOf('=');
    if (i < 0) out[l] = '';
    else out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

async function captureScene(scene: FxSceneDef, player: string, timeoutMs = 180_000): Promise<RefResult> {
  mkdirSync(SWF_DIR, { recursive: true });
  mkdirSync(FX_REF_DIR, { recursive: true });
  const swfPath = join(SWF_DIR, `${scene.id}.swf`);
  writeFileSync(swfPath, buildFxSceneSwf(scene));
  cleanSols();
  const soName = fxSoName(scene);
  const t0 = Date.now();
  const res: RefResult = { scene: scene.id, ok: false, ms: 0, player: player.split(/[\\/]/).pop()!, report: {} };
  let pid = 0;
  try {
    const l = launchProjector(player, swfPath);
    pid = l.pid;
    res.focusKept = l.focusKept;
    let data: Record<string, unknown> | null = null;
    while (Date.now() - t0 < timeoutMs) {
      await sleep(250);
      data = readSolIfExists(soName);
      if (data?.end || !isAlive(pid)) break;
    }
    res.report = parseLines(data ? solLines(data) : []);
    if (!data?.end) { res.error = isAlive(pid) ? 'timeout' : 'projector exited'; return res; }
    if (res.report.error) res.error = res.report.error;
    const png = join(FX_REF_DIR, `${scene.id}.png`);
    let out = '';
    for (let attempt = 0; attempt < 3 && !out.startsWith('ok'); attempt++) {
      if (attempt) await sleep(1000);
      out = captureProjector(pid, png);
    }
    if (!out.startsWith('ok 640x480')) { res.error = `capture: ${out}`; return res; }
    const img = PNG.sync.read(readFileSync(png));
    let nonBlack = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i]! | img.data[i + 1]! | img.data[i + 2]!) nonBlack++;
    if (nonBlack < 100) { res.error = 'capture is black'; return res; }
    res.png = png;
    res.ok = !res.error;
    return res;
  } catch (e) {
    res.error = String(e instanceof Error ? e.message : e);
    return res;
  } finally {
    res.ms = Date.now() - t0;
    if (pid) killProjector(pid);
    await sleep(300);
    cleanSols();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const player = projectorExe(args.find((a) => a.startsWith('--player='))?.split('=')[1] ?? '28');
  const ids = args.filter((a) => !a.startsWith('--'));
  const scenes = ids.length ? FX_SCENES.filter((s) => ids.includes(s.id)) : FX_SCENES;
  if (ids.length && scenes.length !== ids.length) throw new Error(`unknown scene in ${ids.join(' ')}; known: ${FX_SCENES.map((s) => s.id).join(' ')}`);
  const manifestPath = join(FX_REF_DIR, 'manifest.json');
  const manifest: Record<string, RefResult & { title: string; capturedAt: string }> =
    existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  let failed = 0;
  for (const s of scenes) {
    const r = await captureScene(s, player);
    console.log(`${s.id.padEnd(22)} ${r.ok ? 'ok  ' : 'FAIL'} ${String(r.ms).padStart(6)} ms  ${r.focusKept === false ? '(foreground changed during launch!) ' : ''}${r.error ?? ''}  ${r.report.world ?? r.report.screen ?? ''}`);
    if (!r.ok) failed++;
    manifest[s.id] = { ...r, png: r.png ? `${s.id}.png` : undefined, title: s.title, capturedAt: new Date().toISOString() };
    mkdirSync(FX_REF_DIR, { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
  }
  if (failed) { console.error(`${failed} scene(s) failed`); process.exitCode = 1; }
}

if (isMain(import.meta.url)) await main();
