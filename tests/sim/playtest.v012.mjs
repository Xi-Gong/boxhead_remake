// v0.1.2 packaged playtest: SAVE & QUIT -> CONTINUE and the pause-screen button in the REAL packaged app
// (release/win-unpacked = identical content to the portable exe), driven like playtest.browser.mjs --packaged.
// The window is created off-screen (Chromium --window-position + an immediate setPosition) so the run does not
// disturb foreground work; the occlusion flags keep requestAnimationFrame at full rate.
//   node tests/sim/playtest.v012.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'generated/reports/qa');
mkdirSync(OUT, { recursive: true });

const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];
const OFFSCREEN = ['-32000', '0'];

const report = { ok: false, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const shot = async (name) => { const p = join(OUT, `v012_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step(`shot ${p}`); };

const app = await electron.launch({
  executablePath: join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
  cwd: ROOT,
  timeout: 60000,
  args: [...NO_THROTTLE, `--window-position=${OFFSCREEN[0]},${OFFSCREEN[1]}`],
  env: { ...process.env, PORTABLE_EXECUTABLE_DIR: join(OUT, 'v012-portable') },
});
const page = await app.firstWindow();
// Force the window off-screen even when the position flag was not honoured (activation may still have happened,
// but nothing is visible and the occlusion flags keep the loop running).
const bounds = await app.evaluate(({ BrowserWindow }, [x, y]) => {
  const w = BrowserWindow.getAllWindows()[0];
  const before = w.getBounds();
  w.setPosition(x, y);
  w.setAlwaysOnTop(false);
  return { before, after: w.getBounds() };
}, OFFSCREEN).catch((e) => { step(`window setPosition failed (${String(e?.message ?? e).slice(0, 120)}) - relying on --window-position`); return null; });
step(`window bounds ${JSON.stringify(bounds)}`);
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.errors.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => report.errors.push(`[pageerror] ${e.message}`));

const state = () => page.evaluate(() => window.__game?.state?.());
const main = () => page.evaluate(() => window.__game?.main?.());
const waitFor = async (fn, arg, timeout = 30000) => {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
};
const waitScreen = (st, id, timeout = 30000) => waitFor(([st, id]) => {
  const m = window.__game?.main?.();
  return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
}, [st, id], timeout);
const stageToPage = async (x, y) => {
  const r = await page.evaluate(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  return [r.x + (x / 640) * r.w, r.y + (y / 480) * r.h];
};
const click = async (x, y) => {
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
const worldInfo = () => page.evaluate(() => {
  const w = window.__game.main().mcWorld;
  if (!w?.mUpgrades) return null;
  const tc = w.mThing_Collection;
  const players = Object.keys(tc.mPlayerThings).map((k) => tc.mPlayerThings[k]).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
  return {
    room: w.mWorldLibLink, level: w.mUpgrades.mLevelIndex, score: w.mHud.nTotalScore,
    px: players[0]?.mPosition.mX, py: players[0]?.mPosition.mY,
    pauseBtn: !!w.mHud.mcScreenPause?._SaveQuit,
  };
});

try {
  if (!(await waitFor(() => window.__game?.ready || window.__game?.stage === 'failed', null, 120000))) throw new Error('boot failed');
  if (!(await waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`no main menu (state ${await state()})`);
  await page.waitForTimeout(400);
  await shot('01_main');
  // A fresh portable save dir: no CONTINUE yet.
  if (await main().then((m) => !!m.mcScreen.mcContinue)) throw new Error('CONTINUE visible without a stored run');

  // Start Single on the first room.
  const single = await centreOf('m.mcScreen.mcSinglePlay');
  await click(single.x, single.y);
  if (!(await waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld', 15000))) throw new Error(`no level selection (state ${await state()})`);
  await shot('02_select');
  const icon = await centreOf('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');
  await click(icon.x, icon.y);
  if (!(await waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`room did not start (state ${await state()})`);
  step(`room running: ${(await worldInfo()).room}`);

  // ~20 s of real play: strafe and fire.
  const t0 = Date.now();
  let toggle = false;
  while (Date.now() - t0 < 20000) {
    toggle = !toggle;
    await page.keyboard.down(toggle ? 'ArrowRight' : 'ArrowLeft');
    await page.keyboard.down('Slash');
    await page.waitForTimeout(250);
    await page.keyboard.up(toggle ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(250);
  }
  await page.keyboard.up('Slash');
  const before = await worldInfo();
  step(`played: ${JSON.stringify(before)}`);

  // Pause -> the SAVE & QUIT button -> main menu with CONTINUE.
  await page.keyboard.press('KeyP');
  if (!(await waitFor(() => window.__game.main().mcWorld?.mPaused, null, 10000))) throw new Error('no pause');
  if (!before.pauseBtn && !(await worldInfo()).pauseBtn) throw new Error('no SAVE & QUIT button on the pause screen');
  await shot('03_paused');
  await click(320, 452);
  if (!(await waitScreen('State_Main', 'Screen_Main', 30000))) throw new Error(`SAVE & QUIT did not reach the main menu (state ${await state()})`);
  await page.waitForTimeout(300);
  const cont = await centreOf('m.mcScreen.mcContinue');
  if (!cont) throw new Error('no CONTINUE after SAVE & QUIT');
  await shot('04_continue');

  // CONTINUE -> the run is back.
  await click(cont.x, cont.y);
  if (!(await waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`CONTINUE did not restart the room (state ${await state()})`);
  await page.waitForTimeout(300);
  const after = await worldInfo();
  step(`resumed: ${JSON.stringify(after)}`);
  if (after.room !== before.room) throw new Error(`room mismatch ${after.room} != ${before.room}`);
  if (after.level !== before.level) throw new Error(`level mismatch ${after.level} != ${before.level}`);
  if (after.score !== before.score) throw new Error(`score mismatch ${after.score} != ${before.score}`);
  if (Math.abs(after.px - before.px) > 0.16 || Math.abs(after.py - before.py) > 0.16) throw new Error(`player position mismatch (${after.px},${after.py}) vs (${before.px},${before.py})`);
  await shot('05_resumed');

  // Original pause QUIT -> Debrief -> EXIT clears the stored run.
  await page.keyboard.press('KeyP');
  await waitFor(() => window.__game.main().mcWorld?.mPaused, null, 10000);
  await click(320, 52);
  if (!(await waitScreen('State_Debrief', 'Screen_Debrief', 30000))) throw new Error(`QUIT did not reach the debrief (state ${await state()})`);
  const exitBtn = await centreOf('m.mcScreen._Exit');
  await click(exitBtn.x, exitBtn.y);
  if (!(await waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld', 30000))) throw new Error(`EXIT did not reach the selection (state ${await state()})`);
  const stored = await page.evaluate(() => {
    const v = localStorage.getItem('SO:BXHD_2PLAY_6');
    return v ? (JSON.parse(v).mResumeData != null) : false;
  });
  if (stored) throw new Error('stored run not cleared after the death/quit of the continued run');
  step('stored run cleared after the continued run ended');

  report.ok = report.errors.length === 0;
} catch (e) {
  report.errors.push(String(e?.message ?? e));
} finally {
  writeFileSync(join(OUT, 'v012_report.json'), JSON.stringify(report, null, 2));
  await app.close().catch(() => {});
}
console.log(report.ok ? 'PACKAGED v0.1.2 PLAYTEST PASSED' : `PACKAGED v0.1.2 PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
