// Lane Q: browser playtest of the REAL app (vite dev server) with playwright-core + the installed Chrome.
// For each mode: boot -> main menu (mouse) -> level selection -> room; ~20 s of scripted play with the real keyboard
// path (P1 arrows + '/' + ',' '.', P2 WASD + Space + Q E, small reactive aim like the sim bots), pause / unpause (P),
// QUIT from the pause screen -> debrief (Death Match: back to the selection), RETRY -> room again -> QUIT.
// Collects console errors/warnings, page errors and the engine script errors (window.__game.errors); screenshots and
// a JSON report go to generated/reports/qa/.
//   usage: node tests/sim/playtest.browser.mjs [Single|Coop|DeathMatch ...]     (GAME_URL, default http://localhost:5198/)
// Serve a production build so concurrent source edits (vite HMR full reloads) cannot disturb the run:
//   npx vite build --outDir generated/qa-dist --emptyOutDir && npx vite preview --outDir generated/qa-dist --port 5198
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../generated/reports/qa');
mkdirSync(OUT, { recursive: true });
const URL = process.env.GAME_URL ?? 'http://localhost:5198/';
const MODES = process.argv.slice(2).length ? process.argv.slice(2) : ['Single', 'Coop', 'DeathMatch'];
const PLAY_MS = Number(process.env.PLAY_MS ?? 20000);
const MENU_Y = { Single: 226, Coop: 259, DeathMatch: 292 };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const report = { url: URL, modes: {} };

for (const mode of MODES) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const log = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text().slice(0, 500)}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) log.push(`[http ${r.status()}] ${r.url()}`); });
  const steps = [];
  const step = (s) => { steps.push(s); console.log(mode, s); };
  const shot = async (name) => { const p = join(OUT, `${mode}_${name}.png`); await page.screenshot({ path: p }); steps.push(`shot ${p}`); };
  const state = () => page.evaluate(() => window.__game?.state?.());
  const waitFor = async (fn, arg, timeout = 30000) => {
    try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
  };
  const waitScreen = (st, id, timeout = 30000) => waitFor(([st, id]) => {
    const m = window.__game?.main?.();
    return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
  }, [st, id], timeout);
  /** stage (640x480 logical) -> page coordinates of the letterboxed canvas */
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
  /** centre of a clip given by a JS path from CMain (stage coordinates) */
  const centreOf = (expr) => page.evaluate((expr) => {
    const m = window.__game.main();
    const mc = new Function('m', `return ${expr};`)(m);
    if (!mc) return null;
    const b = mc.getBounds(m._parent);
    if (!(b.xMax < 10000)) return null; // empty clip: Flash reports 6710886.35 for every edge
    return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
  }, expr);
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const result = { ok: false, steps, errors: [], log, world: [] };
  report.modes[mode] = result;
  try {
    await page.goto(URL);
    await waitFor(() => window.__game && (window.__game.stage === 'audio' || window.__game.ready || window.__game.stage === 'failed'), null, 120000);
    if (!(await page.evaluate(() => window.__game.ready))) { await page.mouse.click(480, 360); step('clicked the audio-unlock overlay'); }
    await waitFor(() => window.__game.ready || window.__game.stage === 'failed', null, 30000);
    step(`stage ${await page.evaluate(() => window.__game.stage)}`);
    if (!(await waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`no main menu (state ${await state()})`);
    await page.waitForTimeout(400);
    await shot('01_main');
    // main menu button (mouse) -> level selection
    await click(320, MENU_Y[mode]);
    if (!(await waitScreen(`State_SelectWorld_${mode}`, 'Screen_SelectWorld', 15000))) throw new Error(`no level selection (state ${await state()})`);
    await page.waitForTimeout(300);
    await shot('02_select');
    // the level icon (preview) starts the room
    const icon = await centreOf('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');
    await click(icon?.x ?? 392, icon?.y ?? 223);
    if (!(await waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`room did not start (state ${await state()})`);
    step(`room running: ${await page.evaluate(() => window.__game.main().mcWorld.mWorldLibLink)}`);
    await page.waitForTimeout(500);
    await shot('03_room_start');

    // ---- scripted play
    const t0 = Date.now();
    let n = 0;
    const P = [
      { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Slash', next: 'Period', prev: 'Comma' },
      { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space', next: 'KeyE', prev: 'KeyQ' },
    ];
    const nPlayers = mode === 'Single' ? 1 : 2;
    let fireToggle = false;
    while (Date.now() - t0 < PLAY_MS) {
      const s = await page.evaluate((mode) => {
        const w = window.__game.main().mcWorld;
        if (!w?.mThing_Collection) return null;
        const tc = w.mThing_Collection;
        const players = Object.keys(tc.mPlayerThings).map((k) => tc.mPlayerThings[k]).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
        const things = Object.keys(tc.mThings).map((k) => tc.mThings[k]);
        const out = players.map((p) => {
          const enemies = mode === 'DeathMatch' ? players.filter((q) => q !== p) : things.filter((t) => (t._CLASSID_ === 'CThing_Creature_Zombie' || t._CLASSID_ === 'CThing_Creature_Devil') && !(t.mFlags & 32));
          let best = null, bd = 1e9;
          for (const e of enemies) { const d = Math.hypot(e.mPosition.mX - p.mPosition.mX, e.mPosition.mY - p.mPosition.mY); if (d < bd) { bd = d; best = e; } }
          return { ok: p.mStateID === 'State_PlayerControl', dx: best ? best.mPosition.mX - p.mPosition.mX : 0, dy: best ? best.mPosition.mY - p.mPosition.mY : 0, d: bd, dir: p.mAngle.__get__mDirection() };
        });
        return { players: out, tick: w.mTick, level: w.mUpgrades.mLevelIndex, mult: w.mUpgrades.mMultiplierIndex, score: w.mHud.nTotalScore, deaths: [w.mHud.mPlayer1_Deaths, w.mHud.mPlayer2_Deaths], state: window.__game.state() };
      }, mode);
      if (!s || s.state !== 'State_RunWorld') break;
      const want = new Set();
      fireToggle = !fireToggle;
      for (let i = 0; i < nPlayers; i++) {
        const p = s.players[i], k = P[i];
        if (!p || !p.ok) continue;
        if (n % 60 === 30) { want.add(n % 120 === 30 ? k.next : k.prev); continue; }
        const ax = Math.abs(p.dx), ay = Math.abs(p.dy);
        if (p.d < 9) {
          // face the enemy on the 8-direction grid for a moment, then fire
          if (fireToggle) {
            if (ax > ay * 0.4) want.add(p.dx > 0 ? k.right : k.left);
            if (ay > ax * 0.4) want.add(p.dy > 0 ? k.down : k.up);
          } else want.add(k.fire);
        } else if (n % 8 < 3) {
          want.add([k.up, k.right, k.down, k.left][(n >> 3) % 4]);
        }
      }
      await setKeys(want);
      await page.waitForTimeout(90);
      if (n % 40 === 0) result.world.push(s);
      if (n === 60) await shot('04_playing');
      n++;
    }
    await setKeys(new Set());
    await shot('05_after_play');
    const before = await page.evaluate(() => { const w = window.__game.main().mcWorld; return w ? { tick: w.mTick, level: w.mUpgrades.mLevelIndex, mult: w.mUpgrades.mMultiplierIndex, score: w.mHud.nTotalScore } : null; });
    step(`after play: ${JSON.stringify(before)} (state ${await state()})`);

    if ((await state()) === 'State_RunWorld') {
      // ---- pause / unpause
      await page.keyboard.press('KeyP');
      await page.waitForTimeout(500);
      const paused = await page.evaluate(() => ({ p: window.__game.main().mcWorld.mPaused, t: window.__game.main().mcWorld.mTick }));
      await shot('06_paused');
      await page.waitForTimeout(800);
      const stillPaused = await page.evaluate(() => window.__game.main().mcWorld.mTick);
      step(`paused=${paused.p} tick ${paused.t} -> ${stillPaused} (must not advance)`);
      if (!paused.p || stillPaused !== paused.t) result.errors.push('pause did not freeze the world');
      await page.keyboard.press('KeyP');
      await page.waitForTimeout(600);
      const resumed = await page.evaluate(() => ({ p: window.__game.main().mcWorld.mPaused, t: window.__game.main().mcWorld.mTick }));
      step(`resumed paused=${resumed.p} tick ${resumed.t}`);
      if (resumed.p || resumed.t <= stillPaused) result.errors.push('unpause did not resume the world');
      // ---- quit via the pause screen
      await page.keyboard.press('KeyP');
      await page.waitForTimeout(500);
      const quit = await centreOf('m.mcWorld.mHud.mcScreenPause._Quit');
      step(`QUIT button at ${JSON.stringify(quit)}`);
      if (quit) await click(quit.x, quit.y);
    }
    const afterQuit = mode === 'DeathMatch' ? ['State_SelectWorld_DeathMatch', 'Screen_SelectWorld'] : ['State_Debrief', 'Screen_Debrief'];
    if (!(await waitScreen(afterQuit[0], afterQuit[1], 15000))) throw new Error(`quit did not reach ${afterQuit[0]} (state ${await state()})`);
    await page.waitForTimeout(400);
    await shot('07_after_quit');
    // ---- retry (debrief RETRY; Death Match: the level icon again)
    if (mode === 'DeathMatch') {
      const icon2 = await centreOf('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');
      await click(icon2?.x ?? 392, icon2?.y ?? 223);
    } else {
      const retry = await centreOf('m.mcScreen._Retry');
      step(`RETRY button at ${JSON.stringify(retry)}`);
      await click(retry.x, retry.y);
    }
    if (!(await waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`retry did not restart (state ${await state()})`);
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(800); await page.keyboard.up('ArrowLeft');
    await shot('08_retry_running');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(400);
    const quit2 = await centreOf('m.mcWorld.mHud.mcScreenPause._Quit');
    if (quit2) await click(quit2.x, quit2.y);
    if (!(await waitScreen(afterQuit[0], afterQuit[1], 15000))) throw new Error(`second quit did not reach ${afterQuit[0]}`);
    await shot('09_end');
    result.ok = true;
  } catch (e) {
    result.errors.push(String(e?.stack ?? e));
    console.log(mode, 'ERROR', e);
    await shot('99_error').catch(() => {});
  }
  result.scriptErrors = await page.evaluate(() => window.__game?.errors ?? []).catch(() => ['<page gone>']);
  result.consoleErrors = log.filter((l) => /^\[(error|pageerror)/.test(l));
  result.consoleWarnings = log.filter((l) => /^\[warning/.test(l));
  if (result.scriptErrors.length || result.consoleErrors.length) result.ok = false;
  console.log(mode, result.ok ? 'OK' : 'FAILED', `script errors ${result.scriptErrors.length}, console errors ${result.consoleErrors.length}, warnings ${result.consoleWarnings.length}`);
  for (const e of [...result.scriptErrors, ...result.consoleErrors].slice(0, 5)) console.log('  ', e.slice(0, 400));
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, 'playtest_report.json'), JSON.stringify(report, null, 1));
console.log('report', join(OUT, 'playtest_report.json'));
process.exit(Object.values(report.modes).every((m) => m.ok) ? 0 : 1);
