/**
 * Electron main process.                                               OWNER: lane D (platform)
 * Bundled by tools/build-electron.ts -> dist-electron/main.cjs (package.json "main").
 *
 * - Serves the Vite build (`dist/`) through a privileged `app://game/` scheme (standard + secure origin, so
 *   fetch(), WebAudio decoding and localStorage work and persist under userData).
 * - Portable exe: userData is redirected next to the exe (`<exe dir>/Boxhead2PlayRooms-data`) so saves travel with it.
 * - 4:3 window (content 1280x960, smaller if the screen is), black background, no application menu (keys are never stolen),
 *   F11 / Alt+Enter toggle fullscreen (intercepted before the page sees them), single instance.
 * - Dev: VITE_DEV_SERVER_URL=http://localhost:5173/ loads the Vite dev server instead.
 *   Unpackaged testing only: BOXHEAD_DIST_DIR overrides the served folder, BOXHEAD_START_PAGE the start page.
 */
import { app, BrowserWindow, ipcMain, Menu, powerMonitor, protocol, screen, shell } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { aspectLockedBounds, fullscreenShortcut, initialContentSize } from './aspect.ts';
import { registerLanIpc } from './lanIpc.ts';

const APP_SCHEME = 'app';
const APP_HOST = 'game';
const TITLE = 'Boxhead: 2Play Rooms';

// ---------------------------------------------------------------------------------------------- before 'ready'

const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
if (portableDir) app.setPath('userData', path.join(portableDir, 'Boxhead2PlayRooms-data'));

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

// --boxhead-multi (v0.1.3 LAN testing): skip the single-instance lock so two builds can run on one machine
// (the packaged dual-instance playtest additionally isolates saves via different PORTABLE_EXECUTABLE_DIR values,
// which already gives each instance its own lock; this flag covers the unpackaged / shared-userData case).
const multiInstance = process.argv.includes('--boxhead-multi');
const gotLock = multiInstance || app.requestSingleInstanceLock();

// ---------------------------------------------------------------------------------------------- static server

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function distDir(): string {
  if (!app.isPackaged && process.env.BOXHEAD_DIST_DIR) return path.resolve(process.env.BOXHEAD_DIST_DIR);
  return path.join(app.getAppPath(), 'dist');
}

/** Resolve a URL pathname inside `root`; undefined if it escapes it. */
function resolveInside(root: string, pathname: string): string | undefined {
  let rel: string;
  try { rel = decodeURIComponent(pathname); } catch { return undefined; }
  if (rel.includes('\0')) return undefined;
  const full = path.resolve(root, `.${path.posix.normalize(`/${rel}`)}`);
  const r = path.relative(root, full);
  if (r.startsWith('..') || path.isAbsolute(r)) return undefined;
  return full;
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
  const root = distDir();
  let file = resolveInside(root, url.pathname);
  if (!file) return new Response('Forbidden', { status: 403 });
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    return new Response(body, { status: 200, headers: { 'content-type': type, 'cache-control': 'no-cache' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// ---------------------------------------------------------------------------------------------- window

let win: BrowserWindow | undefined;

/** v0.1.10: wake the renderer's audio watchdog (focus/restore, OS resume, second instance). Cheap if healthy. */
function nudgeAudio(): void {
  if (win && !win.isDestroyed()) win.webContents.send('boxhead:audio-nudge');
}

function startUrl(): string {
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) return dev;
  const page = (!app.isPackaged && process.env.BOXHEAD_START_PAGE) || 'index.html';
  return `${APP_SCHEME}://${APP_HOST}/${page}`;
}

function toggleFullscreen(): void {
  if (win && !win.isDestroyed()) win.setFullScreen(!win.isFullScreen());
}

/** Keep the content area 4:3 while the user resizes (maximized/fullscreen are letterboxed by the page instead). */
function lockContentAspect(w: BrowserWindow): void {
  const frame = (): [number, number] => {
    const [ww, wh] = w.getSize();
    const [cw, ch] = w.getContentSize();
    return [ww - cw, wh - ch];
  };
  const [fw, fh] = frame();
  w.setMinimumSize(640 + fw, 480 + fh);
  if (process.platform !== 'win32') {
    w.setAspectRatio(4 / 3, { width: fw, height: fh });
    return;
  }
  // Windows: setAspectRatio() would lock the outer window rect (frame included) and ignores extraSize.
  w.on('will-resize', (event, newBounds, details) => {
    const [frameW, frameH] = frame();
    const b = aspectLockedBounds(newBounds, details?.edge ?? 'bottom-right', frameW, frameH);
    if (b.width === newBounds.width && b.height === newBounds.height && b.x === newBounds.x && b.y === newBounds.y) return;
    event.preventDefault();
    w.setBounds(b);
  });
}

function createWindow(): void {
  const size = initialContentSize(screen.getPrimaryDisplay().workAreaSize); // 1280x960 unless the screen is small
  win = new BrowserWindow({
    width: size.width,
    height: size.height,
    useContentSize: true,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#000000',
    title: TITLE,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  win.setContentSize(size.width, size.height); // useContentSize can be off by 1 DIP at fractional DPI scales
  lockContentAspect(win);
  win.setMenuBarVisibility(false);

  // F11 / Alt+Enter work even while the page captures every key.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const fs = fullscreenShortcut(input);
    if (fs) {
      event.preventDefault();
      if (fs === 'toggle') toggleFullscreen();
    } else if (!app.isPackaged && input.key === 'F12') {
      event.preventDefault();
      win?.webContents.toggleDevTools();
    }
  });

  // Never navigate away / open popups inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`${APP_SCHEME}://${APP_HOST}/`) && !(process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL))) e.preventDefault();
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.once('ready-to-show', () => win?.show());
  // v0.1.10: the audio watchdog self-heals within ~5 s on its own; a nudge shaves that latency after the events
  // where Chromium may park the AudioContext (minimized/hidden window, OS suspend/resume, another instance
  // refocusing this window whose audio had wedged - the "restart didn't help" scenario).
  win.on('focus', nudgeAudio);
  win.on('show', nudgeAudio);
  win.on('restore', nudgeAudio);
  win.on('closed', () => { win = undefined; });
  void win.loadURL(startUrl());
}

// ---------------------------------------------------------------------------------------------- app lifecycle

if (!gotLock) {
  app.quit();
} else {
  if (!multiInstance) {
    app.on('second-instance', () => {
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.focus();
      nudgeAudio();
    });
  }

  ipcMain.on('boxhead:toggle-fullscreen', () => toggleFullscreen());
  ipcMain.handle('boxhead:is-fullscreen', () => win?.isFullScreen() ?? false);
  ipcMain.on('boxhead:quit', () => app.quit());
  // LAN multiplayer transport (v0.1.3): UDP discovery + TCP in the main process, exposed to the renderer sandbox.
  registerLanIpc(() => win);

  app.on('window-all-closed', () => app.quit());
  powerMonitor.on('resume', nudgeAudio); // OS slept with the context wedged: nudge on wake

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle(APP_SCHEME, serve);
    createWindow();
  });
}
