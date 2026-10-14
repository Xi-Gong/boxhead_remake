// v0.1.3 packaged LAN playtest: TWO real exes on one machine over a real localhost TCP connection (the full
// Electron main-process transport). Both windows are created off-screen so the run never disturbs foreground work.
// Flow: host lobby -> HOST, client joins by manual IP -> START GAME -> coop runs in lockstep (ticks/scores equal on
// both machines) -> forced wave checkpoint -> client process killed -> host freezes with the reconnect overlay ->
// client relaunched, rejoins -> BOTH resume from the checkpoint (the restarted client adopts the host's snapshot)
// -> lockstep continues -> host pause QUIT forfeits -> both reach the debrief.
//   node tests/sim/playtest.net.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'generated/reports/qa');
mkdirSync(OUT, { recursive: true });
// Fresh save dirs every run (a leftover stored run would grow a CONTINUE item on the menu).
for (const d of ['net-host', 'net-client']) {
  try { rmSync(join(OUT, d), { recursive: true, force: true }); } catch { /* best effort */ }
}

const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];
const OFFSCREEN = ['-32000', '0'];

const report = { ok: false, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const shot = async (name, page) => { const p = join(OUT, `net_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step(`shot ${p}`); };

async function launchApp(dirName) {
  const app = await electron.launch({
    executablePath: join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
    cwd: ROOT,
    timeout: 60000,
    args: [...NO_THROTTLE, '--boxhead-multi', `--window-position=${OFFSCREEN[0]},${OFFSCREEN[1]}`],
    env: { ...process.env, PORTABLE_EXECUTABLE_DIR: join(OUT, dirName) },
  });
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
  const state = () => page.evaluate(() => window.__game?.state?.());
  // waitForFunction serialises the predicate into the page: arguments must be passed, not closed over.
  const waitFor = async (fn, arg = null, timeout = 30000) => {
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
    await page.waitForTimeout(80);
  };
  const worldInfo = () => page.evaluate(() => {
    const w = window.__game.main().mcWorld;
    if (!w?.mUpgrades) return null;
    const players = Object.keys(w.mThing_Collection.mPlayerThings).map((k) => w.mThing_Collection.mPlayerThings[k]).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
    return {
      room: w.mWorldLibLink, level: w.mUpgrades.mLevelIndex, tick: w.mTick, score: w.mHud.nTotalScore,
      px: players[0]?.mPosition.mX, py: players[0]?.mPosition.mY,
      c2x: players[1]?.mPosition.mX, c2y: players[1]?.mPosition.mY,
    };
  });
  const lobbyLabel = () => page.evaluate(() => window.__game.main()?.mcScreen?.bAction?._Contents?._Label?.text ?? null);
  return { state, waitFor, waitScreen, click, worldInfo, lobbyLabel };
}

const LAN_BTN = [320, 392.4];
const ACTION_BTN = [175, 252]; // HOST / START GAME / RESUME GAME
const JOIN_BTN = [585, 285];

const lanState = async (name, page) => step(`[lan ${name}] ${JSON.stringify(await page.evaluate(() => window.__game?.lan?.()))}`);

const dumpLobby = async (name, page) => {
  const info = await page.evaluate(() => {
    const s = window.__game.main()?.mcScreen;
    return {
      state: window.__game.state(),
      action: s?.bAction?._Contents?._Label?.text,
      status: s?.statusText?.text,
      ip: document.querySelector('input[type=text]')?.value ?? null,
      ipVisible: document.querySelector('input[type=text]')?.style.display ?? null,
    };
  });
  step(`[dump ${name}] ${JSON.stringify(info)}`);
};

let H, C, C2;
try {
  // ---- host instance -------------------------------------------------------------------
  step('launching host instance');
  const H = await launchApp('net-host');
  const h = helpers(H.page);
  if (!(await h.waitFor(() => window.__game?.ready, null, 120000))) throw new Error('host boot failed');
  if (!(await h.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`host: no main menu (${await h.state()})`);
  await H.page.waitForTimeout(300);
  await shot('01_host_main', H.page);
  await h.click(...LAN_BTN);
  if (!(await h.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`host: no lobby (${await h.state()})`);
  await h.click(...ACTION_BTN); // HOST
  await H.page.waitForTimeout(500);
  step('host is hosting');

  // ---- client instance -----------------------------------------------------------------
  step('launching client instance');
  const C = await launchApp('net-client');
  const c = helpers(C.page);
  if (!(await c.waitFor(() => window.__game?.ready, null, 120000))) throw new Error('client boot failed');
  if (!(await c.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`client: no main menu (${await c.state()})`);
  await c.click(...LAN_BTN);
  if (!(await c.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`client: no lobby (${await c.state()})`);
  await C.page.fill('input[type=text]', '127.0.0.1');
  await c.click(...JOIN_BTN);
  step('client joining by manual IP');

  // ---- both connected -> start -----------------------------------------------------------
  if (!(await h.waitFor(() => window.__game.main()?.mcScreen?.bAction?._Contents?._Label?.text === 'START GAME', null, 20000))) {
    await dumpLobby('host', H.page);
    await dumpLobby('client', C.page);
    throw new Error(`host never saw the client join (${await h.lobbyLabel()})`);
  }
  await shot('02_host_lobby', H.page);
  await h.click(...ACTION_BTN); // START GAME
  if (!(await h.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`host: room did not start (${await h.state()})`);
  if (!(await c.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`client: room did not start (${await c.state()})`);
  const wi0 = await h.worldInfo();
  const wc0 = await c.worldInfo();
  step(`game running: host=${JSON.stringify(wi0)} client=${JSON.stringify(wc0)}`);
  if (wi0 == null || wc0 == null || wi0.room !== wc0.room) throw new Error('rooms mismatch');
  await shot('03_host_ingame', H.page);

  // ---- lockstep play: 12 s of keys on both machines --------------------------------------
  const t0 = Date.now();
  let toggle = false;
  while (Date.now() - t0 < 12000) {
    toggle = !toggle;
    await H.page.keyboard.down(toggle ? 'ArrowRight' : 'ArrowLeft');
    await H.page.keyboard.down('Slash');
    await C.page.keyboard.down(toggle ? 'KeyD' : 'KeyA');
    await C.page.keyboard.down('Space');
    await H.page.waitForTimeout(250);
    await H.page.keyboard.up(toggle ? 'ArrowRight' : 'ArrowLeft');
    await C.page.keyboard.up(toggle ? 'KeyD' : 'KeyA');
    await H.page.waitForTimeout(250);
  }
  await H.page.keyboard.up('Slash');
  await C.page.keyboard.up('Space');
  const wi1 = await h.worldInfo();
  const wc1 = await c.worldInfo();
  step(`after play: host=${JSON.stringify(wi1)} client=${JSON.stringify(wc1)}`);
  if (wi1.tick <= wi0.tick) {
    await lanState('host', H.page);
    await lanState('client', C.page);
  }
  if (Math.abs(wi1.tick - wc1.tick) > 2) throw new Error(`tick drift ${wi1.tick} vs ${wc1.tick} (lockstep broken)`);
  if (wi1.tick <= wi0.tick) throw new Error('no ticks ran');
  if (wi1.score !== wc1.score) throw new Error(`score mismatch ${wi1.score} vs ${wc1.score}`);

  // ---- force a wave checkpoint on the host (out-of-band: exactly the "client crashed and lost its own
  // checkpoint" scenario - the resume below must transfer the host's snapshot to the restarted client) ----
  await H.page.evaluate(() => {
    const u = window.__game.main().mcWorld.mUpgrades;
    u.__set__mLevel(u.mLevelIndex + 1);
  });
  await H.page.waitForTimeout(500);
  const wi2 = await h.worldInfo();
  if (wi2.level !== 2) throw new Error(`forced advance did not take (${wi2.level})`);
  step(`forced checkpoint at wave ${wi2.level}, host tick ${wi2.tick} (client keeps wave 1 until the resume)`);

  // ---- kill the client: the host must freeze and wait ------------------------------------
  step('killing the client process');
  await C.app.close();
  const frozenTick = (await h.worldInfo()).tick;
  await H.page.waitForTimeout(3000);
  const stillTick = (await h.worldInfo()).tick;
  if (stillTick !== frozenTick) throw new Error(`host kept simulating without the client (${frozenTick} -> ${stillTick})`);
  const overlay = await H.page.evaluate(() => document.querySelector('div[style*="z-index:8"]')?.textContent ?? null);
  step(`host frozen at tick ${stillTick}, overlay: ${JSON.stringify(overlay)}`);
  await shot('04_host_reconnecting', H.page);

  // ---- relaunch the client and rejoin: both resume from the checkpoint --------------------
  step('relaunching the client (fresh process, no local checkpoint)');
  const C2 = await launchApp('net-client');
  const c2 = helpers(C2.page);
  if (!(await c2.waitFor(() => window.__game?.ready, null, 120000))) throw new Error('client relaunch failed');
  if (!(await c2.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error('client relaunch: no main menu');
  await c2.click(...LAN_BTN);
  if (!(await c2.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error('client relaunch: no lobby');
  await C2.page.fill('input[type=text]', '127.0.0.1');
  await c2.click(...JOIN_BTN);
  if (!(await h.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error('host did not resume');
  if (!(await c2.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error('client did not resume');
  const wi3 = await h.worldInfo();
  const wc3 = await c2.worldInfo();
  step(`resumed: host=${JSON.stringify(wi3)} client=${JSON.stringify(wc3)}`);
  if (wi3.level !== wi2.level || wc3.level !== wi2.level) throw new Error(`resume lost the wave: ${wi3.level}/${wc3.level} vs ${wi2.level}`);
  if (wi3.score !== wc3.score) throw new Error(`resume score mismatch ${wi3.score} vs ${wc3.score}`);
  await shot('05_resumed', H.page);

  // ---- lockstep runs again after the resume ----------------------------------------------
  await H.page.keyboard.down('ArrowUp');
  await H.page.keyboard.down('Slash');
  await C2.page.keyboard.down('KeyW');
  await C2.page.keyboard.down('Space');
  await H.page.waitForTimeout(4000);
  await H.page.keyboard.up('ArrowUp');
  await H.page.keyboard.up('Slash');
  await C2.page.keyboard.up('KeyW');
  await C2.page.keyboard.up('Space');
  const wi4 = await h.worldInfo();
  const wc4 = await c2.worldInfo();
  if (wi4.tick <= wi3.tick || wc4.tick <= wi3.tick) throw new Error('no ticks after the resume');
  if (Math.abs(wi4.tick - wc4.tick) > 2) throw new Error(`post-resume tick drift ${wi4.tick} vs ${wc4.tick}`);
  if (wi4.score !== wc4.score) throw new Error(`post-resume score mismatch ${wi4.score} vs ${wc4.score}`);
  step(`post-resume lockstep ok: host tick ${wi4.tick} = client tick ${wc4.tick}, score ${wi4.score}`);

  // ---- forfeit: host pause + QUIT ends the run on both peers ------------------------------
  await H.page.keyboard.press('KeyP');
  await H.page.waitForTimeout(500);
  await h.click(320, 52); // the pause screen's QUIT (rewired to session.forfeit in net games)
  if (!(await h.waitFor(() => window.__game.state() === 'State_Debrief', null, 30000))) throw new Error(`host: no debrief after forfeit (${await h.state()})`);
  const clientEnd = await c2.waitFor(() => window.__game.state() === 'State_Debrief' || window.__game.state() === 'State_Debrief_Winner', null, 30000);
  step(`forfeit: host debrief, client ended=${clientEnd} (${await c2.state()})`);
  await shot('06_host_debrief', H.page);
  if (!clientEnd) throw new Error('client did not end after the forfeit');

  report.ok = report.errors.length === 0;
} catch (e) {
  report.errors.push(String(e?.message ?? e));
} finally {
  writeFileSync(join(OUT, 'net_report.json'), JSON.stringify(report, null, 2));
  // Best-effort cleanup of every electron instance we started.
  try { await H?.app.close(); } catch {}
  try { await C?.app.close(); } catch {}
  try { await C2?.app.close(); } catch {}
}
console.log(report.ok ? 'PACKAGED v0.1.3 LAN PLAYTEST PASSED' : `PACKAGED v0.1.3 LAN PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
