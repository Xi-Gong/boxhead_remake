/**
 * Electron end-to-end smoke for the platform layer (lane D). Not a vitest file; run with:
 *     node tests/unit/platform/electron-smoke.run.ts [--skip-build]
 *     node tests/unit/platform/electron-smoke.run.ts --packaged-only     (after `npm run dist:dir`)
 * 1. vite-builds platform-smoke.html (+ public/assets) into generated/reports/platform/smoke-dist
 * 2. bundles electron/*.ts (tools/build-electron.ts) unless --skip-build
 * 3. launches Electron via playwright-core with BOXHEAD_DIST_DIR / BOXHEAD_START_PAGE (unpackaged-only overrides) and
 *    BOXHEAD_USER_DATA pointing into generated/ (exercises the USER_DATA_DIR override); a second launch with
 *    USERPROFILE + PORTABLE_EXECUTABLE_DIR redirected proves the <home>/.boxhead default + first-run migration
 * 4. checks EF rate, window/canvas size, keys, mouse, context menu (+ loop pause), fullscreen, persistence across a
 *    relaunch, console errors; screenshots + JSON report in generated/reports/platform/
 * 5. if dist/index.html exists (npx vite build), launches the default app://game/index.html and checks the protocol
 *    (MIME types, 404s, path traversal) with no overrides.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright-core';
import type { ElectronApplication, Page } from 'playwright-core';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = path.join(root, 'generated/reports/platform');
const smokeDist = path.join(outDir, 'smoke-dist');
const portableDir = path.join(outDir, 'portable');
const electronPath = createRequire(import.meta.url)('electron') as string;
const skipBuild = process.argv.includes('--skip-build');

type Check = { name: string; ok: boolean; detail?: unknown };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: unknown): void => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Smoke {
  ready: boolean; efCount: number; efPerSec: number; lastKeyCode: number; keysDown: number[];
  mouse: { x: number; y: number; down: boolean; clicks: number };
  audio: { state: string; decoded: number; preload?: { loaded: number; total: number; failed: number[] }; lastPlayed?: string; error?: string };
  renderScale: number; canvas: { w: number; h: number; cssW: number; cssH: number; dpr: number }; errors: string[];
}
const smoke = (p: Page): Promise<Smoke> => p.evaluate(() => (window as unknown as { __smoke: Smoke }).__smoke);

async function launch(env: Record<string, string>, exe?: string): Promise<{ app: ElectronApplication; page: Page; consoleErrors: string[] }> {
  const app = await _electron.launch({
    executablePath: exe ?? electronPath,
    args: exe ? [] : ['.'],
    cwd: root,
    env: { ...process.env, ...env } as Record<string, string>,
    timeout: 30000,
  });
  const page = await app.firstWindow();
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  return { app, page, consoleErrors };
}

async function smokeRun(): Promise<void> {
  rmSync(portableDir, { recursive: true, force: true });
  const env = { BOXHEAD_DIST_DIR: smokeDist, BOXHEAD_START_PAGE: 'platform-smoke.html', BOXHEAD_USER_DATA: portableDir };
  let { app, page, consoleErrors } = await launch(env);
  await page.waitForFunction(() => (window as unknown as { __smoke?: { ready: boolean } }).__smoke?.ready === true, undefined, { timeout: 30000 });

  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }));
  check('window content is 1280x960 (4:3)', size.w === 1280 && size.h === 960, size);
  const winInfo = await app.evaluate(({ BrowserWindow, app: a }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return { title: w.getTitle(), content: w.getContentSize(), menuBar: w.isMenuBarVisible(), userData: a.getPath('userData') };
  });
  check('window title', winInfo.title === 'Boxhead: 2Play Rooms', winInfo.title);
  check('no menu bar', winInfo.menuBar === false);
  // DYNAMIC_VIEWPORT: the 4:3 content aspect lock is gone (the page fills any window shape and the game view grows
  // with it) - a non-4:3 content size must simply stick now.
  const freeSize = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    w.setContentSize(1600, 900);
    return w.getContentSize();
  });
  check('window resizes freely to any aspect (16:9 content sticks)', freeSize[0] === 1600 && freeSize[1] === 900, freeSize);
  await page.waitForFunction(() => window.innerWidth === 1600 && window.innerHeight === 900, undefined, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  const stage1600 = await page.evaluate(() => {
    const c = document.querySelector('canvas.game-canvas') as HTMLCanvasElement | null;
    const dpr = window.devicePixelRatio || 1;
    return { cw: c?.width, ch: c?.height, expW: Math.round(1600 * dpr), expH: Math.round(900 * dpr) };
  });
  check('1600x900 window: canvas fills it (backing = CSS x dpr)', stage1600.cw === stage1600.expW && stage1600.ch === stage1600.expH, stage1600);
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 960); });
  await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 960, undefined, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  check('BOXHEAD_USER_DATA userData override (USER_DATA_DIR)', winInfo.userData === portableDir, winInfo.userData);
  const desk = await page.evaluate(() => (window as unknown as { boxheadDesktop?: { isElectron: boolean } }).boxheadDesktop?.isElectron ?? false);
  check('preload API exposed (contextIsolation + sandbox)', desk === true);
  const nodeLeak = await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require);
  check('no node integration in page', nodeLeak === 'undefined', nodeLeak);

  let s = await smoke(page);
  check('canvas fills 4:3 area in device px', s.canvas.w === Math.round(1280 * s.canvas.dpr) && s.canvas.h === Math.round(960 * s.canvas.dpr), s.canvas);
  check('audio context running without gesture (autoplayPolicy)', s.audio.state === 'running', s.audio.state);
  check('all library sounds decoded', !!s.audio.preload && s.audio.preload.loaded === s.audio.preload.total && s.audio.preload.total > 0, s.audio.preload ?? s.audio.error);

  const ef0 = s.efCount;
  const t0 = Date.now();
  await sleep(3000);
  s = await smoke(page);
  const rate = ((s.efCount - ef0) * 1000) / (Date.now() - t0);
  check('enterFrame rate ~50/s', rate > 46 && rate < 53, { rate: Number(rate.toFixed(2)), efPerSec: s.efPerSec });

  // Keyboard: Flash VK codes.
  const keyCases: [string, number][] = [['Slash', 191], ['Period', 190], ['Comma', 188], ['ArrowUp', 38], ['KeyW', 87], ['Space', 32], ['NumpadDivide', 111], ['NumpadMultiply', 106], ['Quote', 222]];
  for (const [k, vk] of keyCases) {
    await page.keyboard.down(k);
    await sleep(60);
    const d = await smoke(page);
    await page.keyboard.up(k);
    check(`key ${k} -> Key.isDown(${vk})`, d.keysDown.includes(vk) && d.lastKeyCode === vk, { keysDown: d.keysDown, last: d.lastKeyCode });
  }
  await sleep(80);
  s = await smoke(page);
  check('all keys released', s.keysDown.length === 0, s.keysDown);
  check('Space played a sound through AS2 Sound', s.audio.lastPlayed === 'Weapon.Pistol.Fire.wav', s.audio.lastPlayed);

  // Mouse: logical coordinates and button cursor.
  const rect = await page.evaluate(() => { const r = document.querySelector('canvas')!.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const toClient = (x: number, y: number): [number, number] => [rect.l + (x * rect.w) / 640, rect.t + (y * rect.h) / 480];
  await page.mouse.move(...toClient(500, 400)); // inside the smoke BUTTON
  await sleep(50);
  s = await smoke(page);
  check('mouse -> logical coords', Math.abs(s.mouse.x - 500) < 0.6 && Math.abs(s.mouse.y - 400) < 0.6, { mouse: s.mouse, rect });
  const cursor = await page.evaluate(() => getComputedStyle(document.getElementById('stage')!).cursor);
  check('cursor from player.cursor', cursor === 'pointer', cursor);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(50);
  s = await smoke(page);
  check('mouse click reaches player', s.mouse.clicks === 1, s.mouse);
  await page.mouse.move(...toClient(200, 300));
  await sleep(200);
  await page.screenshot({ path: path.join(outDir, 'electron-smoke.png') });

  // Context menu: shows items, pauses the loop, Render item toggles the stored setting.
  await page.mouse.click(...toClient(300, 200), { button: 'right' });
  await sleep(100);
  const items = await page.$$eval('.bx-ctxmenu-item', (els) => els.map((e) => e.textContent));
  check('context menu items', JSON.stringify(items) === JSON.stringify(['© Sean Cooper 2007', 'Sound: ON', 'Music: ON', 'Quality: BEST', 'Render: 2x']), items);
  const efA = (await smoke(page)).efCount;
  await sleep(500);
  const efB = (await smoke(page)).efCount;
  check('loop frozen while menu open (Flash behaviour)', efB === efA, { efA, efB });
  await page.screenshot({ path: path.join(outDir, 'electron-smoke-menu.png') });
  await page.click('.bx-ctxmenu-item:has-text("Render: 2x")');
  await sleep(300);
  s = await smoke(page);
  const menuGone = (await page.$('.bx-ctxmenu')) === null;
  check('Render item -> renderScale 1, menu closed, loop resumed', s.renderScale === 1 && menuGone && s.efCount > efB, { renderScale: s.renderScale, menuGone, ef: s.efCount });

  // Fullscreen: F11 / Alt+Enter (main-process before-input-event) and the preload IPC. CDP-injected keys
  // (page.keyboard) bypass before-input-event, so keys are sent with webContents.sendInputEvent like real input.
  const isFs = (): Promise<boolean> => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen());
  const sendKey = (keyCode: string, modifiers: string[] = []): Promise<void> => app.evaluate(({ BrowserWindow }, a) => {
    const wc = BrowserWindow.getAllWindows()[0]!.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: a.keyCode, modifiers: a.modifiers as never });
    wc.sendInputEvent({ type: 'keyUp', keyCode: a.keyCode, modifiers: a.modifiers as never });
  }, { keyCode, modifiers });
  const keysBefore = (await smoke(page)).lastKeyCode;
  await sendKey('F11');
  await sleep(1200);
  const fsAfterF11 = await isFs();
  const fsSize = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  s = await smoke(page);
  await page.screenshot({ path: path.join(outDir, 'electron-smoke-fullscreen.png') });
  await page.evaluate(() => (window as unknown as { boxheadDesktop: { toggleFullscreen(): void } }).boxheadDesktop.toggleFullscreen());
  await sleep(1200);
  const fsAfterIpc = await isFs();
  check('F11 enters fullscreen, IPC toggle leaves it', fsAfterF11 && !fsAfterIpc, { fsAfterF11, fsAfterIpc, fsSize, canvas: s.canvas });
  await sendKey('Enter', ['alt']);
  await sleep(1200);
  const fsAltEnter = await isFs();
  await sendKey('Enter', ['alt']);
  await sleep(1200);
  const fsAltEnter2 = await isFs();
  check('Alt+Enter toggles fullscreen on and off', fsAltEnter && !fsAltEnter2, { fsAltEnter, fsAltEnter2 });
  const sizeBack = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  check('window size restored after fullscreen', sizeBack.w === 1280 && sizeBack.h === 960, sizeBack);
  check('F11 never reached the game as a key event', (await smoke(page)).lastKeyCode === keysBefore, { keysBefore });

  // Persistence across restart (SharedObject + settings) in the portable data dir.
  await page.evaluate(() => {
    localStorage.setItem('SO:BXHD_2PLAY_6', JSON.stringify({ mLevelIndex_Single: 5, mSoundActive: false }));
  });
  const errs1 = [...consoleErrors, ...s.errors];
  await app.close();
  ({ app, page, consoleErrors } = await launch(env));
  await page.waitForFunction(() => (window as unknown as { __smoke?: { ready: boolean } }).__smoke?.ready === true, undefined, { timeout: 30000 });
  const persisted = await page.evaluate(() => ({ so: localStorage.getItem('SO:BXHD_2PLAY_6'), settings: localStorage.getItem('boxhead.settings') }));
  s = await smoke(page);
  check('localStorage persists across restart (portable dir)', persisted.so === '{"mLevelIndex_Single":5,"mSoundActive":false}' && s.renderScale === 1, persisted);
  check('Local Storage written under BOXHEAD_USER_DATA', existsSync(path.join(portableDir, 'Local Storage')));
  await page.evaluate(() => localStorage.clear());
  const errs = [...errs1, ...consoleErrors, ...s.errors];
  check('no console errors (smoke page)', errs.length === 0, errs);
  await app.close();

  // USER_DATA_DIR (v0.2.4): without the BOXHEAD_USER_DATA override, userData defaults to <home>/.boxhead and the
  // first run migrates the old portable data dir's Local Storage. USERPROFILE redirects os.homedir(),
  // PORTABLE_EXECUTABLE_DIR the old portable home; APPDATA points at an absent scratch so the second candidate
  // can never resolve against the real machine save.
  const migHome = path.join(outDir, 'migrate-home');
  const migPortable = path.join(outDir, 'migrate-portable');
  rmSync(migHome, { recursive: true, force: true });
  rmSync(migPortable, { recursive: true, force: true });
  const migOldLs = path.join(migPortable, 'Boxhead2PlayRooms-data', 'Local Storage');
  mkdirSync(migOldLs, { recursive: true });
  writeFileSync(path.join(migOldLs, '00.log'), 'x');
  {
    const m = await launch({ BOXHEAD_DIST_DIR: smokeDist, BOXHEAD_START_PAGE: 'platform-smoke.html', USERPROFILE: migHome, PORTABLE_EXECUTABLE_DIR: migPortable, APPDATA: path.join(outDir, 'migrate-appdata-absent') });
    const ud = await m.app.evaluate(({ app }) => app.getPath('userData'));
    check('userData defaults to <home>/.boxhead (USER_DATA_DIR)', ud === path.join(migHome, '.boxhead'), ud);
    check('portable Local Storage migrated on first run', existsSync(path.join(migHome, '.boxhead', 'Local Storage', '00.log')));
    check('no console errors (migration launch)', m.consoleErrors.length === 0, [...m.consoleErrors]);
    await m.app.close();
  }
}

async function productionRun(exe?: string): Promise<void> {
  const tag = exe ? 'packaged ' : '';
  if (!exe && !existsSync(path.join(root, 'dist/index.html'))) {
    check('production dist/ present (run `npx vite build` first)', false, 'skipped');
    return;
  }
  const { app, page, consoleErrors } = await launch({ BOXHEAD_USER_DATA: portableDir }, exe);
  await page.waitForLoadState('load');
  await sleep(1500);
  check(`${tag}no console errors (dist/index.html)`, consoleErrors.length === 0, [...consoleErrors]);
  const url = page.url();
  check(`${tag}default start URL`, url === 'app://game/index.html', url);
  const probe = await page.evaluate(async () => {
    const head = async (u: string): Promise<[number, string]> => {
      const r = await fetch(u);
      return [r.status, r.headers.get('content-type') ?? ''];
    };
    return {
      lib: await head('assets/library.json'),
      mp3: await head('assets/sounds/558.mp3'),
      missing: await head('nope.txt'),
      traversal: await head('/%2e%2e/package.json'),
      traversal2: await head('/..%2f..%2fpackage.json'),
    };
  });
  check(`${tag}app:// serves JSON with MIME`, probe.lib[0] === 200 && probe.lib[1].startsWith('application/json'), probe.lib);
  check(`${tag}app:// serves MP3 with MIME`, probe.mp3[0] === 200 && probe.mp3[1] === 'audio/mpeg', probe.mp3);
  check(`${tag}app:// 404 for missing files`, probe.missing[0] === 404, probe.missing);
  check(`${tag}app:// blocks path traversal`, probe.traversal[0] !== 200 && probe.traversal2[0] !== 200, { a: probe.traversal, b: probe.traversal2 });
  await page.screenshot({ path: path.join(outDir, exe ? 'electron-packaged-index.png' : 'electron-prod-index.png') });
  await app.close();
}

const packagedExe = path.join(root, 'release/win-unpacked/Boxhead 2Play Rooms.exe');
mkdirSync(outDir, { recursive: true });
if (process.argv.includes('--packaged-only')) {
  // After `npm run dist:dir`: probe the packaged app (asar + app:// + userData redirect) only.
  try { await productionRun(packagedExe); } finally {
    writeFileSync(path.join(outDir, 'electron-packaged.json'), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2));
  }
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
if (!skipBuild) {
  await build({
    configFile: false,
    root,
    base: './',
    publicDir: path.join(root, 'public'),
    logLevel: 'warn',
    build: {
      outDir: smokeDist,
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: { input: { smoke: path.join(root, 'platform-smoke.html') } },
    },
  });
  const r = spawnSync(process.execPath, ['tools/build-electron.ts'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('build-electron failed');
}
try {
  await smokeRun();
  await productionRun();
} finally {
  writeFileSync(path.join(outDir, 'electron-smoke.json'), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2));
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
