/**
 * Capture REFERENCE screenshots of the original game (lane V, visual fidelity).      OWNER: lane V (visual)
 *
 *   node tools/oracle/visual/captureRef.ts                 # all scenes of src/dev/sceneList.ts
 *   node tools/oracle/visual/captureRef.ts main room-01    # selected scenes
 *   node tools/oracle/visual/captureRef.ts --player=8 main # FlashPlayer8.exe instead of FlashPlayer28.exe
 *
 * Per scene: build generated/visual/swf/<scene>.swf (game copy + injected scene driver, see buildScene.ts), delete
 * this tool's SharedObjects (oracle_vis_*.sol and the game's own save files of the generated/visual/swf/*.swf copies,
 * so every run starts from default save data), start the release projector BACKGROUND-SAFE (projector.ts /
 * projector.ps1: minimized without activation, restore position off-screen, __COMPAT_LAYER=HighDpiAware so the stage
 * renders 1:1 on a high-DPI display), wait for the driver's END in the SharedObject (scene reached and frozen),
 * restore the window without activation off-screen and grab its client area with PrintWindow(PW_RENDERFULLCONTENT),
 * kill the projector by PID. The user's focus / foreground window is never touched.
 * Output: tests/visual/reference/<scene>.png (gitignored) + tests/visual/reference/manifest.json (driver report:
 * frame numbers of every step, final screen/world state, player positions).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, GENERATED, isMain } from '../../paths.ts';
import { findSol, readSolIfExists, solLines } from '../sol.ts';
import { buildSceneSwf, sceneSoName } from './buildScene.ts';
import { captureProjector, isAlive, killProjector, launchProjector, projectorExe } from './projector.ts';
import { SCENES, type SceneDef } from '../../../src/dev/sceneList.ts';

export const REF_DIR = resolve(ROOT, 'tests', 'visual', 'reference');
const SWF_DIR = resolve(GENERATED, 'visual', 'swf');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Delete our SharedObjects: the driver channel (oracle_vis_*) and the game saves written by the generated copies. */
function cleanSols(): void {
  for (const p of findSol(/^oracle_vis_.*\.sol$/)) rmSync(p, { force: true });
  const marker = `${sep}generated${sep}visual${sep}swf${sep}`.toLowerCase();
  for (const p of findSol(/\.sol$/)) if (p.toLowerCase().includes(marker)) rmSync(p, { force: true });
}

export interface RefResult {
  scene: string;
  ok: boolean;
  png?: string;
  ms: number;
  player: string;
  focusKept?: boolean;
  report: Record<string, string>;
  error?: string;
}

function parseLines(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of lines) {
    const i = l.indexOf('=');
    if (i < 0) out[l] = '';
    else out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

export async function captureScene(scene: SceneDef, player: string, timeoutMs = 150_000): Promise<RefResult> {
  mkdirSync(SWF_DIR, { recursive: true });
  mkdirSync(REF_DIR, { recursive: true });
  const swfPath = join(SWF_DIR, `${scene.id}.swf`);
  writeFileSync(swfPath, buildSceneSwf(scene));
  cleanSols();
  const soName = sceneSoName(scene);
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
    const png = join(REF_DIR, `${scene.id}.png`);
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
  const scenes = ids.length ? SCENES.filter((s) => ids.includes(s.id)) : SCENES;
  if (ids.length && scenes.length !== ids.length) throw new Error(`unknown scene in ${ids.join(' ')}; known: ${SCENES.map((s) => s.id).join(' ')}`);
  const manifestPath = join(REF_DIR, 'manifest.json');
  const manifest: Record<string, RefResult & { title: string; capturedAt: string }> =
    existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  let failed = 0;
  for (const s of scenes) {
    const r = await captureScene(s, player);
    console.log(`${s.id.padEnd(16)} ${r.ok ? 'ok  ' : 'FAIL'} ${String(r.ms).padStart(6)} ms  ${r.focusKept === false ? '(foreground changed during launch!) ' : ''}${r.error ?? ''}  ${r.report.world ?? r.report.screen ?? ''}`);
    if (!r.ok) failed++;
    manifest[s.id] = { ...r, png: r.png ? `${s.id}.png` : undefined, title: s.title, capturedAt: new Date().toISOString() };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
  }
  if (failed) { console.error(`${failed} scene(s) failed`); process.exitCode = 1; }
}

if (isMain(import.meta.url)) await main();
