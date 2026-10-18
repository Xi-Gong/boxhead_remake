// Packaged LAN smoothness playtest: two real exes over a REAL localhost TCP link
// with --boxhead-net-delay=<ms> one-way latency injected in the transport (the UDP beacons are untouched).
// BOXHEAD_NETCODE=rollback-v2 exercises zero-delay rollback and high-refresh presentation;
// otherwise this explicitly selects the retained legacy input-delay/display-shadow path.
//
// Asserted (smoothness itself is PROGRAMMATIC - a screenshot cannot show cadence; the zai vision gate uses the
// screenshots to verify the scenes render correctly):
//   1. rollback coordination and the same positive input delay agreed by both peers;
//   2. a 20 s steering/fire window: late-half stall episodes <=1 at30ms, <=3 at higher delays,
//      sampled tick drift <=10, scores equal,
//      no desync, audio healthy on both;
//   3. response <=60ms normally, <=100ms with injected mixed-explosion stress (practical release criteria);
//   4. rollback counters remain bounded (prediction/corrections normally0 at shipping depth0).
//   node tests/sim/playtest.netsmooth.mjs [delayMs=30]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { startMetrics } from '../e2e/perf-metrics.mjs';
import { explosionBurst } from './explosionFixture.ts';

const DELAY_MS = Number(process.argv[2] ?? 30);
const MODERN = process.env.BOXHEAD_NETCODE === 'rollback-v2';
const COMBAT = process.env.BOXHEAD_NET_COMBAT === '1';
const RECOVERY = process.env.BOXHEAD_NET_RECOVERY === '1';
const EXPLOSIONS = Number(process.env.BOXHEAD_NET_EXPLOSIONS ?? 0);
// User-approved practical acceptance: keep the ordinary one-tick-plus-frame target, allow a bounded
// peak during 256 simultaneous explosive roots. Correctness and sustained-stall gates are unchanged.
const RESPONSE_LIMIT_MS = EXPLOSIONS ? 100 : 60;
if (!Number.isFinite(DELAY_MS) || DELAY_MS <= 0) throw new Error('usage: node playtest.netsmooth.mjs [delayMs>0]');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'generated/reports/qa');
mkdirSync(OUT, { recursive: true });
for (const d of ['netsmooth-host', 'netsmooth-client']) {
  try { rmSync(join(OUT, d), { recursive: true, force: true }); } catch { /* best effort */ }
}

const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];
const OFFSCREEN = ['-32000', '0'];

const report = { ok: false, delayMs: DELAY_MS, netcode: MODERN ? 'rollback-v2' : 'legacy', combat: COMBAT, recovery: RECOVERY, explosions: EXPLOSIONS, responseLimitMs: RESPONSE_LIMIT_MS, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const shot = async (name, page) => { const p = join(OUT, `net_smooth_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step(`shot ${p}`); };

async function launchApp(dirName) {
  const app = await electron.launch({
    executablePath: process.env.BOXHEAD_QA_EXE ?? join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
    cwd: ROOT,
    timeout: 60000,
    args: [...NO_THROTTLE, '--boxhead-multi', `--boxhead-net-delay=${DELAY_MS}`, `--window-position=${OFFSCREEN[0]},${OFFSCREEN[1]}`],
    env: { ...process.env, BOXHEAD_USER_DATA: join(OUT, dirName) },
  });
  const page = await app.firstWindow();
  await page.addInitScript(() => { Math.random = () => 0.424242; });
  await page.reload();
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
  const click = async (x, y) => {
    // DYNAMIC_VIEWPORT: map through the presenter (centred content; plain /640,/480 skews on non-4:3 windows).
    const r = await page.evaluate(() => {
      const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
      const p = window.__game?.platform?.presenter;
      return { x: b.left, y: b.top, w: b.width, h: b.height, ox: p ? (p.stageW - 640) / 2 : 0, oy: p ? (p.stageH - 480) / 2 : 0, sw: p?.stageW ?? 640, sh: p?.stageH ?? 480 };
    });
    const px = r.x + ((x + r.ox) / r.sw) * r.w;
    const py = r.y + ((y + r.oy) / r.sh) * r.h;
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
    return { tick: w.mTick, score: w.mHud.nTotalScore, px: players[0]?.mPosition.mX, py: players[0]?.mPosition.mY, cx: players[1]?.mPosition.mX, cy: players[1]?.mPosition.mY };
  });
  const lan = () => page.evaluate(() => window.__game?.lan?.());
  return { waitFor, waitScreen, click, worldInfo, lan };
}

const legacy = process.env.BOXHEAD_QA_LEGACY_UI === '1';
const LAN_BTN = [320, legacy ? 392.4 : 346];
const CREATE_ROOM_BTN = [320 - 117, 240 - 6]; // v0.2.2 panel layout
const JOIN_BTN = legacy ? [303, 330] : [520, 350];
const READY_BTN = [210, legacy ? 340 : 330];
const START_ROOM_BTN = READY_BTN;
const START_GAME_BTN = [320, legacy ? 452 : 444];

let H, C;
try {
  step(`launching host + client with --boxhead-net-delay=${DELAY_MS} (one-way)`);
  H = await launchApp('netsmooth-host');
  const h = helpers(H.page);
  C = await launchApp('netsmooth-client');
  const c = helpers(C.page);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game?.ready, null, 120000))) throw new Error(`${n} boot failed`);
    if (!(await x.waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`${n}: no main menu`);
    await x.click(...LAN_BTN);
    if (!(await x.waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`${n}: no lobby`);
  }
  await h.click(...CREATE_ROOM_BTN);
  if (!(await h.waitFor(() => window.__game?.lan?.()?.bridge === 'hosting', null, 20000))) throw new Error('host: CREATE ROOM did not host');
  await C.page.locator('input[type=text]').click();await C.page.keyboard.type('127.0.0.1');
  await c.click(...JOIN_BTN);
  if (!(await h.waitFor(() => !!window.__game?.lan?.()?.peerName, null, 20000))) throw new Error('host never saw the client join');
  // With delayed handshakes the host can observe JOIN before the client's room controls are visible.
  if (!(await c.waitFor(() => window.__game?.lan?.()?.bridge==='lobby'&&window.__game.main().mcScreen?.readyBtn?._visible===true, null, 20000))) throw new Error('client READY control never became visible');
  await c.click(...READY_BTN);
  if (!(await c.waitFor(() => window.__game?.lan?.()?.ready===true, null, 1500))) {
    step('offscreen READY click did not toggle; retrying once');
    await c.click(...READY_BTN);
    if (!(await c.waitFor(() => window.__game?.lan?.()?.ready===true, null, 1500))) throw new Error('client READY click did not toggle');
  }
  if (!(await h.waitFor(() => window.__game?.lan?.()?.ready === true, null, 20000))) throw new Error('host never saw READY');
  // Let the heartbeat measure the delayed link for a few seconds before START (computeInputDelay samples it).
  await H.page.waitForTimeout(4000);
  await h.click(...START_ROOM_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitScreen('State_LanSetup', 'Screen_LanSetup', 20000))) throw new Error(`${n}: no setup screen`);
  }
  for (const P of [H,C]) await P.page.evaluate(async modern => {
    window.__game.__setRollbackV2?.(modern);
    await window.__game.__setInfiniteLife(true);
  }, MODERN);
  await h.click(...START_GAME_BTN);
  for (const [n, x] of [['host', h], ['client', c]]) {
    if (!(await x.waitFor(() => window.__game.state() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) {
      throw new Error(`${n}: game did not start (${await x.worldInfo()})`);
    }
  }
  // Smoothness isolation: the original's own cheat switch - players take no damage, so the window measures
  // cadence, not survival.
  for (const P of [H, C]) await P.page.evaluate(() => window.__game.__setInfiniteLife(true));
  // (1) Both peers agree on rollback coordination and an adaptive positive input delay.
  const lanH0 = await h.lan();
  report.environment = await H.page.evaluate(() => ({userAgent:navigator.userAgent,dpr:devicePixelRatio,width:innerWidth,height:innerHeight,
    canvas:[window.__game.platform.presenter.canvas.width,window.__game.platform.presenter.canvas.height],selection:window.__game.lan().sel}));
  const lanC0 = await c.lan();
  if ((MODERN ? lanH0.inputDelay !== 0 : lanH0.inputDelay < 1) || lanH0.inputDelay !== lanC0.inputDelay) throw new Error(`rollback inputDelay not agreed: ${lanH0.inputDelay}/${lanC0.inputDelay}`);
  if (MODERN && [lanH0,lanC0].some(s=>s.netcode!=='rollback-v2')) throw new Error('modern mode was not negotiated');
  if (!lanH0.rollback || !lanC0.rollback) throw new Error(`rollback not enabled: host=${JSON.stringify(lanH0.rollback)} client=${JSON.stringify(lanC0.rollback)}`);
  const dH = lanH0.inputDelay;
  if(EXPLOSIONS){
    if(!MODERN||!Number.isInteger(EXPLOSIONS)||EXPLOSIONS<1||EXPLOSIONS>256)throw new Error('invalid explosion stress configuration');
    for(const P of [H,C])await P.page.evaluate(({source,count})=>{
      const w=window.__game.main().mcWorld,start=window.__game.lan().startTick,pkg=window.__game.pkg;
      const burst=new Function('Thing','World','return ('+source+')')(pkg.Thing,pkg.World),original=w.Process;
      window.__explosionStress={bursts:0,peak:0};
      w.Process=function(){
        const t=this.mTick-start;
        if(t>=200&&(t-200)%100===0){burst(this,count);window.__explosionStress.bursts++;}
        const result=original.call(this);
        window.__explosionStress.peak=Math.max(window.__explosionStress.peak,this.mThing_Collection.mThingCounters.CThing_Effect_Explosion??0);
        return result;
      };
    },{source:explosionBurst.toString(),count:EXPLOSIONS});
  }
  step(`rollback lockstep running at D=${dH} (injected ${DELAY_MS} ms one-way)`);
  await shot('01_host_ingame', H.page);
  await shot('02_client_ingame', C.page);

  // (2) the smoothness window: constant steering on both machines; sample the observability fields.
  const WINDOW_MS = Number(process.env.BOXHEAD_NET_WINDOW_MS ?? 20000);
  if(!Number.isFinite(WINDOW_MS)||WINDOW_MS<20000||WINDOW_MS>1800000)throw new Error('invalid sample duration');
  await H.page.waitForTimeout(3000);
  // Keep the interval explicit in reports: dense allocation stack sampling can dominate burst latency.
  // The default remains 32 KiB for existing short comparisons; sparse profiling is opt-in there.
  const samplingInterval = Number(process.env.BOXHEAD_NET_ALLOCATION_INTERVAL ?? (WINDOW_MS > 60000 ? 4194304 : 32768));
  if (!Number.isInteger(samplingInterval) || samplingInterval < 32768) throw new Error('invalid allocation sampling interval');
  const metricOptions = {samplingInterval};
  const finishHost = await startMetrics(H.page,metricOptions),finishClient = await startMetrics(C.page,metricOptions);
  const cpuProfiles=[];
  if(process.env.BOXHEAD_NET_CPU_PROFILE==='1')for(const [role,P]of [['host',H],['client',C]]){
    const cdp=await P.page.context().newCDPSession(P.page);
    await cdp.send('Profiler.enable');
    const rendererStartBeforeMs=await P.page.evaluate(()=>performance.now());
    await cdp.send('Profiler.start');
    const rendererStartAfterMs=await P.page.evaluate(()=>performance.now());
    await cdp.send('Performance.enable');
    const clockMetrics=(await cdp.send('Performance.getMetrics')).metrics;
    const rendererNavigationStartMs=clockMetrics.find(m=>m.name==='NavigationStart')?.value*1000;
    cpuProfiles.push({role,cdp,rendererStartBeforeMs,rendererStartAfterMs,rendererNavigationStartMs});
  }
  const t0 = Date.now();
  let nextProgress = t0 + 60000;
  let toggle = false;
  const samples = [];
  // Hold FIRE throughout (both steer AND shoot - two unarmed players would just die inside the window,
  // which is a death test, not a smoothness test).
  await H.page.keyboard.down('Slash');
  await C.page.keyboard.down('Space');
  try {
    while (Date.now() - t0 < WINDOW_MS) {
      toggle = !toggle;
      if(COMBAT){await H.page.keyboard.down('Slash');await C.page.keyboard.down('Space');}
      await H.page.keyboard.down(toggle ? 'ArrowRight' : 'ArrowLeft');
      await C.page.keyboard.down(toggle ? 'KeyD' : 'KeyA');
      await H.page.waitForTimeout(400);
      await H.page.keyboard.up(toggle ? 'ArrowRight' : 'ArrowLeft');
      await C.page.keyboard.up(toggle ? 'KeyD' : 'KeyA');
      if(COMBAT){await H.page.keyboard.up('Slash');await C.page.keyboard.up('Space');}
      await H.page.waitForTimeout(100);
      samples.push({ host: await h.lan(), client: await c.lan() });
      const sample=samples.at(-1);
      if(sample.host.session!=='playing'||sample.client.session!=='playing')throw new Error(`session interrupted: ${JSON.stringify(sample)}`);
      if(Date.now()>=nextProgress){step(`soak ${Math.round((Date.now()-t0)/1000)}s: ticks ${sample.host.worldTick}/${sample.client.worldTick}, stalls ${sample.host.stallCount}/${sample.client.stallCount}`);nextProgress+=60000;}
    }
  } finally {
    await H.page.keyboard.up('Slash');
    await C.page.keyboard.up('Space');
  }
  const last = samples[samples.length - 1];
  await Promise.all([finishHost.freeze(),finishClient.freeze()]);
  report.performance = { host:await finishHost(),client:await finishClient() };
  if(Math.max(...Object.values(report.performance).map(p=>p.sampleEndedAt))>Math.min(...Object.values(report.performance).map(p=>p.collectionStartedAt)))throw new Error('forced GC overlapped a measured peer window');
  if(EXPLOSIONS){
    report.explosionStress=await Promise.all([H,C].map(P=>P.page.evaluate(()=>window.__explosionStress)));
    if(report.explosionStress.some(s=>s.peak<EXPLOSIONS||s.bursts<1))throw new Error('explosion fixture did not execute');
  }
  report.samples = samples;
  const mid = samples[Math.floor(samples.length / 2)];
  const stallsH = last.host.stallCount, stallsC = last.client.stallCount;
  const lateStallsH = stallsH - mid.host.stallCount, lateStallsC = stallsC - mid.client.stallCount;
  const rbH = last.host.rollback ?? {}, rbC = last.client.rollback ?? {};
  const corrH = rbH.corrections ?? 0, corrC = rbC.corrections ?? 0;
  const predH = rbH.predictions ?? 0, predC = rbC.predictions ?? 0;
  const lagH = rbH.confirmLag ?? 0, lagC = rbC.confirmLag ?? 0;
  const wiH = await h.worldInfo(), wiC = await c.worldInfo();
  step(`window done: stalls ${stallsH}/${stallsC} (late-half ${lateStallsH}/${lateStallsC}), predictions ${predH}/${predC}, corrections ${corrH}/${corrC}, confirmLag ${lagH}/${lagC}, ticks ${wiH.tick}/${wiC.tick}, scores ${wiH.score}/${wiC.score}`);
  // The opening seconds can yield a few slots while the peers' tick phases settle; what must hold is the
  // SUSTAINED rate: bounded stalls in the second half after delay/phase settling.
  const LATE_LIMIT = DELAY_MS <= 40 ? 1 : 3; // stricter at30ms; higher-delay stress permits a small burst
  if (lateStallsH > LATE_LIMIT || lateStallsC > LATE_LIMIT) {
    throw new Error(`sustained stall rate ${lateStallsH}/${lateStallsC} in the late half (peer beyond the 8-tick prediction window?)`);
  }
  if (Math.abs(wiH.tick - wiC.tick) > 10) throw new Error(`tick drift ${wiH.tick} vs ${wiC.tick} beyond the prediction window (frames stopped crossing?)`);
  // Predicted heads may differ; modern equality is asserted at the common confirmed pause below.
  if (!MODERN && wiH.score !== wiC.score) throw new Error(`score mismatch ${wiH.score} vs ${wiC.score}`);
  if (last.host.session !== 'playing' || last.client.session !== 'playing') {
    const details = await Promise.all([H.page.evaluate(() => window.__game?.lan?.()), C.page.evaluate(() => window.__game?.lan?.())]);
    const brief = details.map((d) => ({ isHost: d?.isHost, endReason: d?.endReason ?? null, det: d?.desyncDetail ?? null }));
    throw new Error(`session state during window: ${last.host.session}/${last.client.session} desync=${JSON.stringify(brief)}`);
  }
  // (Prediction ships at depth 0 - see PREDICT_MAX_LAG_TICKS; predH/predC stay 0 by design. The counters
  // print so a future depth bump immediately shows live numbers in this report.)
  if (!MODERN && (corrH > 40 || corrC > 40)) throw new Error(`rollback corrections ${corrH}/${corrC} too frequent in 20 s (link worse than the design window?)`);
  if (MODERN) for (const rb of [rbH,rbC]) {
    if(rb.maxDepth>rb.predictionLimit || rb.replayedTicks>rb.corrections*rb.predictionLimit)throw new Error(`unbounded rollback work: ${JSON.stringify(rb)}`);
  }
  if (lagH > 10 || lagC > 10) throw new Error(`confirm lag ${lagH}/${lagC} beyond the 8-tick window (+2)`);
  for (const [n, P] of [['host', H], ['client', C]]) {
    const a = await P.page.evaluate(() => window.__game.audio?.());
    if (!a || a.state !== 'running' || a.decoded !== 31 || a.failed.length !== 0) throw new Error(`${n} audio gate failed: ${JSON.stringify(a)}`);
  }
  step('smoothness window clean: stalls bounded, lockstep intact, audio healthy on both');
  if(RECOVERY){
    if(!MODERN)throw new Error('history recovery gate requires modern mode');
    for(const P of [H,C])await P.page.evaluate(()=>{window.__recoveryWorld=window.__game.main().mcWorld;});
    await C.page.evaluate(()=>window.boxheadDesktop.lan.closePeer());
    for(const x of [h,c])if(!await x.waitFor(()=>window.__game.lan().diagnostics.some(d=>d.event==='history-recovered')&&window.__game.lan().session==='playing',null,20000))throw new Error('same-history recovery did not complete');
    report.recovered=await Promise.all([H,C].map(P=>P.page.evaluate(()=>({sameWorld:window.__recoveryWorld===window.__game.main().mcWorld,diagnostics:window.__game.lan().diagnostics}))));
    if(report.recovered.some(r=>!r.sameWorld))throw new Error('short disconnect rebuilt the world');
    step('real TCP disconnect recovered both original worlds through input history');
    await H.page.waitForTimeout(1000);
  }
  if(MODERN){
    await H.page.keyboard.press('KeyP');
    for(const x of [h,c])if(!await x.waitFor(()=>window.__game.lan().paused,null,10000))throw new Error('pause did not settle');
    const final=await Promise.all([H,C].map(p=>p.page.evaluate(()=>({digest:window.__game.__netDigest(),events:window.__game.lan().confirmedEvents}))));
    report.confirmed=final;
    if(JSON.stringify(final[0])!==JSON.stringify(final[1]))throw new Error('confirmed paused states/events differ');
    await shot('confirmed_paused',H.page);
    await C.page.keyboard.press('KeyP');
    for(const x of [h,c])if(!await x.waitFor(()=>!window.__game.lan().paused,null,10000))throw new Error('resume did not settle');
    await H.page.waitForTimeout(500);
  }

  // (3) rAF-resolution key-event probe: DISPLAY position (shadow when live, otherwise sim) must react
  // within one tick + a frame. Record simulation movement independently; D carries steady link latency.
  const probe = async (pg, key, phase) => {
    await pg.keyboard.up(key);
    await pg.waitForTimeout(500);
    return pg.evaluate(async ({key, phase}) => {
    const lan = () => window.__game.lan();
    let observedTickElapsedMs;
    if (phase !== undefined) {
      const world = window.__game.main().mcWorld;
      const initialTick = world.mTick;
      const started = performance.now();
      await new Promise((resolve, reject) => {
        const next = () => {
          if (world.mTick !== initialTick) resolve();
          else if (performance.now() - started > 3000) reject(new Error('probe phase: simulation did not advance'));
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      });
      const observed = performance.now();
      if (phase > 0) await new Promise(resolve => setTimeout(resolve, phase));
      observedTickElapsedMs = performance.now() - observed;
    }
    const meOf = () => {
      const w = window.__game.main().mcWorld;
      const me = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex)[lan().isHost ? 0 : 1];
      return me ?? null;
    };
    const dispX = () => {
      const modern = lan().presentation;
      if (lan().netcode === 'rollback-v2' && modern) return modern.x;
      const s = lan().shadow;
      if (s && s.valid) return s.x;
      const me = meOf();
      return me ? me.mPosition.mX : null;
    };
    const simX = () => {
      const me = meOf();
      return me ? me.mPosition.mX : null;
    };
    const inControl = () => {
      const me = meOf();
      return !!me && me.mLife > 0 && me.mStateID === 'State_PlayerControl';
    };
    const before = { sim: simX(), disp: dispX(), bits: lan().appliedBits };
    if(before.bits & 8)return {error:'direction already held',before};
    if (before.sim == null) return { error: 'no player', before };
    if (!inControl()) return { error: 'not in control', before };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: key, key, bubbles: true }));
    let frames = 0;
    const t0 = performance.now();
    let dispAtMs = null;
    let simAtMs = null;
    let positionAtMs = null;
    await new Promise((resolve) => {
      const tick = () => {
        frames++;
        if (dispAtMs == null && Math.abs((dispX() ?? before.disp) - before.disp) > 1e-6) dispAtMs = performance.now() - t0;
        if (simAtMs == null && (lan().appliedBits & 8)) simAtMs = performance.now() - t0;
        if (positionAtMs == null && Math.abs((simX() ?? before.sim) - before.sim) > 1e-6) positionAtMs = performance.now() - t0;
        if ((dispAtMs != null && simAtMs != null) || frames > 300 || performance.now() - t0 > 3000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    window.dispatchEvent(new KeyboardEvent('keyup', { code: key, key, bubbles: true }));
    return { before, frames, dispAtMs: dispAtMs != null ? Math.round(dispAtMs) : null, simAtMs: simAtMs != null ? Math.round(simAtMs) : null, positionAtMs,
      startAtMs:t0,endAtMs:performance.now(),tickAfter:window.__game.main().mcWorld.mTick,
      ...(phase !== undefined ? {phase,observedTickElapsedMs} : {}) };
    }, {key,phase});
  };
  const probeWithRetry = async (pg, key, phase) => {
    let p = await probe(pg, key, phase);
    if (p.error) {
      // Dead / respawn / no player: the sim position legitimately does not follow input there. Wait out the
      // respawn cycle and try once more; still out = skip, not fail.
      await pg.waitForTimeout(2500);
      p = await probe(pg, key, phase);
      if (p.error) return { skipped: true, ...p };
    }
    return p;
  };
  const probeH = await probeWithRetry(H.page, 'ArrowRight');
  const probeC = await probeWithRetry(C.page, 'KeyD');
  // A single free-phase press can land anywhere in the 40ms simulation cycle. Keep that sample,
  // then symmetrically cover the whole cycle for matched comparisons. Every sample retains the
  // original absolute response assertions; the comparison uses the worst of all five, never a mean.
  if(process.env.BOXHEAD_NET_PROBE_PHASES==='1'){
    report.inputProbeVersion=2;
    const cycles=Number(process.env.BOXHEAD_NET_PROBE_CYCLES??1);
    if(!Number.isInteger(cycles)||cycles<1||cycles>8)throw new Error('invalid probe cycles');
    report.inputProbeCycles=cycles;
    for(const [pg,key,p]of [[H.page,'ArrowRight',probeH],[C.page,'KeyD',probeC]]){
      const samples=[{...p}];
      for(let cycle=0;cycle<cycles;cycle++)for(const phase of [0,10,20,30])samples.push(await probeWithRetry(pg,key,phase));
      p.samples=samples;
      const invalid=samples.find(s=>s.error||s.skipped||s.dispAtMs==null||s.simAtMs==null);
      if(invalid)Object.assign(p,invalid,{error:invalid.error??'phase probe unavailable'});
      else {p.dispAtMs=Math.max(...samples.map(s=>s.dispAtMs));p.simAtMs=Math.max(...samples.map(s=>s.simAtMs));}
    }
  }
  report.probes = { host: probeH, client: probeC };
  for(const {role,cdp,rendererStartBeforeMs,rendererStartAfterMs,rendererNavigationStartMs}of cpuProfiles){
    writeFileSync(join(OUT,`net_smooth_cpu_${role}.json`),JSON.stringify({...((await cdp.send('Profiler.stop')).profile),rendererStartBeforeMs,rendererStartAfterMs,rendererNavigationStartMs}));
    await cdp.detach();
  }
  step(`latency probe host=${JSON.stringify(probeH)}`);
  step(`latency probe client=${JSON.stringify(probeC)}`);
  for (const [n, p] of [['host', probeH], ['client', probeC]]) {
    if (p.skipped) {
      if (MODERN) throw new Error(`${n} modern response probe must run: ${p.error}`);
      step(`${n} probe skipped (player unavailable)`);
      continue;
    }
    if (p.error) throw new Error(`${n} probe: ${p.error}`);
    if (p.dispAtMs == null && p.simAtMs == null) throw new Error(`${n} probe: nothing ever moved after the keypress`);
    // DISPLAY bar (what the player feels): one tick + a frame (~60 ms), shadow prediction live.
    if (p.dispAtMs == null) throw new Error(`${n} probe: display position never moved (shadow dead at D=${dH}?)`);
    if (p.dispAtMs > RESPONSE_LIMIT_MS) throw new Error(`${n} probe: display took ${p.dispAtMs} ms to react (> ${RESPONSE_LIMIT_MS} ms acceptance)`);
    if (MODERN && (p.simAtMs == null || p.simAtMs > RESPONSE_LIMIT_MS)) throw new Error(`${n} simulation response took ${p.simAtMs} ms`);
    step(`${n} sim followed at ${p.simAtMs ?? '>3000'} ms (D=${dH} ticks - the designed input delay)`);
  }
  step(`operation latency accepted on both peers (limit ${RESPONSE_LIMIT_MS} ms${EXPLOSIONS?' under mixed-explosion stress':''})`);
  await shot('03_host_after_window', H.page);
  await shot('04_client_after_window', C.page);

  report.ok = report.errors.length === 0;
} catch (e) {
  report.errors.push(String(e?.message ?? e));
} finally {
  writeFileSync(join(OUT, 'net_smooth_report.json'), JSON.stringify(report, null, 2));
  try { await H?.app.close(); } catch {}
  try { await C?.app.close(); } catch {}
}
console.log(report.ok ? `PACKAGED NET-SMOOTH PLAYTEST PASSED (${DELAY_MS} ms one-way)` : `PACKAGED NET-SMOOTH PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
