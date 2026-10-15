// v0.1.4 packaged LAN playtest: TWO real exes on one machine over a real localhost TCP connection (the full
// Electron main-process transport). Both windows are created off-screen so the run never disturbs foreground work.
// Flow: host CREATE ROOM -> client joins by manual IP -> client READY -> host START -> BOTH on the net setup screen
// (the client mirrors the host's selection read-only) -> host changes a character, START GAME -> coop runs in lockstep
// (ticks/scores equal on both machines) -> forced wave checkpoint -> client process killed -> host freezes with a
// TICKING reconnect countdown (two samples must decrease) -> client relaunched, rejoins -> BOTH resume from the
// checkpoint (the restarted client adopts the host's snapshot) -> lockstep continues -> host pause QUIT concedes ->
// both reach the debrief (a concede keeps the regular end screens) -> back to the room, host RESUME -> client killed
// again -> the countdown runs out -> the HOST ends at the MAIN MENU (timeout forfeits route there since v0.1.4).
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
  /** The reconnect countdown overlay text (the DOM now also carries the ping + input badge - match by content,
   *  and take the LAST matching div so ancestors like #stage that merely CONTAIN the strip are skipped). */
  const overlayText = () => page.evaluate(() => {
    let found = null;
    for (const d of document.querySelectorAll('div')) {
      const t = d.textContent ?? '';
      if (/RECONNECT|GAME OVER|RUN OVER|CONNECTION LOST/.test(t)) found = t;
    }
    return found;
  });
  /** The v0.1.7 live in-game ping readout (top-right overlay div), null when absent/hidden. */
  const pingText = () => page.evaluate(() => {
    for (const d of document.querySelectorAll('div')) {
      if (d.style.right !== '10px' || d.style.top !== '8px') continue;
      const t = (d.textContent ?? '').trim();
      if (/(^<1|\d+)\s*ms$/.test(t)) return d.style.display === 'block' ? t : null;
    }
    return null;
  });
  return { state, waitFor, waitScreen, click, worldInfo, overlayText, pingText };
}

const LAN_BTN = [320, 392.4];
// v0.1.4 lobby (entry + room views) and setup screen button centres (logical 640x480 coordinates).
const CREATE_ROOM_BTN = [170, 220];
const JOIN_BTN = [565, 328];
const READY_BTN = [220, 330]; // client, room view
const START_ROOM_BTN = [220, 330]; // host, room view (gated on player 2 being ready)
const RESUME_BTN = [320, 290]; // host, room view (after a finished game with a checkpoint)
const P2_CHAR_RIGHT = [160, 276]; // the P2 character card's > arrow on the setup screen
const START_GAME_BTN = [320, 452]; // setup screen

const lanState = async (name, page) => step(`[lan ${name}] ${JSON.stringify(await page.evaluate(() => window.__game?.lan?.()))}`);

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
  await shot('02_host_entry', H.page);
  await h.click(...CREATE_ROOM_BTN);
  if (!(await h.waitFor(() => window.__game?.lan?.()?.bridge === 'hosting', null, 20000))) throw new Error(`host: CREATE ROOM did not host (${await h.state()})`);
  step('host is hosting (room view)');

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

  // ---- both in the room: READY gating -----------------------------------------------------
  if (!(await h.waitFor(() => !!window.__game?.lan?.()?.peerName, null, 20000))) {
    await lanState('host', H.page);
    await lanState('client', C.page);
    throw new Error('host never saw the client join');
  }
  if (!(await c.waitFor(() => window.__game?.lan?.()?.bridge === 'lobby', null, 20000))) throw new Error(`client never reached the room (${await c.state()})`);
  await shot('03_host_room', H.page);
  // The host's START is dimmed/inert until the client readies up (bridge.enterSetup guards on it).
  await h.click(...START_ROOM_BTN); // not ready yet -> nothing must happen
  await H.page.waitForTimeout(600);
  if (await H.page.evaluate(() => window.__game.state()) !== 'State_LanLobby') throw new Error('host START worked before player 2 was ready');
  await c.click(...READY_BTN);
  if (!(await h.waitFor(() => window.__game?.lan?.()?.ready === true, null, 20000))) throw new Error('host never saw the READY flag');
  step('client READY, host START unlocked');

  // ---- the setup screen: host-driven, client mirrored ------------------------------------
  await h.click(...START_ROOM_BTN);
  if (!(await h.waitScreen('State_LanSetup', 'Screen_LanSetup', 20000))) throw new Error(`host: no setup screen (${await h.state()})`);
  if (!(await c.waitScreen('State_LanSetup', 'Screen_LanSetup', 20000))) throw new Error(`client: no setup screen (${await c.state()})`);
  await shot('04_host_setup', H.page);
  await shot('05_client_setup_mirror', C.page);
  // The client mirrors the host's selection (default: coop, BAMBO vs SWAT, level 1).
  const selH = await H.page.evaluate(() => window.__game.lan().sel);
  const selC = await C.page.evaluate(() => window.__game.lan().sel);
  step(`setup sel host=${JSON.stringify(selH)} client=${JSON.stringify(selC)}`);
  if (JSON.stringify(selH) !== JSON.stringify(selC)) throw new Error('setup selection not mirrored');
  // A host change mirrors live: the P2 card's > arrow bumps charP2 on BOTH machines.
  await h.click(...P2_CHAR_RIGHT);
  if (!(await c.waitFor(() => window.__game?.lan?.()?.sel?.charP2 === 1, null, 20000))) throw new Error('client did not mirror the character change');
  step('character change mirrored to the client');

  await h.click(...START_GAME_BTN);
  if (!(await h.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`host: room did not start (${await h.state()})`);
  if (!(await c.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error(`client: room did not start (${await c.state()})`);
  const wi0 = await h.worldInfo();
  const wc0 = await c.worldInfo();
  step(`game running: host=${JSON.stringify(wi0)} client=${JSON.stringify(wc0)}`);
  if (wi0 == null || wc0 == null || wi0.room !== wc0.room) throw new Error('rooms mismatch');
  if (wi0.room !== 'ROOM_Single_0001') throw new Error(`unexpected start room ${wi0.room} (setup selection ignored?)`);
  await shot('06_host_ingame', H.page);
  // v0.1.7: both peers agree on the lockstep input delay, and the live ping readout is up during play.
  const dH0 = await H.page.evaluate(() => window.__game.lan().inputDelay);
  const dC0 = await C.page.evaluate(() => window.__game.lan().inputDelay);
  if (dH0 !== dC0) throw new Error(`inputDelay mismatch at start: host ${dH0} vs client ${dC0}`);
  step(`lockstep inputDelay ${dH0} on both peers`);
  const ping0 = await h.pingText();
  if (!ping0) throw new Error('in-game ping readout missing during play');
  step(`in-game ping readout live: ${ping0}`);
  // v0.1.10 gate: BOTH packaged peers must run a healthy audio engine during LAN play (all 31 decoded, running,
  // nothing failed) - the "no sound from game start" regression this release fixes, checked on both machines.
  for (const [name, P] of [['host', H], ['client', C]] as const) {
    const a = await P.page.evaluate(() => window.__game.audio?.());
    if (!a || a.state !== 'running' || a.decoded !== 31 || a.failed.length !== 0) {
      throw new Error(`${name} audio gate failed: ${JSON.stringify(a)}`);
    }
    step(`${name} audio healthy: ${JSON.stringify(a)}`);
  }

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

  // ---- kill the client: the host must freeze with a TICKING countdown ----------------------
  step('killing the client process');
  await C.app.close();
  // Boot the replacement client IN THE BACKGROUND right away: the reconnect window is 30 s and the packaged exe
  // takes 10-15 s to reach the menu, so overlapping the boot with the freeze checks keeps the rejoin comfortable.
  const relaunch = launchApp('net-client');
  const frozenTick = (await h.worldInfo()).tick;
  await H.page.waitForTimeout(2000);
  const stillTick = (await h.worldInfo()).tick;
  await lanState('host-after-kill', H.page);
  const secs = (t) => Number(/(\d+)s/.exec(t ?? '')?.[1] ?? NaN);
  const killOverlay = await h.overlayText();
  step(`host ${frozenTick} -> ${stillTick} (pre-kill ${wi2.tick}), state=${await h.state()}, overlay=${JSON.stringify(killOverlay)}`);
  if (stillTick !== frozenTick) throw new Error(`host kept simulating without the client (${frozenTick} -> ${stillTick})`);
  const tick1 = killOverlay;
  await H.page.waitForTimeout(1300);
  const tick2 = await h.overlayText();
  step(`host frozen at tick ${stillTick}, countdown: ${JSON.stringify(tick1)} -> ${JSON.stringify(tick2)}`);
  await shot('07_host_reconnecting', H.page);
  if (!/WAITING TO RECONNECT/.test(tick1 ?? '')) throw new Error(`no reconnect countdown overlay (${JSON.stringify(tick1)})`);
  if (!(secs(tick1) > secs(tick2))) throw new Error(`countdown is not ticking (${tick1} -> ${tick2})`);

  // ---- relaunch the client and rejoin: both resume from the checkpoint --------------------
  step('relaunching the client (fresh process, no local checkpoint)');
  const C2 = await relaunch;
  const c2 = helpers(C2.page);
  if (!(await c2.waitFor(() => window.__game?.ready, null, 120000))) throw new Error('client relaunch failed');
  if (!(await c2.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error('client relaunch: no main menu');
  await c2.click(...LAN_BTN);
  if (!(await c2.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error('client relaunch: no lobby');
  await C2.page.fill('input[type=text]', '127.0.0.1');
  await c2.click(...JOIN_BTN);
  if (!(await h.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 25000))) {
    await lanState('host-resume-fail', H.page);
    await lanState('client-resume-fail', C2.page);
    throw new Error(`host did not resume (host ${await h.state()}, client ${await c2.state()})`);
  }
  if (!(await c2.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error('client did not resume');
  const wi3 = await h.worldInfo();
  const wc3 = await c2.worldInfo();
  step(`resumed: host=${JSON.stringify(wi3)} client=${JSON.stringify(wc3)}`);
  if (wi3.level !== wi2.level || wc3.level !== wi2.level) throw new Error(`resume lost the wave: ${wi3.level}/${wc3.level} vs ${wi2.level}`);
  if (wi3.score !== wc3.score) throw new Error(`resume score mismatch ${wi3.score} vs ${wc3.score}`);
  // v0.1.7 bugfix pin: the resume `start` must carry the input delay (a dropped field reset the restarted client
  // to D=1 while the host kept its measured D -> the host micro-stalled every tick after any resume).
  const dH1 = await H.page.evaluate(() => window.__game.lan().inputDelay);
  const dC1 = await C2.page.evaluate(() => window.__game.lan().inputDelay);
  if (dH1 !== dC1 || dH1 !== dH0) throw new Error(`inputDelay lost on resume: host ${dH1} vs client ${dC1} (start ${dH0})`);
  step(`resume kept inputDelay ${dH1} on both peers`);
  await shot('08_resumed', H.page);

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

  // ---- concede: host pause + QUIT ends the run on both peers (regular end screens) --------
  await H.page.keyboard.press('KeyP');
  await H.page.waitForTimeout(500);
  await h.click(320, 52); // the pause screen's QUIT (rewired to session.forfeit('concede') in net games)
  if (!(await h.waitFor(() => window.__game.state() === 'State_Debrief', null, 30000))) throw new Error(`host: no debrief after the concede (${await h.state()})`);
  const clientEnd = await c2.waitFor(() => window.__game.state() === 'State_Debrief' || window.__game.state() === 'State_Debrief_Winner', null, 30000);
  step(`concede: host debrief, client ended=${clientEnd} (${await c2.state()})`);
  await shot('09_host_debrief', H.page);
  if (!clientEnd) throw new Error('client did not end after the concede');
  // v0.1.7: the ping readout is in-game only (the lobby room view has its own PING line).
  const pingAfter = await h.pingText();
  if (pingAfter) throw new Error(`ping readout still visible after the game ended (${pingAfter})`);
  step('ping readout hidden after the end');

  // ---- resume from the room, then let the countdown RUN OUT: host ends at the main menu ----
  step('back to the room for the timeout section');
  await H.page.evaluate(() => window.__game.main().SetState('State_LanLobby')); // out-of-band, like the forced checkpoint
  await C2.page.evaluate(() => window.__game.main().SetState('State_LanLobby'));
  if (!(await h.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`host: no room after the debrief (${await h.state()})`);
  await shot('10_host_room_resume', H.page);
  await h.click(...RESUME_BTN);
  if (!(await h.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error('host did not resume for the timeout run');
  if (!(await c2.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error('client did not resume for the timeout run');
  step('resumed again; killing the client for good');
  await C2.app.close();
  const secsA = secs(await h.overlayText());
  await H.page.waitForTimeout(1500);
  const secsB = secs(await h.overlayText());
  if (!(secsA > secsB)) throw new Error(`second countdown is not ticking (${secsA} -> ${secsB})`);
  step(`countdown running: ${secsA}s -> ${secsB}s; waiting for the 30 s window to run out`);
  // The window is 30 s from the link loss; poll until the host lands on the MAIN MENU (timeout forfeit routing).
  if (!(await h.waitFor(() => window.__game.state() === 'State_Main', null, 40000))) {
    throw new Error(`host did not reach the main menu after the timeout (${await h.state()})`);
  }
  await shot('11_host_mainmenu_after_timeout', H.page);
  step(`timeout forfeit: host at the main menu after the countdown ran out (endReason=${await H.page.evaluate(() => window.__game?.lan?.()?.endReason)})`);

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
console.log(report.ok ? 'PACKAGED LAN PLAYTEST PASSED' : `PACKAGED LAN PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
