// v0.2.4 targeted visual-QA playtest: the START WAVE cycler's historical-best cap (deviation START_WAVE_SELECTOR
// amendment) + the unified user-data dir (USER_DATA_DIR). Three legs against the PACKAGED exe, each on an isolated
// BOXHEAD_USER_DATA dir (fresh saves, never the player's real ~/.boxhead):
//   A. fresh save: the cycler is PINNED at wave 1, BEST 1;
//   B. seed 25 -> the cycler reaches 25 + BEST 25 -> a real run starts at LEVEL 25 -> a mid-run wave advance grows
//      the save member -> RELAUNCH on the same data dir: BEST 25 persists across sessions;
//   C. LAN pair: the host seeds 30 BEFORE entering setup, so the setup cycler is capped by the HOST's best on BOTH
//      screens (BEST 30 mirrored) and the host's wave plate cycles 1->2->3.
// Screenshots feed the zai vision gate (repo mandate); behavior asserts are geometric/state reads.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'generated/reports/qa');
mkdirSync(OUT, { recursive: true });
for (const d of ['v024-a', 'v024-host', 'v024-client']) rmSync(join(OUT, d), { recursive: true, force: true }); // fresh saves regardless of how the last run ended

const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];
const OFFSCREEN = ['-32000', '0'];
const MENU_Y = { Single: 226, LAN: 346 };

const report = { ok: false, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const fail = (s) => { report.errors.push(s); console.error('FAIL: ' + s); };
const shot = async (name, page) => { const p = join(OUT, `v024_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step('shot ' + p); };

async function launchApp(dirName) {
  const app = await electron.launch({
    executablePath: join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
    cwd: ROOT,
    timeout: 60000,
    args: [...NO_THROTTLE, '--boxhead-multi', `--window-position=${OFFSCREEN[0]},${OFFSCREEN[1]}`],
    env: { ...process.env, BOXHEAD_USER_DATA: join(OUT, dirName) },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, [x, y]) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setPosition(x, y);
    w.setAlwaysOnTop(false);
  }, OFFSCREEN).catch(() => {});
  page.on('pageerror', (e) => report.errors.push(`[${dirName}] ${e.message}`));
  return { app, page };
}

function helpers(page) {
  const waitFor = async (fn, arg = null, timeout = 30000) => {
    try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
  };
  const waitScreen = (st, id, timeout = 30000) => waitFor(([st, id]) => {
    const m = window.__game?.main?.();
    return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
  }, [st, id], timeout);
  const click = async (x, y) => {
    // DYNAMIC_VIEWPORT: map through the presenter (centred content; plain /640,/480 skews on non-4:3 windows).
    const r = await page.evaluate(() => {
      const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
      const p = window.__game?.platform?.presenter;
      return { x: b.left, y: b.top, w: b.width, h: b.height, ox: p ? (p.stageW - 640) / 2 : 0, oy: p ? (p.stageH - 480) / 2 : 0, sw: p?.stageW ?? 640, sh: p?.stageH ?? 480 };
    });
    await page.mouse.move(r.x + ((x + r.ox) / r.sw) * r.w, r.y + ((y + r.oy) / r.sh) * r.h);
    await page.waitForTimeout(60);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  return { waitFor, waitScreen, click };
}

const waveText = (page) => page.evaluate(() => window.__game.main().mcScreen.mcStartWave?.mcValue?.text);
const bestText = (page) => page.evaluate(() => window.__game.main().mcScreen.mcStartWave?.mcBest?.text);
const savedMax = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('SO:BXHD_2PLAY_6') ?? '{}').mMaxWaveReached ?? null);

/** Stage-space centre of a clip expression - bounds against MAIN's parent (the v019 centreOf semantics:
 *  CMain sits at the stage origin, so that space IS stage space; the clip's OWN parent space is local!). */
const centreOfExpr = (page, expr) => page.evaluate((expr) => {
  const m = window.__game.main();
  const mc = new Function('m', `return ${expr};`)(m);
  if (!mc?.getBounds) return null;
  const b = mc.getBounds(m._parent);
  if (!(b.xMax < 10000)) return null;
  return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
}, expr);
/** A real-mouse click at stage coordinates, mapped through the presenter (DYNAMIC_VIEWPORT letterboxing). */
async function stageClick(page, x, y) {
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
    const p = window.__game?.platform?.presenter;
    return { x: b.left, y: b.top, w: b.width, h: b.height, ox: p ? (p.stageW - 640) / 2 : 0, oy: p ? (p.stageH - 480) / 2 : 0, sw: p?.stageW ?? 640, sh: p?.stageH ?? 480 };
  });
  await page.mouse.move(r.x + ((x + r.ox) / r.sw) * r.w, r.y + ((y + r.oy) / r.sh) * r.h);
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

const LAN_BTN = [320, 346];
const CREATE_ROOM_BTN = [320 - 117, 240 - 6];
const JOIN_BTN = [520, 350];
const READY_BTN = [210, 330];
const START_ROOM_BTN = [210, 330];
const WAVE_PLATE_BTN = [536, 399]; // the plate Button is CENTRED on (x, y)

let apps = [];
const closeAll = async () => { for (const a of apps) { try { await a.close(); } catch {} } };

try {
  // ---- legs A + B: one instance, fresh data dir -------------------------------------------------------
  let A = await launchApp('v024-a');
  apps.push(A.app);
  let a = helpers(A.page);
  if (!(await a.waitFor(() => window.__game?.ready, null, 120000))) throw new Error('boot failed (A)');
  if (!(await a.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error('no main menu (A)');
  await a.click(320, MENU_Y.Single);
  if (!(await a.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld'))) throw new Error('no Single selection (A)');
  await A.page.waitForTimeout(700); // screen-transition settle
  if ((await waveText(A.page)) !== '1') fail('A: fresh cycler default is not 1: ' + (await waveText(A.page)));
  if ((await bestText(A.page)) !== 'BEST 1') fail('A: fresh BEST copy is not BEST 1: ' + (await bestText(A.page)));
  await a.click(320 - 160, 377); await a.click(320 - 160, 377); // right-arrow area clicks on a PINNED cycler
  if ((await waveText(A.page)) !== '1') fail('A: fresh cycler is not pinned at 1: ' + (await waveText(A.page)));
  step('A: fresh save pinned at wave 1 (BEST 1)');
  await shot('01_select_fresh', A.page);

  // B: seed 25, re-enter through the real route (the production next-session flow).
  await A.page.evaluate(() => window.__game.__setWaveUnlock(25));
  const back = await centreOfExpr(A.page, 'm.mcScreen._Icon_Back'); // a SWF Button char: real click, no onRelease
  if (!back) throw new Error('no back icon on the select screen');
  await stageClick(A.page, back.x, back.y);
  if (!(await a.waitScreen('State_Main', 'Screen_Main'))) throw new Error('no main menu after back (B)');
  await A.page.waitForTimeout(800); // the menu fly-in settle
  await a.click(320, MENU_Y.Single);
  if (!(await a.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld'))) throw new Error('no Single selection (B)');
  await A.page.waitForTimeout(700);
  if ((await bestText(A.page)) !== 'BEST 25') fail('B: BEST copy is not BEST 25: ' + (await bestText(A.page)));
  const arrow = await centreOfExpr(A.page, 'm.mcScreen.mcStartWave.bRight');
  if (!arrow) throw new Error('cycler right arrow not found on screen');
  for (let i = 0; i < 24; i++) await stageClick(A.page, arrow.x, arrow.y);
  if ((await waveText(A.page)) !== '25') fail('B: cycling to 25 failed: ' + (await waveText(A.page)));
  if ((await savedMax(A.page)) !== 25) fail('B: save member is not 25: ' + (await savedMax(A.page)));
  step('B: cycler reached wave 25 (BEST 25), save member 25');
  await shot('02_select_unlocked', A.page);
  await A.page.evaluate(() => {
    const m = window.__game.main();
    const icons = m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons;
    icons._Button.onRelease.call(icons._Button);
  });
  if (!(await a.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error('wave-25 run did not start (B)');
  const lvl = await A.page.evaluate(() => window.__game.main().mcWorld.mUpgrades.mLevelIndex);
  if (lvl !== 25) fail('B: run did not start at LEVEL 25: ' + lvl);
  // A mid-run wave advance (the same call natural advance makes) must grow the persisted best.
  await A.page.evaluate(() => { window.__game.main().mcWorld.mUpgrades.__set__mLevel(30); });
  if ((await savedMax(A.page)) !== 30) fail('B: mid-run advance did not grow the save member: ' + (await savedMax(A.page)));
  step('B: run at LEVEL 25, mid-run advance grew the best to 30');
  await closeAll(); apps = [];

  // Relaunch on the SAME data dir: the persisted best survives a real app restart (USER_DATA_DIR).
  A = await launchApp('v024-a');
  apps.push(A.app);
  a = helpers(A.page);
  if (!(await a.waitFor(() => window.__game?.ready, null, 120000))) throw new Error('boot failed (relaunch)');
  if (!(await a.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error('no main menu (relaunch)');
  await A.page.waitForTimeout(800); // the menu fly-in settle
  await a.click(320, MENU_Y.Single);
  if (!(await a.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld'))) throw new Error('no Single selection (relaunch)');
  await A.page.waitForTimeout(700);
  if ((await bestText(A.page)) !== 'BEST 30') fail('relaunch: BEST 30 did not persist: ' + (await bestText(A.page)));
  if ((await waveText(A.page)) !== '1') fail('relaunch: cycler default is not 1: ' + (await waveText(A.page)));
  step('B: relaunch on the same data dir - BEST 30 persists, cycler still defaults to 1');
  await shot('03_select_relaunch', A.page);
  await closeAll(); apps = [];

  // ---- leg C: LAN pair, host-capped setup cycler ------------------------------------------------------
  const H = await launchApp('v024-host');
  apps.push(H.app);
  const h = helpers(H.page);
  const C = await launchApp('v024-client');
  apps.push(C.app);
  const c = helpers(C.page);
  for (const [n, x, pg] of [['host', h, H.page], ['client', c, C.page]]) {
    if (!(await x.waitFor(() => window.__game?.ready, null, 120000))) throw new Error(`${n} boot failed (C)`);
    if (!(await x.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`${n}: no main menu (C)`);
    await pg.waitForTimeout(800); // the menu fly-in settle (LAN GAME is the last item)
    await x.click(...LAN_BTN);
    if (!(await x.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`${n}: no lobby (C)`);
  }
  await h.click(...CREATE_ROOM_BTN);
  await C.page.fill('input[type=text]', '127.0.0.1');
  await c.click(...JOIN_BTN);
  await c.click(...READY_BTN);
  if (!(await h.waitFor(() => window.__game?.lan?.()?.ready === true, null, 20000))) throw new Error('no READY (C)');
  // The host's best seeds the setup cap at enterSetup - BEFORE the room starts.
  await H.page.evaluate(() => window.__game.__setWaveUnlock(30));
  await H.page.waitForTimeout(3000); // heartbeat settles before START pins D
  await h.click(...START_ROOM_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitScreen('State_LanSetup', 'Screen_LanSetup', 20000))) throw new Error(`${n}: no setup screen (C)`);
  }
  await H.page.waitForTimeout(700); // screen-transition settle
  const plate = (page) => page.evaluate(() => ({
    wave: window.__game.main().mcScreen.bWave?._Contents?._Label?.text,
    best: window.__game.main().mcScreen.bBest?.text,
    sel: { wave: window.__game.lan().sel.wave, maxWave: window.__game.lan().sel.maxWave },
  }));
  const pH = await plate(H.page);
  const pC = await plate(C.page);
  step(`C: host plate ${JSON.stringify(pH)} / client plate ${JSON.stringify(pC)}`);
  if (pH.wave !== 'WAVE 1' || pH.best !== 'BEST 30') fail('C: host plate wrong: ' + JSON.stringify(pH));
  if (pC.wave !== 'WAVE 1' || pC.best !== 'BEST 30') fail('C: client mirror plate wrong: ' + JSON.stringify(pC));
  if (pC.sel.maxWave !== 30) fail('C: client did not mirror maxWave 30: ' + pC.sel.maxWave);
  await shot('04_lansetup_host', H.page);
  await shot('05_lansetup_guest', C.page);
  await h.click(...WAVE_PLATE_BTN);
  await h.click(...WAVE_PLATE_BTN);
  await H.page.waitForTimeout(300);
  const after = await plate(C.page);
  if (after.sel.wave !== 3 || after.wave !== 'WAVE 3') fail('C: host wave plate did not cycle to 3: ' + JSON.stringify(after));
  step('C: host cycles the wave plate to 3 (capped at its best 30), mirrored to the client');
  await shot('06_lansetup_wave3', H.page);
  report.ok = report.errors.length === 0;
} catch (e) {
  report.errors.push(String(e?.message ?? e));
} finally {
  writeFileSync(join(OUT, 'v024_report.json'), JSON.stringify(report, null, 2));
  await closeAll();
}
console.log(report.ok ? 'V0.2.4 TARGETED PLAYTEST PASSED' : `V0.2.4 TARGETED PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
