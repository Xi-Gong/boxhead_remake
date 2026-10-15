// v0.1.10 audio recovery E2E of the REAL app (production build) in HEADLESS Chrome with REAL WebAudio decoding.
// Verifies the self-healing stack end-to-end through the production boot path (vite preview):
//   boot       - all 31 sounds decoded, context running, no failures, no recoveries
//   retryHeal  - the first 558.mp3 (Weapon.Pistol.Fire) fetch is aborted once: the boot retry round heals it
//   stuckHeal  - 558.mp3 aborted through boot: reported failed; after unrouting, one play call refetches it
//   suspend    - audioCtl.suspend() -> the watchdog resumes the context within ~3 s
//   kill       - audioCtl.kill() (close()) -> the watchdog recreates the context, re-decodes all 31 from RAM
//   npx vite build --outDir generated/audio-dist --emptyOutDir && npx vite preview --outDir generated/audio-dist --port 5316
//   node tests/e2e/audio.browser.mjs [group ...]        (GAME_URL, default http://localhost:5311/)
// Output: generated/reports/audio/audio_report.json; exit code 1 on any failed check.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game, launch, ROOT, URL as URL_ } from './lib.mjs';

const OUT = join(ROOT, 'generated/reports/audio');
mkdirSync(OUT, { recursive: true });
const groups = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const want = (g) => groups.length === 0 || groups.includes(g);

const report = { checks: [], failed: 0, groups: {} };
let current = 'boot';
function check(name, ok, detail) {
  const c = { group: current, name, ok: !!ok, detail };
  report.checks.push(c);
  if (!ok) report.failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${current}] ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  return !!ok;
}

const PISTOL = 558; // library.json exports: Weapon.Pistol.Fire.wav -> sounds/558.mp3

const browser = await launch();
const audio = (g) => g.eval(() => window.__game.audio());
/** Direct play through the REAL production path (sample clip -> Sound.start -> startVoice). */
const playPistol = (g) => g.expr('P.CSound.mSamples.Weapon_Pistol_Fire_wav.PlaySound(), true');
const sampleReady = (g) => g.waitExpr('P.CSound.mSamples && P.CSound.mSamples.Weapon_Pistol_Fire_wav', 30000);

/** openGame, but with page.route()s installed before navigation (fault injection). */
async function openRouted(routes) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  for (const r of routes) await page.route(r.pattern, r.handler);
  await page.goto(URL_);
  const g = new Game(page, ctx, log);
  await g.waitFor(() => window.__game && (window.__game.stage === 'audio' || window.__game.ready || window.__game.stage === 'failed'), null, 120000);
  if (!(await page.evaluate(() => window.__game.ready))) await page.mouse.click(320, 240);
  await g.waitFor(() => window.__game.ready || window.__game.stage === 'failed', null, 30000);
  return g;
}

async function runGroup(name, fn, { allowConsole = () => false } = {}) {
  if (!want(name)) return;
  current = name;
  const t0 = Date.now();
  let g;
  try {
    g = await fn();
  } catch (e) {
    check('group completed', false, String(e?.stack ?? e).slice(0, 600));
  }
  if (g) {
    const errs = await g.scriptErrors().catch(() => ['<page gone>']);
    check('no engine script errors', errs.length === 0, errs.slice(0, 3));
    const cons = g.log.filter((l) => /^\[(error|pageerror)/.test(l) && !allowConsole(l));
    check('no console errors', cons.length === 0, cons.slice(0, 3));
    await g.close();
  }
  report.groups[name] = { ms: Date.now() - t0 };
}

// ------------------------------------------------------------------------------------------------ boot
await runGroup('boot', async () => {
  const g = await openRouted([]);
  const a = await audio(g);
  check('all 31 sounds decoded', a.decoded === 31 && a.total === 31, a);
  check('context running', a.state === 'running', a.state);
  check('no failed sounds', a.failed.length === 0, a.failed);
  check('no recoveries needed', a.recoveries === 0, a.recoveries);
  return g;
});

// ------------------------------------------------------------------------------------------------ retryHeal
await runGroup('retryHeal', async () => {
  let aborts = 0;
  const g = await openRouted([{
    pattern: `**/sounds/${PISTOL}.mp3`,
    handler: (route) => { if (aborts === 0) { aborts++; return route.abort(); } return route.continue(); },
  }]); // the intentional abort logs net::ERR_FAILED (excluded from the console check below)
  check('558.mp3 aborted exactly once (healed by the boot retry)', aborts === 1, aborts);
  const a = await audio(g);
  check('boot retry healed the aborted sound before ready', a.failed.length === 0 && a.decoded === 31, a);
  return g;
}, { allowConsole: (l) => l.includes('ERR_FAILED') });

// ------------------------------------------------------------------------------------------------ stuckHeal
await runGroup('stuckHeal', async () => {
  const g = await openRouted([{
    pattern: `**/sounds/${PISTOL}.mp3`,
    handler: (route) => route.abort(),
  }]);
  let a = await audio(g);
  check('permanently aborted sound reported failed at ready', a.failed.includes(PISTOL) && a.decoded === 30, a);
  await sampleReady(g);
  await g.page.unroute(`**/sounds/${PISTOL}.mp3`);
  check('play on the missing buffer returns normally (silent, heal fired)', await playPistol(g) === true);
  check('background heal refetched the sound', await g.waitFor(() => {
    const a = window.__game.audio();
    return a.failed.length === 0 && a.decoded === 31;
  }, null, 10000));
  await playPistol(g);
  check('the sample plays (mPlaying latch set)', await g.expr('P.CSound.mSamples.Weapon_Pistol_Fire_wav.mPlaying') === true);
  a = await audio(g);
  check('no failed sounds remain', a.failed.length === 0, a.failed);
  return g;
}, { allowConsole: (l) => l.includes('ERR_FAILED') });

// ------------------------------------------------------------------------------------------------ suspend
await runGroup('suspend', async () => {
  const g = await openRouted([]);
  await sampleReady(g);
  await g.eval(() => window.__game.audioCtl.suspend());
  check('context suspended', (await audio(g)).state === 'suspended');
  check('watchdog resumes within ~3 s', await g.waitFor(() => window.__game.audio().state === 'running', null, 3000));
  await g.expr('P.CSound.mSamples.Click2.PlaySound(), true');
  check('click plays after recovery', await g.expr('P.CSound.mSamples.Click2.mPlaying') === true);
  check('no recovery counted (resume is not recreation)', (await audio(g)).recoveries === 0);
  return g;
});

// ------------------------------------------------------------------------------------------------ kill
await runGroup('kill', async () => {
  const g = await openRouted([]);
  await sampleReady(g);
  const rec0 = (await audio(g)).recoveries;
  await g.eval(() => window.__game.audioCtl.kill());
  check('kill() closed the context (or the watchdog already recovered)', await g.waitFor((r0) => {
    const a = window.__game.audio();
    return a.state === 'closed' || a.recoveries > r0;
  }, rec0, 5000));
  check('watchdog recreated the context within 15 s (running, 31 decoded, +1 recovery)', await g.waitFor((r0) => {
    const a = window.__game.audio();
    return a.state === 'running' && a.decoded === 31 && a.recoveries === r0 + 1;
  }, rec0, 15000));
  await g.expr('P.CSound.mSamples.Click2.PlaySound(), true');
  check('click plays on the recreated context', await g.expr('P.CSound.mSamples.Click2.mPlaying') === true);
  return g;
});

await browser.close();
writeFileSync(join(OUT, 'audio_report.json'), JSON.stringify(report, null, 2));
console.log(`${report.failed ? 'FAILED' : 'PASSED'}: ${report.checks.length - report.failed}/${report.checks.length} checks`);
process.exit(report.failed ? 1 : 0);
