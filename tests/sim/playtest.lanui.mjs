// v0.1.4 LAN UI geometry playtest: one packaged exe, off-screen. The manual-IP DOM input must stay GLUED to its
// logical rectangle (x95..260, y318..342 in the authored 640x480 content space - the v0.2.2 panel layout) across
// window aspect changes - the v0.1.3 bug was a window-% positioned input that drifted as soon as the window was not
// 4:3. DYNAMIC_VIEWPORT: the content is centred on the live stage, so both the click mapping and the expected input
// rect go through the presenter's content offset. Also checks the entry/room view visibility toggle of the input.
//   node tests/sim/playtest.lanui.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { isolateLanPorts } from '../e2e/lan-isolation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'generated/reports/qa');
mkdirSync(OUT, { recursive: true });

const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];
const OFFSCREEN = ['-32000', '0'];

const report = { ok: false, steps: [], errors: [] };
const step = (s) => { report.steps.push(s); console.log(s); };

const LAN_BTN = [320, 370];
/** The input's logical rectangle (top-left x/y + w/h in the 640x480 content space; panel coords + 320/240). */
const IP_BOX = { x: 332, y: 338, w: 146, h: 24 };
/** Panel-space buttons mapped to content space (the panel is centred on 320,240). */
const CREATE_ROOM_BTN = [320 - 117, 240 - 6];
const CLOSE_ROOM_BTN = [430, 330];
const BACK_BTN = [320, 388];

let app;
try {
  step('launching instance');
  app = await electron.launch({
    executablePath: join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
    cwd: ROOT,
    timeout: 60000,
    args: [...NO_THROTTLE, '--boxhead-multi', `--window-position=${OFFSCREEN[0]},${OFFSCREEN[1]}`],
    env: { ...process.env, BOXHEAD_USER_DATA: join(OUT, 'net-ui') },
  });
  await isolateLanPorts(app, report);
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, [x, y]) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setPosition(x, y);
    w.setAlwaysOnTop(false);
  }, OFFSCREEN).catch(() => {});
  page.on('pageerror', (e) => report.errors.push(`pageerror: ${e.message}`));

  const state = () => page.evaluate(() => window.__game?.state?.());
  const waitFor = async (fn, arg = null, timeout = 30000) => {
    try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
  };
  const waitScreen = (st, id, timeout = 30000) => waitFor(([st, id]) => {
    const m = window.__game?.main?.();
    return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
  }, [st, id], timeout);

  if (!(await waitFor(() => window.__game?.ready, null, 120000))) throw new Error('boot failed');
  if (!(await waitScreen('State_Main', 'Screen_Main', 60000))) throw new Error(`no main menu (${await state()})`);
  await page.waitForTimeout(300);

  // Enter the LAN lobby (entry view: the IP input must be visible).
  // DYNAMIC_VIEWPORT: content coords (the authored 640x480 space) map through the live stage + its centring offset.
  const stageToPage = async (x, y) => {
    const r = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const b = c.getBoundingClientRect();
      const p = window.__game?.platform?.presenter;
      const off = p ? { x: (p.stageW - 640) / 2, y: (p.stageH - 480) / 2 } : { x: 0, y: 0 };
      const w = p ? p.stageW : 640, h = p ? p.stageH : 480;
      return { x: b.left, y: b.top, w: b.width, h: b.height, off, sw: w, sh: h };
    });
    return [r.x + ((x + r.off.x) / r.sw) * r.w, r.y + ((y + r.off.y) / r.sh) * r.h];
  };
  const click = async (x, y) => {
    const [px, py] = await stageToPage(x, y);
    await page.mouse.move(px, py);
    await page.waitForTimeout(60);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  await click(...LAN_BTN);
  if (!(await waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error(`no lobby (${await state()})`);

  /** Input rect vs canvas, page-absolute. */
  const measure = () => page.evaluate(() => {
    const input = document.querySelector('input[type=text]');
    const c = document.querySelector('canvas').getBoundingClientRect();
    const r = input.getBoundingClientRect();
    return { input: { l: r.left, t: r.top, w: r.width, h: r.height }, display: getComputedStyle(input).display, canvas: { l: c.left, t: c.top, w: c.width, h: c.height } };
  });

  const sizes = [
    { name: 'default', set: false },
    { name: 'wide 16:9', set: [1600, 900] },
    { name: 'ultrawide', set: [1720, 560] },
    { name: 'tall-ish', set: [700, 1000] },
  ];
  for (const s of sizes) {
    if (s.set) {
      await app.evaluate(({ BrowserWindow }, [w, h]) => { BrowserWindow.getAllWindows()[0].setContentSize(w, h); }, s.set);
      await page.waitForTimeout(500); // let the presenter recompute + the onResize handler re-place the input
    }
    const m = await measure();
    if (m.display !== 'block') throw new Error(`${s.name}: input not visible in the entry view (${m.display})`);
    // Expected page-absolute rect: content space -> stage (+ centring offset) -> client px.
    const off = await page.evaluate(() => {
      const p = window.__game?.platform?.presenter;
      return p ? { x: (p.stageW - 640) / 2, y: (p.stageH - 480) / 2, sw: p.stageW, sh: p.stageH } : { x: 0, y: 0, sw: 640, sh: 480 };
    });
    const ex = {
      l: m.canvas.l + ((IP_BOX.x + off.x) / off.sw) * m.canvas.w,
      t: m.canvas.t + ((IP_BOX.y + off.y) / off.sh) * m.canvas.h,
      w: (IP_BOX.w / off.sw) * m.canvas.w,
      h: (IP_BOX.h / off.sh) * m.canvas.h,
    };
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    for (const [k, tol] of [['l', 3], ['t', 3], ['w', 4], ['h', 4]]) {
      if (!near(m.input[k], ex[k], tol)) {
        throw new Error(`${s.name}: input ${k} drifted (got ${m.input[k].toFixed(1)}, expected ${ex[k].toFixed(1)})`);
      }
    }
    step(`${s.name}: canvas ${Math.round(m.canvas.w)}x${Math.round(m.canvas.h)}, input glued to the logical rect ✓`);
  }

  // Create a room: the input must disappear (room view) ...
  await click(...CREATE_ROOM_BTN);
  if (!(await waitFor(() => window.__game?.lan?.()?.bridge === 'hosting', null, 20000))) throw new Error('CREATE ROOM did not host');
  let m = await measure();
  for (let i = 0; i < 20 && m.display === 'block'; i++) { await page.waitForTimeout(150); m = await measure(); } // the ~700ms cross-fade settle rule
  if (m.display === 'block') throw new Error('input still visible in the room view');
  step('room view: input hidden ✓');
  await page.screenshot({ path: join(OUT, 'net_ui_room_wide.png') });

  // ... and the address line must show the machine's IPv4.
  const addr = await page.evaluate(() => window.__game.main().mcScreen.addrText?.text ?? null);
  step(`room address line: ${JSON.stringify(addr)}`);
  if (!/^YOUR ADDRESS: \d+\.\d+\.\d+\.\d+/.test(addr ?? '')) throw new Error(`no YOUR ADDRESS line (${addr})`);

  // ---- regression (user report 2026-10-14): the typed-in IP box must NOT linger over the next screen ----
  await click(...CLOSE_ROOM_BTN); // CLOSE ROOM -> entry view
  await page.waitForTimeout(600);
  await page.evaluate(() => { const i = document.querySelector('input[type=text]'); i?.focus(); });
  await page.keyboard.type('192.168.0.1', { delay: 30 });
  await page.waitForTimeout(200);
  const typed = await page.evaluate(() => document.querySelector('input[type=text]')?.value ?? null);
  if (typed !== '192.168.0.1') throw new Error(`typing failed after returning to the entry view (${typed})`);
  await click(...BACK_BTN); // BACK TO MENU
  await page.waitForTimeout(1200); // let the cross-fade finish and remove the old screen
  const linger = await page.evaluate(() => document.querySelectorAll('input[type=text]').length);
  if (linger !== 0) throw new Error(`the IP input lingered on the main menu (${linger} left)`);
  step('BACK TO MENU: the IP input is gone from the DOM ✓');
  // Re-entering must not accumulate inputs either.
  await click(...LAN_BTN);
  if (!(await waitScreen('State_LanLobby', 'Screen_LanLobby', 20000))) throw new Error('no lobby (re-entry)');
  await page.waitForTimeout(400);
  const count2 = await page.evaluate(() => document.querySelectorAll('input[type=text]').length);
  if (count2 !== 1) throw new Error(`expected exactly 1 IP input after re-entry, found ${count2}`);
  await click(...BACK_BTN); // BACK TO MENU again
  await page.waitForTimeout(1200);
  const linger2 = await page.evaluate(() => document.querySelectorAll('input[type=text]').length);
  if (linger2 !== 0) throw new Error(`inputs accumulated (${linger2} left)`);
  step('re-entry + leave: exactly one input while inside, none after ✓');

  report.ok = report.errors.length === 0;
} catch (e) {
  report.errors.push(String(e?.message ?? e));
} finally {
  try { await app?.close(); } catch {}
  report.ok = report.ok && report.errors.length === 0;
  writeFileSync(join(OUT, 'net_ui_report.json'), JSON.stringify(report, null, 2));
}
console.log(report.ok ? 'LAN UI GEOMETRY PLAYTEST PASSED' : `LAN UI GEOMETRY PLAYTEST FAILED: ${report.errors.join(' | ')}`);
process.exit(report.ok ? 0 : 1);
