// v0.2.3 targeted visual-QA playtest: captures the four user-facing fixes that a cadence test cannot show:
//   A. room 11 (PATCHY) coop spawn - neither player embedded in a slab;
//   B. independent cameras - the players walk apart for 6 s, each screenshot shows ITS player centered
//      (shared-screen would drag both to the midpoint / off-screen);
//   C. pause overlay on BOTH peers (host presses P);
//   D. forced desync -> both peers land in the lobby with the banner line.
// Screenshots feed the zai vision gate (per the repo mandate); behavior asserts are geometric.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { isolateLanPorts } from '../e2e/lan-isolation.mjs';
import {lanWindowFlag,placeLanWindow,typeLanAddress} from '../e2e/lan-user-input.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'generated/reports/qa');
mkdirSync(OUT, { recursive: true });

const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];

const report = { ok: false, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const shot = async (name, page) => { const p = join(OUT, `v023_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step(`shot ${p}`); };

async function launchApp(dirName) {
  const app = await electron.launch({
    executablePath: join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
    cwd: ROOT,
    timeout: 60000,
    args: [...NO_THROTTLE, '--boxhead-multi', lanWindowFlag],
    env: { ...process.env, BOXHEAD_USER_DATA: join(OUT, dirName) },
  });
  await isolateLanPorts(app, report);
  const page = await app.firstWindow();
  await placeLanWindow(app,page);
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

const LAN_BTN = [320, 370];
const CREATE_ROOM_BTN = [320 - 117, 240 - 6];
const JOIN_BTN = [520, 350];
const READY_BTN = [210, 330];
const START_ROOM_BTN = [210, 330];
const START_GAME_BTN = [320, 444];

let H, C;
try {
  H = await launchApp('v023-host');
  const h = helpers(H.page);
  C = await launchApp('v023-client');
  const c = helpers(C.page);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game?.ready, null, 120000))) throw new Error(`${n} boot failed`);
    if (!(await x.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`${n}: no main menu`);
    await x.click(...LAN_BTN);
    if (!(await x.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`${n}: no lobby`);
  }
  await h.click(...CREATE_ROOM_BTN);
  await typeLanAddress(C.page,'127.0.0.1');
  step('manual IP typed with focus: '+JSON.stringify(await C.page.evaluate(()=>({state:window.__game.state(),phase:window.__game.lan().bridge,viewport:{width:innerWidth,height:innerHeight}}))));
  await c.click(...JOIN_BTN);
  await c.click(...READY_BTN);
  if (!(await h.waitFor(() => window.__game?.lan?.()?.ready === true, null, 20000))) throw new Error('no READY');
  await H.page.waitForTimeout(3000); // let the heartbeat measure before START pins D
  await h.click(...START_ROOM_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitScreen('State_LanSetup', 'Screen_LanSetup', 20000))) throw new Error(`${n}: no setup screen`);
  }
  // Room 11 PATCHY = levelIdx 10: cycle the host's map arrow until the selection reads 10 (the save may
  // already sit on any map - the loop is idempotent; every change mirrors to the client).
  for (let i = 0; i < 20; i++) {
    const cur = await H.page.evaluate(() => window.__game.lan().sel.levelIdx);
    if (cur === 10) break;
    await H.page.evaluate(() => {
      const sel = window.__game.main().mcScreen.mcSubScreen.mcLevel_Selection;
      sel.bRight.onRelease.call(sel.bRight);
    });
    await H.page.waitForTimeout(150);
  }
  const sel = await H.page.evaluate(() => window.__game.lan().sel);
  if (sel.levelIdx !== 10) throw new Error(`map selection landed on ${sel.levelIdx}, wanted 10 (PATCHY)`);
  step(`map selected: idx ${sel.levelIdx} (PATCHY), mode ${sel.mode}`);
  await h.click(...START_GAME_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) {
      throw new Error(`${n}: game did not start`);
    }
  }
  // Players must survive the whole script: the original's own cheat switch (nothing dies mid-walk - a
  // death freezes the camera at the death spot and pollutes the camera measurement).
  for (const P of [H, C]) await P.page.evaluate(() => window.__game.__setInfiniteLife(true));
  await H.page.waitForTimeout(900); // settle (screen-transition rule)

  // (A) spawn validity - geometric ground truth (the vision gate double-checks the render).
  const spawn = async (page) => page.evaluate(() => {
    const w = window.__game.main().mcWorld;
    const ps = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
    return ps.map((p) => {
      const cx = Math.floor(p.mPosition.mX), cy = Math.floor(p.mPosition.mY);
      return { x: cx, y: cy, collide: w.mMap.mCells[cy][cx].mCollide };
    });
  });
  for (const [n, page] of [['host', H.page], ['client', C.page]]) {
    const sp = await spawn(page);
    for (const s of sp) {
      if (s.collide & 1) throw new Error(`${n}: player spawned INSIDE a Solid cell (${s.x},${s.y} collide ${s.collide})`);
    }
    step(`${n} spawns clean: ${JSON.stringify(sp)}`);
  }
  await shot('01_host_spawn_room11', H.page);
  await shot('02_client_spawn_room11', C.page);

  // (B) independent cameras: hold apart for 6 s, then each screenshot's own player must be near center.
  await H.page.keyboard.down('ArrowRight');
  await C.page.keyboard.down('KeyA');
  await H.page.waitForTimeout(6000);
  await H.page.keyboard.up('ArrowRight');
  await C.page.keyboard.up('KeyA');
  const cam = async (page) => page.evaluate(() => {
    const w = window.__game.main().mcWorld;
    const me = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex)[window.__game.lan().isHost ? 0 : 1];
    const peer = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex)[window.__game.lan().isHost ? 1 : 0];
    const view = { w: w.mScreenSize.x / 32, h: w.mScreenSize.y / 32 };
    const meOff = { x: me.mPosition.mX - w.mDrawPosition.x / 32 - view.w / 2, y: me.mPosition.mY - w.mDrawPosition.y / 32 - view.h / 2 };
    return { meOff, dist: Math.abs(me.mPosition.mX - peer.mPosition.mX) };
  });
  const camH = await cam(H.page);
  const camC = await cam(C.page);
  const probeTrack = async (page, label) => page.evaluate((label) => {
    const w = window.__game.main().mcWorld;
    const ps = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
    const before = w.mTrackPosition ? { x: w.mTrackPosition.mX, y: w.mTrackPosition.mY } : null;
    const src0 = String(w.TrackThing).slice(0, 160);
    w.TrackThing(ps[1]);
    const afterManual = w.mTrackPosition ? { x: w.mTrackPosition.mX, y: w.mTrackPosition.mY } : null;
    return { label, before, src0, afterManual, p1: { x: ps[1].mPosition.mX, y: ps[1].mPosition.mY } };
  }, label);
  step(`track probe host: ${JSON.stringify(await probeTrack(H.page, 'host'))}`);
  step(`track probe client: ${JSON.stringify(await probeTrack(C.page, 'client'))}`);
  const anchor = async (page) => page.evaluate(() => {
    const w = window.__game.main().mcWorld;
    const ps = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
    return {
      track: w.mTrackPosition ? { x: +w.mTrackPosition.mX.toFixed(2), y: +w.mTrackPosition.mY.toFixed(2) } : null,
      ltrack: w.lTrackPosition ? { x: +w.lTrackPosition.mX.toFixed(2), y: +w.lTrackPosition.mY.toFixed(2) } : null,
      draw: { x: +(w.mDrawPosition.x / 32).toFixed(2), y: +(w.mDrawPosition.y / 32).toFixed(2) },
      screen: { x: +(w.mScreenSize.x / 32).toFixed(1), y: +(w.mScreenSize.y / 32).toFixed(1) },
      area: { x: +w.mArea.width.toFixed(1), y: +w.mArea.height.toFixed(1) },
      p0: { x: +ps[0].mPosition.mX.toFixed(2), flags: ps[0].mFlags },
      p1: { x: +ps[1].mPosition.mX.toFixed(2), flags: ps[1].mFlags },
    };
  });
  step(`host anchor: ${JSON.stringify(await anchor(H.page))}`);
  step(`client anchor: ${JSON.stringify(await anchor(C.page))}`);
  step(`host cam: local player offset from view center ${JSON.stringify(camH.meOff)} (cells); players ${camH.dist.toFixed(1)} cells apart`);
  step(`client cam: local player offset from view center ${JSON.stringify(camC.meOff)} (cells)`);
  // The shared-screen anchor would sit at the MIDPOINT: a 40+ cell separation drags each player ~20 cells
  // off-center; the independent camera keeps each within a few cells.
  if (camH.dist < 15) throw new Error(`players only ${camH.dist.toFixed(1)} cells apart - walk not far enough to discriminate`);
  // Modern presentation temporarily supplies its camera and restores simulation fields after drawing.
  // Check the actual drawn camera against the LOCAL player's expected map-clamped viewport instead of
  // reading that transient anchor between frames. Keep the original one-cell tolerance and legacy check.
  const anchors = async (page) => page.evaluate(() => {
    const w = window.__game.main().mcWorld;
    const ps = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
    const me = ps[window.__game.lan().isHost ? 0 : 1];
    if(window.__game.lan().netcode==='rollback-v2'){
      const position=me.mPosition.ConvertCellToScreen(),size=w.mScreenSize,draw=w.mDrawPosition;
      const x=Math.max(32,Math.min(w.mArea.width-size.x-32,Math.round(position.x-size.x/2)));
      const y=Math.max(32,Math.min(w.mArea.height-size.y-32,Math.round(position.y-size.y/2)));
      return draw&&Number.isFinite(draw.x)&&Number.isFinite(draw.y)
        ?{dOwn:Math.hypot(draw.x-x,draw.y-y)/32,kind:'drawn-camera',expected:{x,y},actual:{x:draw.x,y:draw.y}}:null;
    }
    const l = w.lTrackPosition;
    return l ? { dOwn: Math.hypot(l.mX - me.mPosition.mX, l.mY - me.mPosition.mY) } : null;
  });
  for (const [n, page] of [['host', H.page], ['client', C.page]]) {
    const a = await anchors(page);
    if (!a) throw new Error(`${n}: no tracking anchor (camera never tracked)`);
    if (a.dOwn > 1) throw new Error(`${n}: anchor ${a.dOwn.toFixed(2)} cells off the LOCAL player - shared-screen anchor still active`);
    step(`${n}: camera anchor locked on the LOCAL player (${a.dOwn.toFixed(3)} cells)`);
  }
  await shot('03_host_independent_cam', H.page);
  await shot('04_client_independent_cam', C.page);

  // (C) synchronized pause: the HOST presses P; both overlays must be up on the same tick.
  await H.page.evaluate(() => { const w = window.__game.main().mcWorld; w.mHud.Pause(false); }); // ensure unpaused
  await H.page.keyboard.press('KeyP');
  await H.page.waitForTimeout(700); // screen-transition settle rule
  const pauseState = async (page) => page.evaluate(() => {
    const w = window.__game.main().mcWorld;
    return { paused: !!w.mHud.mcScreenPause, net: window.__game.lan().session };
  });
  const pH = await pauseState(H.page);
  const pC = await pauseState(C.page);
  step(`pause: host=${JSON.stringify(pH)} client=${JSON.stringify(pC)}`);
  if (!pH.paused || !pC.paused) throw new Error(`pause overlay not on both peers: ${JSON.stringify({ pH, pC })}`);
  await shot('05_host_paused', H.page);
  await shot('06_client_paused', C.page);
  // Resume from the CLIENT (either side may resume).
  await C.page.keyboard.press('KeyP');
  await H.page.waitForTimeout(500);
  const rH = await pauseState(H.page);
  const rC = await pauseState(C.page);
  if (rH.paused || rC.paused) throw new Error(`client resume left an overlay up: ${JSON.stringify({ rH, rC })}`);
  step('client resume: both overlays down, sim continues');

  // (D) forced desync -> immediate lobby + banner on both peers.
  await H.page.evaluate(() => { window.__game.__forceDesync(); });
  await H.page.waitForTimeout(2800); // 600 ms grace + screen-transition settle (the shot must catch the LOBBY, not the cross-fade)
  const desyncState = async (page) => page.evaluate(() => {
    const l = window.__game.lan();
    return { state: window.__game.state(), bridge: l.bridge, msg: l.msg };
  });
  const dH = await desyncState(H.page);
  const dC = await desyncState(C.page);
  step(`desync: host=${JSON.stringify(dH)} client=${JSON.stringify(dC)}`);
  for (const [n, d] of [['host', dH], ['client', dC]]) {
    if (d.state !== 'State_LanLobby') throw new Error(`${n} did not return to the lobby (state ${d.state})`);
    if (!String(d.msg).includes('DESYNCED')) throw new Error(`${n} lobby banner missing: "${d.msg}"`);
  }
  // v0.2.5 (desync teardown): the lobby must actually REPLACE the run visually - the world clip torn down (it used to
  // keep drawing over the lobby panel forever, hiding it) and the "RUN OVER" end pill hidden by its own 2.5 s timer.
  await H.page.waitForTimeout(1200); // past the end pill's hideSoon(2500) from the abandon moment
  for (const [n, pg] of [['host', H.page], ['client', C.page]]) {
    const vis = await pg.evaluate(() => ({
      world: !!window.__game.main().mcWorld,
      worldVisible: window.__game.main().mcWorld?._visible ?? false,
      pillShown: [...document.querySelectorAll('div,p,span')].some((e) => {
        const t = e.textContent ?? '';
        return /RUN OVER|GAME OVER/.test(t) && t.length < 40 && e.style.display !== 'none' && e.offsetParent !== null;
      }),
    }));
    if (vis.world) throw new Error(`${n}: world clip still attached after desync lobby return`);
    if (vis.pillShown) throw new Error(`${n}: RUN OVER pill still shown after the desync lobby return`);
    step(`desync teardown ${n}: ${JSON.stringify(vis)}`);
  }
  await shot('07_host_desync_lobby', H.page);
  await shot('08_client_desync_lobby', C.page);
  report.ok = report.errors.length === 0;
} catch (e) {
  report.errors.push(String(e?.message ?? e));
  for(const [name,instance]of [['host',H],['client',C]])if(instance){
    await shot('failure-'+name,instance.page).catch(()=>{});
    (report.failureStates??={})[name]=await instance.page.evaluate(()=>({state:window.__game.state(),bridge:window.__game.lan(),input:[...document.querySelectorAll('input')].map(e=>({display:e.style.display,visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON()})),viewport:{width:innerWidth,height:innerHeight}})).catch(String);
  }
} finally {
  try { await H?.app.close(); } catch {}
  try { await C?.app.close(); } catch {}
  report.ok = report.ok && report.errors.length === 0;
  writeFileSync(join(OUT, 'v023_report.json'), JSON.stringify(report, null, 2));
}
console.log(report.ok ? 'V0.3 TARGETED PLAYTEST PASSED' : `V0.3 TARGETED PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
