// v0.2.0 release playtest (WAVE_CHECKPOINT_RETRY fallback): START WAVE 25 -> REAL passive death before any wave
// advance -> REAL mouse click on the Debrief RETRY -> the rebuilt run must start at LEVEL 25 again (not the
// difficulty base 1). Screenshots feed the zai vision MCP gate.
//   npx vite build --outDir generated/qa-dist --emptyOutDir && npx vite preview --outDir generated/qa-dist --port 5198
//   node tests/sim/playtest.v020.mjs        (GAME_URL, default http://localhost:5198/)
// Exits non-zero on any failed step; screenshots land in generated/reports/qa/v020_*.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../generated/reports/qa');
mkdirSync(OUT, { recursive: true });
const URL = process.env.GAME_URL ?? 'http://localhost:5198/';
const MENU_Y = { Single: 226 };

const report = { ok: false, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const fail = (s) => { report.errors.push(s); console.error('FAIL: ' + s); };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.on('pageerror', (e) => fail('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') fail('console: ' + m.text().slice(0, 300)); });

const waitFor = async (fn, arg, timeout = 30000) => {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
};
const waitScreen = (st, id, timeout = 30000) => waitFor(([st, id]) => {
  const m = window.__game?.main?.();
  return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
}, [st, id], timeout);
const waitRunning = () => waitFor(() => window.__game?.state?.() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000);
const stageToPage = async (x, y) => {
  const r = await page.evaluate(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  return [r.x + (x / 640) * r.w, r.y + (y / 480) * r.h];
};
const clickStage = async (x, y) => {
  const [px, py] = await stageToPage(x, y);
  await page.mouse.move(px, py);
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(60);
};
const centreOf = (expr) => page.evaluate((expr) => {
  const m = window.__game.main();
  const mc = new Function('m', `return ${expr};`)(m);
  if (!mc) return null;
  const b = mc.getBounds(m._parent);
  if (!(b.xMax < 10000)) return null;
  return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
}, expr);
const shot = async (name) => { const p = join(OUT, `v020_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step('shot ' + p); };

// ---- boot -------------------------------------------------------------------------------------------
await page.goto(URL);
await waitFor(() => window.__game && (window.__game.stage === 'audio' || window.__game.ready || window.__game.stage === 'failed'), null, 120000);
if (!(await page.evaluate(() => window.__game.ready))) { await page.mouse.click(480, 360); step('clicked the audio-unlock overlay'); }
if (!(await waitFor(() => window.__game.ready, null, 30000))) { fail('app never became ready: ' + await page.evaluate(() => window.__game.stage)); }
if (!(await waitScreen('State_Main', 'Screen_Main', 60000))) { fail('no main menu'); await shot('boot_debug'); }
await page.waitForTimeout(500);

// ---- Single: cycle START WAVE to 25 and start --------------------------------------------------------
await clickStage(320, MENU_Y.Single);
if (!(await waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld'))) { fail('no Single level selection'); await shot('select_debug'); }
await page.waitForTimeout(400);
const waveText = () => page.evaluate(() => window.__game.main().mcScreen.mcStartWave?.mcValue?.text);
if ((await waveText()) !== '1') fail('cycler default is not 1: ' + (await waveText()));
const arrow = await centreOf('m.mcScreen.mcStartWave.bRight');
if (!arrow) fail('cycler right arrow not found on screen');
for (let i = 0; i < 24; i++) await clickStage(arrow.x, arrow.y);
if ((await waveText()) !== '25') fail('cycling to 25 failed: ' + (await waveText()));
await shot('select_wave25');
await page.evaluate(() => {
  const m = window.__game.main();
  const icons = m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons;
  icons._Button.onRelease.call(icons._Button);
});
if (!(await waitRunning())) fail('wave-25 room did not start');
const startState = await page.evaluate(() => {
  const w = window.__game.main().mcWorld;
  const first = Object.values(w.mThing_Collection.mPlayerThings)[0];
  return { level: w.mUpgrades.mLevelIndex, mult: w.mUpgrades.mMultiplierIndex, score: w.mHud.nTotalScore };
});
if (startState.level !== 25) fail(`run did not start at level 25: ${startState.level}`);
step(`wave-25 run started: ${JSON.stringify(startState)}`);

// ---- REAL passive death: hands off the keyboard, wave 25's zombies do the rest -----------------------
let dead = false;
for (let i = 0; i < 120 && !dead; i++) {
  await page.waitForTimeout(1000);
  dead = await page.evaluate(() => {
    const m = window.__game.main();
    if (m.mcWorld == undefined) return true; // the world ended -> debrief transition
    const p = Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0];
    return p.mLife <= 0;
  });
  if (i % 10 === 9) {
    const probe = await page.evaluate(() => { const w = window.__game.main().mcWorld; const p = Object.values(w.mThing_Collection.mPlayerThings)[0]; return { life: p.mLife, level: w.mUpgrades.mLevelIndex }; });
    step(`passive death watch ${(i + 1)}s: ${JSON.stringify(probe)}`);
  }
}
if (!(await waitFor(() => window.__game?.state?.() === 'State_Debrief', null, 60000))) { fail('never reached the debrief after death'); await shot('death_debug'); }
const deathState = await page.evaluate(() => {
  const m = window.__game.main();
  return { level: m.mcWorld == undefined ? null : m.mcWorld.mUpgrades.mLevelIndex, score: m.mcScreen.mScore?.text };
});
step(`dead at wave ${deathState.level}, debrief score ${deathState.score}`);
await page.waitForTimeout(600);
await shot('debrief_wave25');

// ---- RETRY via the REAL mouse on the REAL button ------------------------------------------------------
const retryBtn = await centreOf('m.mcScreen._Retry');
if (!retryBtn) { fail('debrief RETRY button not found'); await shot('retry_debug'); }
await clickStage(retryBtn.x, retryBtn.y);
if (!(await waitRunning())) { fail('RETRY did not restart the room'); await shot('retry_debug'); }
const retryState = await page.evaluate(() => {
  const w = window.__game.main().mcWorld;
  const first = Object.values(w.mThing_Collection.mPlayerThings)[0];
  return {
    level: w.mUpgrades.mLevelIndex,
    mult: w.mUpgrades.mMultiplierIndex,
    score: w.mHud.nTotalScore,
    zombies: w.mUpgrades.Level.mZombieCount,
    weapons: first.mWeaponList.filter((x) => x.mActive).map((x) => x.mNameID),
  };
});
// THE v0.2.0 FIX: the retry restarts at the failed wave (25), not the difficulty base (1).
if (retryState.level !== 25) fail(`RETRY restarted at level ${retryState.level}, wanted 25 (the failed wave)`);
if (retryState.mult !== 36) fail(`retry multiplier ${retryState.mult}, wanted 36 (anchorInterp(25))`);
if (retryState.score !== 0) fail(`retry score ${retryState.score}, wanted 0 (fresh-run semantics)`);
// Fresh wave start: by evaluate time a couple of zombies may already have spawned (spawning begins the moment
// mLoaded flips), so a small upper bound — mid-wave would be dozens. The exact fresh-start state is pinned
// deterministically by tests/sim/startWave.test.ts T1.
if (retryState.zombies > 10) fail(`retry started mid-wave (zombies ${retryState.zombies}), wanted a fresh wave start`);
const wantWeapons = 'pistol,uzi,shotgun,barrel,grenade,fakewall';
if (retryState.weapons.join(',') !== wantWeapons) fail(`retry loadout wrong (${retryState.weapons.join(',')}), wanted ${wantWeapons}`);
step(`RETRY at the failed wave verified: ${JSON.stringify(retryState)}`);
await page.waitForTimeout(1500);
await shot('retry_wave25');

report.ok = report.errors.length === 0;
writeFileSync(join(OUT, 'v020_report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(report.ok ? 'v0.2.0 retry acceptance PASSED' : 'v0.2.0 retry acceptance FAILED');
process.exit(report.ok ? 0 : 1);
