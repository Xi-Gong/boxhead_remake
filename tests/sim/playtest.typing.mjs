// Throwaway repro (2026-10-14): the user cannot type digits/letters into the LAN IP input (DOM) nor the
// debrief name field (SWF). This drives REAL keyboard events (page.keyboard.type) against the packaged exe -
// page.fill() in the E2E bypassed the keyboard entirely, which is why the breakage was never caught.
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NO_THROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'];

const app = await electron.launch({
  executablePath: join(ROOT, 'release/win-unpacked/Boxhead 2Play Rooms.exe'),
  cwd: ROOT,
  timeout: 60000,
  args: [...NO_THROTTLE, '--boxhead-multi'],
  env: { ...process.env, PORTABLE_EXECUTABLE_DIR: join(ROOT, 'generated/reports/qa/net-typing') },
});
const page = await app.firstWindow();
try {
  const waitFor = async (fn, arg = null, timeout = 30000) => {
    try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
  };
  if (!(await waitFor(() => window.__game?.ready, null, 120000))) throw new Error('boot failed');
  const onScreen = (st, id) => waitFor(([st, id]) => {
    const m = window.__game?.main?.();
    return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
  }, [st, id], 60000);
  if (!(await onScreen('State_Main', 'Screen_Main'))) throw new Error('no main menu');
  await page.waitForTimeout(400);

  const stageToPage = async (x, y) => {
    const r = await page.evaluate(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
    return [r.x + (x / 640) * r.w, r.y + (y / 480) * r.h];
  };
  const click = async (x, y) => {
    const [px, py] = await stageToPage(x, y);
    await page.mouse.move(px, py);
    await page.waitForTimeout(80);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(150);
  };

  await click(320, 392.4); // LAN GAME
  if (!(await onScreen('State_LanLobby', 'Screen_LanLobby'))) throw new Error('no lobby');

  // Click the DOM IP input (real mouse -> real focus), then type with REAL key events.
  const box = await page.evaluate(() => { const r = document.querySelector('input[type=text]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(200);
  await page.keyboard.type('192.168.1.5', { delay: 40 });
  await page.waitForTimeout(300);
  const val = await page.evaluate(() => document.querySelector('input[type=text]').value);
  console.log(`IP input after typing: "${val}" ${val === '192.168.1.5' ? 'OK' : '<<< BROKEN'}`);
  if (val !== '192.168.1.5') process.exitCode = 1;

  // ---- Part 2: the debrief NAME entry (SWF input TextField on the canvas) with real keys -------------
  await page.keyboard.press('Escape'); // blur the DOM input (no game key; safe)
  await click(320, 445); // BACK TO MENU
  if (!(await onScreen('State_Main', 'Screen_Main'))) throw new Error('no main menu (2)');
  await page.waitForTimeout(300);
  await click(320.15, 259.25); // CO-OP PLAY
  if (!(await waitFor(() => window.__game?.state?.() === 'State_SelectWorld_Coop', null, 20000))) throw new Error('no select world');
  await page.waitForTimeout(400);
  await click(392, 223); // the level preview -> LoadLevel
  if (!(await waitFor(() => window.__game?.state?.() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000))) throw new Error('coop did not start');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyP'); // pause
  await page.waitForTimeout(400);
  await click(320, 52); // pause QUIT (local coop 'quit' -> Debrief)
  if (!(await waitFor(() => window.__game?.state?.() === 'State_Debrief', null, 30000))) throw new Error(`no debrief (${await page.evaluate(() => window.__game?.state?.())})`);
  await page.waitForTimeout(500);
  await click(320, 190); // the mUsername field (placed at 205/179, spans right)
  await page.waitForTimeout(200);
  // Clear the placeholder from both sides of the caret (the SWF field has no select-all), then type.
  for (let i = 0; i < 15; i++) await page.keyboard.press('Backspace');
  for (let i = 0; i < 15; i++) await page.keyboard.press('Delete');
  await page.keyboard.type('ROY', { delay: 40 });
  await page.waitForTimeout(300);
  const name = await page.evaluate(() => String(window.__game.main().mcScreen.mUsername?.text ?? null));
  console.log(`debrief name after typing: "${name}" ${name === 'ROY' ? 'OK' : '<<< BROKEN'}`);
  if (name !== 'ROY') process.exitCode = 1;
  // v0.1.8 (DEBRIEF_NAME_IME_INPUT): the field is a transparent DOM conduit; IME commits arrive as input events
  // with NO keydown - keyboard.insertText reproduces that event shape exactly (the old canvas path dropped them).
  const conduit = await page.evaluate(() => {
    const a = document.activeElement;
    return a && a.tagName === 'INPUT' && a.style.color === 'transparent' ? a.value : null;
  });
  console.log(`debrief conduit focused (transparent DOM input, value "${conduit}"): ${conduit === 'ROY' ? 'OK' : '<<< BROKEN'}`);
  if (conduit !== 'ROY') process.exitCode = 1;
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('王roy');
  await page.waitForTimeout(300);
  const imeName = await page.evaluate(() => String(window.__game.main().mcScreen.mUsername?.text ?? null));
  console.log(`debrief name after IME commit (insertText): "${imeName}" ${imeName === '王roy' ? 'OK' : '<<< BROKEN'}`);
  if (imeName !== '王roy') process.exitCode = 1;
} finally {
  try { await app.close(); } catch {}
}
