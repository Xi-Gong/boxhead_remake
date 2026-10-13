/**
 * Oracle probe runner: builds probe SWFs, runs them in real Flash Player projectors, collects the results and writes
 * JSON goldens (tests/goldens/flash/<id>.json).                                      OWNER: oracle lane
 *
 *   node tools/oracle/runProbe.ts               # list probes
 *   node tools/oracle/runProbe.ts all           # run every probe (~6 min; P9 alone ~11 s, each P8 part ~7-30 s)
 *   node tools/oracle/runProbe.ts p1 p6         # run selected probes (exact id or id prefix before '_', e.g. x8)
 *   node tools/oracle/runProbe.ts --build-only p1   # only write generated/oracle/<id>.swf
 *
 * Two output channels (ProbeDef.channel):
 *   'trace' (default) — FP32 DEBUG projector flashplayer_32_sa_debug.exe (32.0.0.465); `trace()` lines go to
 *       flashlog.txt. That build (like FP30 and FP32 release on this machine) has the end-of-life/region kill switch:
 *       ~100 ms after start the content is replaced by an "outdated version" notice. A running script is never
 *       interrupted, so trace probes do ALL their work synchronously in frame 1 (ScriptLimits raises the timeout).
 *   'so' — release projectors without the kill switch (FlashPlayer28.exe 28.0.0.126, FlashPlayer8.exe 8.0.22) cannot
 *       trace; results go to a local SharedObject (tools/oracle/sol.ts), ~100 KB quota per run. Used for P8 (the
 *       real game needs thousands of frames), P11 cross-checks and the x8_/x28_ cross-player variants.
 *
 * Side effects outside the repo (approved by the user; remove them by deleting the files listed):
 *   - %USERPROFILE%\mm.cfg gets `ErrorReportingEnable=1`, `TraceOutputFileEnable=1`, `MaxWarnings=0` (an existing
 *     file is backed up to generated/oracle/mm.cfg.bak first and its other lines are kept);
 *   - %APPDATA%\Macromedia\Flash Player\Logs\flashlog.txt is truncated before every trace run;
 *   - %APPDATA%\Macromedia\Flash Player\#SharedObjects\<id>\localhost\oracle_*.sol are created by 'so' runs and
 *     deleted again by the runner (only files named oracle_*.sol are ever touched).
 * Projector processes started by the runner are always killed (by PID; other Flash Player windows are left alone).
 *
 * Protocol: a probe emits `PROBE:<key>=<value>` lines and finally `PROBE:END`. Keys must be unique and must not
 * contain '=' (duplicates are kept with a `#n` suffix and reported in `log`). Other lines are kept in `log`.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { GENERATED, ROOT, isMain } from '../paths.ts';
import { PROBES } from './probes/index.ts';
import { deleteAllOracleSols, readSolIfExists, solLines } from './sol.ts';
import type { ProbeDef } from './probes/index.ts';

export const ORACLE_DIR = resolve(GENERATED, 'oracle');
export const GOLDEN_DIR = resolve(ROOT, 'tests', 'goldens', 'flash');
export const FLASH_DIR = resolve(ROOT, '..', '..', 'flash_player');
export const DEBUG_PLAYER = resolve(FLASH_DIR, 'flashplayer_32_sa_debug.exe');
/** Newest release projector on this machine WITHOUT the kill switch; default for the SharedObject channel. */
export const SO_PLAYER = resolve(FLASH_DIR, 'FlashPlayer28.exe');
export const MM_CFG = join(homedir(), 'mm.cfg');
export const FLASHLOG = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Macromedia', 'Flash Player', 'Logs', 'flashlog.txt');

const REQUIRED_MM = { ErrorReportingEnable: '1', TraceOutputFileEnable: '1', MaxWarnings: '0' } as const;

/** Make sure mm.cfg enables trace logging. Returns true if the file was changed. */
export function ensureMmCfg(): boolean {
  const existing = existsSync(MM_CFG) ? readFileSync(MM_CFG, 'utf8') : null;
  const lines = existing === null ? [] : existing.split(/\r?\n/).filter((l) => l.trim() !== '');
  const kv = new Map<string, number>();
  lines.forEach((l, i) => { const m = /^\s*([^=\s]+)\s*=/.exec(l); if (m) kv.set(m[1], i); });
  let changed = existing === null;
  for (const [k, v] of Object.entries(REQUIRED_MM)) {
    const i = kv.get(k);
    if (i === undefined) { lines.push(`${k}=${v}`); changed = true; }
    else if (lines[i].split('=')[1]?.trim() !== v) { lines[i] = `${k}=${v}`; changed = true; }
  }
  if (!changed) return false;
  mkdirSync(ORACLE_DIR, { recursive: true });
  const bak = join(ORACLE_DIR, 'mm.cfg.bak');
  if (existing !== null && !existsSync(bak)) copyFileSync(MM_CFG, bak);
  writeFileSync(MM_CFG, lines.join('\r\n') + '\r\n');
  return true;
}

export interface RunResult {
  lines: string[];
  timedOut: boolean;
  ms: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function readLog(): string {
  try { return readFileSync(FLASHLOG, 'utf8'); } catch { return ''; }
}

const started = new Set<number>();

/** Kill every projector process started by this runner that is still alive (never touches other instances). */
export function killProjectors(): void {
  for (const pid of started) {
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' }); } catch { /* already gone */ }
    started.delete(pid);
  }
}

/**
 * Run one SWF in the debug projector until a line containing `endMarker` appears in flashlog.txt (or timeout).
 * The projector is always killed afterwards.
 */
export async function runSwf(swfPath: string, opts: { timeoutMs?: number; endMarker?: string; player?: string } = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const endMarker = opts.endMarker ?? 'PROBE:END';
  ensureMmCfg();
  mkdirSync(resolve(FLASHLOG, '..'), { recursive: true });
  writeFileSync(FLASHLOG, '');
  const t0 = Date.now();
  const child = spawn(opts.player ?? DEBUG_PLAYER, [swfPath], { stdio: 'ignore', windowsHide: false });
  if (child.pid !== undefined) started.add(child.pid);
  let exited = false;
  child.on('exit', () => { exited = true; if (child.pid !== undefined) started.delete(child.pid); });
  child.on('error', (e) => { exited = true; console.error(`projector spawn failed: ${e.message}`); });
  let timedOut = true;
  try {
    while (Date.now() - t0 < timeoutMs) {
      await sleep(250);
      const log = readLog();
      if (log.includes(endMarker)) { timedOut = false; await sleep(300); break; }
      if (exited) { timedOut = !readLog().includes(endMarker); break; }
    }
  } finally {
    if (!exited) killProjectors();
  }
  const lines = readLog().split(/\r?\n/).filter((l) => l.length > 0);
  return { lines, timedOut, ms: Date.now() - t0 };
}

/**
 * Run a SWF in a RELEASE projector and collect results through the SharedObject channel (see sol.ts): waits until
 * `<soName>.sol` has `end` set (or timeout), then kills the projector.
 */
export async function runSwfSO(swfPath: string, soName: string, opts: { timeoutMs?: number; player?: string } = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 120000;
  if (!soName.startsWith('oracle_')) throw new Error(`SharedObject name must start with oracle_: ${soName}`);
  deleteAllOracleSols();
  const t0 = Date.now();
  const child = spawn(opts.player ?? SO_PLAYER, [swfPath], { stdio: 'ignore', windowsHide: false });
  if (child.pid !== undefined) started.add(child.pid);
  let exited = false;
  child.on('exit', () => { exited = true; if (child.pid !== undefined) started.delete(child.pid); });
  child.on('error', (e) => { exited = true; console.error(`projector spawn failed: ${e.message}`); });
  let data: Record<string, unknown> | null = null;
  let timedOut = true;
  try {
    while (Date.now() - t0 < timeoutMs) {
      await sleep(500);
      data = readSolIfExists(soName);
      if (data?.end) { timedOut = false; break; }
      if (exited) break;
    }
  } finally {
    if (!exited) killProjectors();
  }
  data = readSolIfExists(soName) ?? data;
  const lines = data ? solLines(data).map((l) => (l === 'END' ? 'PROBE:END' : `PROBE:${l}`)) : [];
  return { lines, timedOut: timedOut && !data?.end, ms: Date.now() - t0 };
}

export interface ParsedProbe {
  results: Record<string, string>;
  /** Non-PROBE log lines (warnings/errors from the player). */
  log: string[];
  ended: boolean;
}

/** Lines the FP32 debug projector writes to flashlog.txt on its own for every SWF. */
const NOISE = new Set(['onEnterFrame called']);

export function parseProbeLines(lines: string[]): ParsedProbe {
  const results: Record<string, string> = {};
  const log: string[] = [];
  let ended = false;
  for (const line of lines) {
    if (!line.startsWith('PROBE:')) { if (!NOISE.has(line)) log.push(line); continue; }
    const body = line.slice(6);
    if (body === 'END') { ended = true; continue; }
    const eq = body.indexOf('=');
    let key = eq < 0 ? body : body.slice(0, eq);
    const value = eq < 0 ? '' : body.slice(eq + 1);
    if (key in results) {
      // duplicate keys are a probe bug (often a '=' inside the key): keep both but make it visible
      let n = 2; while (`${key}#${n}` in results) n++; key = `${key}#${n}`;
      log.push(`oracle: duplicate PROBE key renamed to ${key}`);
    }
    results[key] = value;
  }
  return { results, log, ended };
}

export interface Golden {
  probe: string;
  title: string;
  player: string;
  swfVersion: number;
  generatedBy: string;
  notes?: string[];
  results: Record<string, string>;
  derived?: unknown;
  log?: string[];
}

export async function runProbe(p: ProbeDef, opts: { buildOnly?: boolean } = {}): Promise<Golden | null> {
  mkdirSync(ORACLE_DIR, { recursive: true });
  mkdirSync(GOLDEN_DIR, { recursive: true });
  const swfPath = join(ORACLE_DIR, `${p.id}.swf`);
  writeFileSync(swfPath, p.build());
  if (opts.buildOnly) { console.log(`built ${swfPath}`); return null; }
  const run = p.channel === 'so'
    ? await runSwfSO(swfPath, p.soName ?? `oracle_${p.id}`, { timeoutMs: p.timeoutMs, player: p.player })
    : await runSwf(swfPath, { timeoutMs: p.timeoutMs, player: p.player });
  writeFileSync(join(ORACLE_DIR, `${p.id}.log`), run.lines.join('\n') + '\n');
  const parsed = parseProbeLines(run.lines);
  if (run.timedOut || !parsed.ended) {
    console.error(`${p.id}: no PROBE:END after ${run.ms} ms (${run.lines.length} log lines) — see generated/oracle/${p.id}.log`);
    if (!p.allowPartial) return null;
  }
  const player = parsed.results['$version'] ?? 'unknown';
  delete parsed.results['$version'];
  const golden: Golden = {
    probe: p.id,
    title: p.title,
    player,
    swfVersion: 8,
    generatedBy: 'tools/oracle/runProbe.ts',
    ...(p.notes ? { notes: p.notes } : {}),
    results: parsed.results,
    ...(p.derive ? { derived: p.derive(parsed.results) } : {}),
    ...(parsed.log.length ? { log: parsed.log.slice(0, 200) } : {}),
  };
  writeFileSync(join(GOLDEN_DIR, `${p.id}.json`), JSON.stringify(golden, null, 1) + '\n');
  console.log(`${p.id}: ${Object.keys(parsed.results).length} results in ${run.ms} ms${parsed.log.length ? `, ${parsed.log.length} other log lines` : ''}`);
  return golden;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const buildOnly = args.includes('--build-only');
  const ids = args.filter((a) => !a.startsWith('--'));
  if (ids.length === 0) {
    for (const p of PROBES) console.log(`${p.id.padEnd(22)} ${p.title}`);
    return;
  }
  const selected = ids.includes('all') ? PROBES : PROBES.filter((p) => ids.some((id) => p.id === id || p.id.startsWith(id + '_')));
  if (selected.length === 0) throw new Error(`no probe matches ${ids.join(' ')}`);
  if (ensureMmCfg()) console.log(`updated ${MM_CFG}`);
  let failed = 0;
  try {
    for (const p of selected) {
      const g = await runProbe(p, { buildOnly });
      if (!g && !buildOnly) failed++;
    }
  } finally {
    killProjectors();
    if (selected.some((p) => p.channel === 'so')) deleteAllOracleSols();
  }
  if (failed) { console.error(`${failed} probe(s) failed`); process.exitCode = 1; }
}

if (isMain(import.meta.url)) await main();
