// v0.2.1 packaged LAN playtest (P1 QA - the coverage hole that shipped the room bug): the NATURAL game-over
// route with REAL user flows only. playtest.net.mjs only ever ended games via concede and returned to the room
// OUT-OF-BAND (SetState), so the path "coop all-dead -> Debrief -> EXIT -> room" was never driven - and it was
// exactly the path that dead-ended (the natural end never marked the session 'ended').
// Flow: host room -> client joins + READY -> START GAME -> natural all-dead (both players killed deterministically
// in-world) -> Debrief on BOTH with the RETRY button VISIBLE (was hidden in net) -> both EXIT -> room actionable
// (bridge 'lobby', START visible) -> SECOND game started IN-PROCESS (the wire start consumed by the live session
// - the stuck-'setup' bug) -> natural all-dead again -> the CLIENT presses Debrief RETRY -> both peers rebuild
// (host-driven coordinated retry, fresh run at the failed wave). Screenshots feed the zai vision MCP gate.
//   node tests/sim/playtest.netretry.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { isolateLanPorts } from '../e2e/lan-isolation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'generated/reports/qa');
mkdirSync(OUT, { recursive: true });
for (const d of ['netretry-host', 'netretry-client']) {
  try { rmSync(join(OUT, d), { recursive: true, force: true }); } catch { /* best effort */ }
}

const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];
const OFFSCREEN = ['-32000', '0'];

const report = { ok: false, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const shot = async (name, page) => { const p = join(OUT, `net_retry_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step(`shot ${p}`); };

async function launchApp(dirName) {
  const app = await electron.launch({
    executablePath: join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
    cwd: ROOT,
    timeout: 60000,
    args: [...NO_THROTTLE, '--boxhead-multi', `--window-position=${OFFSCREEN[0]},${OFFSCREEN[1]}`],
    env: { ...process.env, BOXHEAD_USER_DATA: join(OUT, dirName) },
  });
  await isolateLanPorts(app);
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, [x, y]) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setPosition(x, y);
    w.setAlwaysOnTop(false);
  }, OFFSCREEN).catch(() => {});
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`[${dirName}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => report.errors.push(`[${dirName} pageerror] ${e.message}`));
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
  const stageToPage = async (x, y) => {
    // DYNAMIC_VIEWPORT: map through the presenter (centred content; plain /640,/480 skews on non-4:3 windows).
    const r = await page.evaluate(() => {
      const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
      const p = window.__game?.platform?.presenter;
      return { x: b.left, y: b.top, w: b.width, h: b.height, ox: p ? (p.stageW - 640) / 2 : 0, oy: p ? (p.stageH - 480) / 2 : 0, sw: p?.stageW ?? 640, sh: p?.stageH ?? 480 };
    });
    return [r.x + ((x + r.ox) / r.sw) * r.w, r.y + ((y + r.oy) / r.sh) * r.h];
  };
  const click = async (x, y) => {
    const [px, py] = await stageToPage(x, y);
    await page.mouse.move(px, py);
    await page.waitForTimeout(60);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(80);
  };
  /** Logical-stage centre of a screen child (getBounds against the stage parent, like v020's centreOf). */
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
    return { room: w.mWorldLibLink, level: w.mUpgrades.mLevelIndex, tick: w.mTick, score: w.mHud.nTotalScore };
  });
  /** Kill BOTH players deterministically (the crate-test pattern) - a natural coop all-dead end. */
  const killBoth = () => page.evaluate(() => {
    const m = window.__game.main();
    const DEAD = window.__game.pkg.Thing.CThing.mFlag_DEAD;
    for (const p of Object.values(m.mcWorld.mThing_Collection.mPlayerThings)) {
      if (!p) continue;
      p.mFlags |= DEAD; // the real damage path sets it before State_Dying
      p.SetState('State_Dying');
    }
  });
  return { waitFor, waitScreen, click, centreOf, worldInfo, killBoth };
}

const LAN_BTN = [320, 346];
const CREATE_ROOM_BTN = [320 - 117, 240 - 6]; // v0.2.2 panel layout
const JOIN_BTN = [520, 350];
const READY_BTN = [210, 330];
const START_ROOM_BTN = [210, 330];
const START_GAME_BTN = [320, 444];

let H, C;
try {
  // ---- boot + room ---------------------------------------------------------------------------------------------
  step('launching host + client');
  H = await launchApp('netretry-host');
  const h = helpers(H.page);
  C = await launchApp('netretry-client');
  const c = helpers(C.page);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game?.ready, null, 120000))) throw new Error(`${n} boot failed`);
    if (!(await x.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`${n}: no main menu`);
    await x.click(...LAN_BTN);
    if (!(await x.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`${n}: no lobby`);
  }
  await h.click(...CREATE_ROOM_BTN);
  if (!(await h.waitFor(() => window.__game?.lan?.()?.bridge === 'hosting', null, 20000))) throw new Error('host: CREATE ROOM did not host');
  await C.page.fill('input[type=text]', '127.0.0.1');
  await c.click(...JOIN_BTN);
  if (!(await h.waitFor(() => !!window.__game?.lan?.()?.peerName, null, 20000))) throw new Error('host never saw the client join');
  await c.click(...READY_BTN);
  if (!(await h.waitFor(() => window.__game?.lan?.()?.ready === true, null, 20000))) throw new Error('host never saw READY');
  step('room ready; starting game 1');
  await h.click(...START_ROOM_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitScreen('State_LanSetup', 'Screen_LanSetup', 20000))) throw new Error(`${n}: no setup screen (${n} START gated?)`);
  }
  await h.click(...START_GAME_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) {
      throw new Error(`${n}: game 1 did not start (${await x.worldInfo()})`);
    }
  }
  step(`game 1 running: ${JSON.stringify(await h.worldInfo())}`);

  // ---- natural all-dead -> Debrief with RETRY VISIBLE on both --------------------------------------------------
  step('killing both players (natural coop end)');
  await h.killBoth();
  await c.killBoth();
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game.state() === 'State_Debrief', null, 60000))) {
      throw new Error(`${n}: no debrief after the natural end (${await H.page.evaluate(() => window.__game.state())})`);
    }
    const retryVisible = await x.waitFor(() => {
      const s = window.__game.main().mcScreen;
      return s?._Retry?._visible === true;
    }, null, 10000);
    if (!retryVisible) throw new Error(`${n}: Debrief RETRY not visible in the net game (v0.2.1 unhide failed)`);
    const lan = await x.waitFor(() => window.__game?.lan?.()?.session === 'ended', null, 10000);
    if (!lan) throw new Error(`${n}: session not 'ended' after the natural end (the room dead-end root cause)`);
  }
  await shot('01_host_debrief_retry_visible', H.page);
  await shot('02_client_debrief_retry_visible', C.page);
  step('natural end: Debrief on both, RETRY visible, session ended');

  // ---- both EXIT to the room: the room must be actionable (was: dead-end with stale READY badges) ---------------
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitScreen('State_Debrief', 'Screen_Debrief', 20000))) throw new Error(`${n}: debrief screen never normalized`);
  }
  const exitBtnH = await h.centreOf('m.mcScreen._Exit');
  const exitBtnC = await c.centreOf('m.mcScreen._Exit');
  if (!exitBtnH || !exitBtnC) throw new Error('debrief EXIT button not found');
  // Click EXIT; a button that misses on the very first frames after normalization gets one retry (the packaged
  // app's frame pacing at off-screen window priority is not guaranteed).
  for (const [n, x, pg, btn] of [['host', h, H.page, exitBtnH], ['client', c, C.page, exitBtnC]]) {
    await x.click(btn.x, btn.y);
    await pg.waitForTimeout(1500);
    if (await pg.evaluate(() => window.__game.state()) === 'State_Debrief') {
      step(`${n}: EXIT click did not land, retrying once`);
      await x.click(btn.x, btn.y);
    }
  }
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) {
      const dbg = await x.page ? null : null; // (placeholder, real diagnostics below use the failing page)
      const diag = await (n === 'host' ? H : C).page.evaluate(() => {
        const m = window.__game.main();
        const s = m.mcScreen;
        const b = s._Exit.getBounds(m._parent);
        const c = document.querySelector('canvas').getBoundingClientRect();
        const px = c.left + (((b.xMin + b.xMax) / 2) / 640) * c.width;
        const py = c.top + (((b.yMin + b.yMax) / 2) / 480) * c.height;
        const el = document.elementFromPoint(px, py);
        return {
          state: window.__game.state(), exitBounds: b, atPoint: el ? `${el.tagName}.${el.className || ''} w=${el.getBoundingClientRect().width}` : 'none',
          nState: s.nState ?? null, domInputs: [...document.querySelectorAll('input,textarea')].map((i) => { const r = i.getBoundingClientRect(); return `${i.tagName}@${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}`; }),
        };
      });
      await shot('dbg_after_exit_host', H.page);
      throw new Error(`${n}: no room after EXIT (${JSON.stringify(diag)})`);
    }
    if (!(await x.waitFor(() => window.__game?.lan?.()?.bridge === 'lobby', null, 10000))) {
      throw new Error(`${n}: bridge not back in lobby after the natural end (${JSON.stringify(await C.page.evaluate(() => window.__game.lan()))})`);
    }
  }
  await shot('03_host_room_actionable', H.page);
  await shot('04_client_room_after_natural_end', C.page);
  step('room actionable on both after the natural end (the v0.2.1 fix)');

  // ---- SECOND game started IN-PROCESS (the wire start consumed by the live session) ------------------------------
  step('starting game 2 in-process');
  await h.click(...START_ROOM_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitScreen('State_LanSetup', 'Screen_LanSetup', 20000))) throw new Error(`${n}: no setup screen for game 2 (stale READY should gate straight through)`);
  }
  await h.click(...START_GAME_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) {
      throw new Error(`${n}: game 2 did not start (${await x.worldInfo()})`);
    }
    if (!(await x.waitFor(() => window.__game?.lan?.()?.bridge === 'playing', null, 10000))) {
      throw new Error(`${n}: bridge not playing on the in-process second game (stuck-phase bug)`);
    }
  }
  const wi2 = await h.worldInfo();
  const wc2 = await c.worldInfo();
  if (Math.abs(wi2.tick - wc2.tick) > 2) throw new Error(`game 2 tick drift ${wi2.tick} vs ${wc2.tick}`);
  step(`game 2 running in-process: host=${JSON.stringify(wi2)} client=${JSON.stringify(wc2)}`);
  await shot('05_game2_running', H.page);

  // ---- second natural end -> the CLIENT presses Debrief RETRY -> both rebuild -------------------------------------
  step('second natural end');
  await h.killBoth();
  await c.killBoth();
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game.state() === 'State_Debrief', null, 60000))) throw new Error(`${n}: no debrief after the second natural end`);
  }
  await shot('06_client_debrief_before_retry', C.page);
  const retryBtn = await c.centreOf('m.mcScreen._Retry');
  if (!retryBtn) throw new Error('client debrief RETRY button not found');
  step(`client pressing Debrief RETRY at ${JSON.stringify(retryBtn)}`);
  await c.click(retryBtn.x, retryBtn.y);
  await C.page.waitForTimeout(2000);
  // Same first-click flakiness as the EXIT button: verify the request reached the host, retry the click once.
  if (await H.page.evaluate(() => window.__game.state()) !== 'State_RunWorld') {
    step('RETRY click did not land on the client, retrying once');
    await c.click(retryBtn.x, retryBtn.y);
  }
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) {
      throw new Error(`${n}: the coordinated retry did not rebuild the game (${await x.worldInfo()})`);
    }
    if (!(await x.waitFor(() => window.__game?.lan?.()?.session === 'playing', null, 10000))) throw new Error(`${n}: session not playing after the retry`);
  }
  const wi3 = await h.worldInfo();
  const wc3 = await c.worldInfo();
  // No wave advance ever happened -> no checkpoint -> the retry is a FRESH run at the run-start wave (1),
  // score reset (v0.2.0 local semantics, now identical over the wire).
  if (wi3.level !== 1 || wc3.level !== 1) throw new Error(`retry wave ${wi3.level}/${wc3.level}, wanted 1 (fresh run at the failed wave)`);
  if (wi3.score !== 0 || wc3.score !== 0) throw new Error(`retry score not reset: ${wi3.score}/${wc3.score}`);
  if (Math.abs(wi3.tick - wc3.tick) > 2) throw new Error(`retry tick drift ${wi3.tick} vs ${wc3.tick}`);
  step(`coordinated retry rebuilt both peers: host=${JSON.stringify(wi3)} client=${JSON.stringify(wc3)}`);
  await shot('07_host_retry_rebuilt', H.page);
  await shot('08_client_retry_rebuilt', C.page);

  report.ok = report.errors.length === 0;
} catch (e) {
  report.errors.push(String(e?.message ?? e));
} finally {
  writeFileSync(join(OUT, 'net_retry_report.json'), JSON.stringify(report, null, 2));
  try { await H?.app.close(); } catch {}
  try { await C?.app.close(); } catch {}
}
console.log(report.ok ? 'PACKAGED NET-RETRY PLAYTEST PASSED' : `PACKAGED NET-RETRY PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
