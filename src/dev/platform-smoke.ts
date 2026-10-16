// Platform smoke page (lane D): exercises Presenter, Loop, Keyboard, Pointer, ContextMenu, AudioEngine and Sound
// without the display-list engine. Open platform-smoke.html (vite dev server or the Electron smoke run).
//   - keys: shows Key.isDown codes; Space / 1..9 play exported sounds (panned by the mouse x) via the AS2 Sound class
//   - mouse: crosshair + logical coords; the "BUTTON" box shows a pointer cursor and counts clicks
//   - right-click: HTML context menu with CContextMenu.InGame-like items + "Render: Nx"
// `window.__smoke` exposes stats for automated checks.
import type { LibraryJson } from '../shared/assetSchema.ts';
import { frameTime } from '../engine/flash/clock.ts';
import { Key, Mouse } from '../engine/flash/input.ts';
import { Sound } from '../engine/flash/Sound.ts';
import { ContextMenu, ContextMenuItem } from '../engine/flash/stubs.ts';
import {
  desktop, installAudioUnlock, preloadSounds, SaveStore, SoundEngine, startPlatform, STAGE_H, STAGE_W,
  unlockAudioOverlay,
} from '../engine/platform/index.ts';
import type { PlatformPlayer, PreloadResult } from '../engine/platform/index.ts';

interface SmokeStats {
  ready: boolean;
  efCount: number;
  efPerSec: number;
  renders: number;
  lastKeyCode: number;
  lastAscii: number;
  keysDown: number[];
  mouse: { x: number; y: number; down: boolean; clicks: number };
  audio: { state: string; decoded: number; preload?: PreloadResult; lastPlayed?: string; error?: string };
  renderScale: number;
  canvas: { w: number; h: number; cssW: number; cssH: number; dpr: number };
  errors: string[];
}

const stats: SmokeStats = {
  ready: false, efCount: 0, efPerSec: 0, renders: 0, lastKeyCode: 0, lastAscii: 0, keysDown: [],
  mouse: { x: 0, y: 0, down: false, clicks: 0 }, audio: { state: 'none', decoded: 0 }, renderScale: SaveStore.renderScale,
  canvas: { w: 0, h: 0, cssW: 0, cssH: 0, dpr: 1 }, errors: [],
};
(window as unknown as { __smoke: SmokeStats }).__smoke = stats;
window.addEventListener('error', (e) => stats.errors.push(String(e.message)));

const BUTTON = { x: 440, y: 380, w: 160, h: 60 };
const efTimes: number[] = [];
let mouseDown = false;
let soundLinkages: string[] = [];
const soundTarget = {}; // stands in for the CSound per-sound clip

const inButton = (x: number, y: number): boolean => x >= BUTTON.x && x < BUTTON.x + BUTTON.w && y >= BUTTON.y && y < BUTTON.y + BUTTON.h;

const player: PlatformPlayer = {
  enterFrame(): void {
    stats.efCount++;
    efTimes.push(frameTime());
    while (efTimes.length > 0 && efTimes[0]! < frameTime() - 1000) efTimes.shift();
    stats.efPerSec = efTimes.length;
  },
  render(ctx: CanvasRenderingContext2D, deviceScale: number): void {
    stats.renders++;
    drawPattern(ctx, deviceScale);
  },
  mouseMove(x: number, y: number): void { stats.mouse.x = x; stats.mouse.y = y; },
  setStageSize(): void { /* smoke player: no stage to size */ },
  mouseDown(): void { mouseDown = true; stats.mouse.down = true; if (inButton(stats.mouse.x, stats.mouse.y)) stats.mouse.clicks++; },
  mouseUp(): void { mouseDown = false; stats.mouse.down = false; },
  get cursor(): string { return inButton(stats.mouse.x, stats.mouse.y) ? 'pointer' : 'default'; },
  keyInput(): boolean { return false; },
};

function drawPattern(ctx: CanvasRenderingContext2D, s: number): void {
  // Background grid (32 px = one Boxhead map cell)
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1 / s;
  ctx.beginPath();
  for (let x = 0; x <= STAGE_W; x += 32) { ctx.moveTo(x, 0); ctx.lineTo(x, STAGE_H); }
  for (let y = 0; y <= STAGE_H; y += 32) { ctx.moveTo(0, y); ctx.lineTo(STAGE_W, y); }
  ctx.stroke();
  // Stage border + corner markers (letterbox check)
  ctx.strokeStyle = '#e33';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, STAGE_W - 2, STAGE_H - 2);
  ctx.fillStyle = '#e33';
  for (const [x, y] of [[0, 0], [STAGE_W - 16, 0], [0, STAGE_H - 16], [STAGE_W - 16, STAGE_H - 16]] as const) ctx.fillRect(x, y, 16, 16);
  // Circle must stay round at any window size
  ctx.strokeStyle = '#4af';
  ctx.beginPath();
  ctx.arc(320, 240, 100, 0, Math.PI * 2);
  ctx.stroke();
  // Moving bar: one step per EF (smoothness check)
  const pos = (stats.efCount * 4) % STAGE_W;
  ctx.fillStyle = '#ff0';
  ctx.fillRect(pos, 228, 8, 24);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText('Boxhead remake - platform smoke', 16, 36);
  ctx.font = '13px Consolas, monospace';
  const c = stats.canvas;
  const lines = [
    `EF ${stats.efCount}   EF/s ${stats.efPerSec}   renders ${stats.renders}`,
    `canvas ${c.w}x${c.h} dev px, css ${c.cssW.toFixed(1)}x${c.cssH.toFixed(1)}, dpr ${c.dpr}, deviceScale ${s.toFixed(3)}`,
    `keys down: [${stats.keysDown.join(', ')}]   last code ${stats.lastKeyCode} ascii ${stats.lastAscii}`,
    `mouse ${stats.mouse.x.toFixed(1)}, ${stats.mouse.y.toFixed(1)} ${stats.mouse.down ? 'DOWN' : 'up'}   clicks ${stats.mouse.clicks}`,
    `audio ${stats.audio.state}  decoded ${stats.audio.decoded}  muted ${SoundEngine.muted}  last ${stats.audio.lastPlayed ?? '-'}`,
    `renderScale setting ${SaveStore.renderScale}x   ${desktop ? `Electron ${desktop.versions.electron}` : 'browser'}`,
    'Space / 1-9: play sound (pan = mouse x)   M: mute   right-click: menu',
  ];
  lines.forEach((l, i) => ctx.fillText(l, 16, 64 + i * 18));

  ctx.fillStyle = inButton(stats.mouse.x, stats.mouse.y) ? (mouseDown ? '#285' : '#3a6') : '#264';
  ctx.fillRect(BUTTON.x, BUTTON.y, BUTTON.w, BUTTON.h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText('BUTTON', BUTTON.x + 46, BUTTON.y + 36);

  // Crosshair at the logical mouse position
  ctx.strokeStyle = '#0f0';
  ctx.beginPath();
  ctx.moveTo(stats.mouse.x - 10, stats.mouse.y); ctx.lineTo(stats.mouse.x + 10, stats.mouse.y);
  ctx.moveTo(stats.mouse.x, stats.mouse.y - 10); ctx.lineTo(stats.mouse.x, stats.mouse.y + 10);
  ctx.stroke();
}

function playLinkage(linkage: string | undefined): void {
  if (!linkage) return;
  const s = new Sound(soundTarget);
  s.attachSound(linkage);
  s.setPan(((stats.mouse.x - 320) / 320) * 100);
  s.setVolume(100);
  s.start();
  stats.audio.lastPlayed = linkage;
}

// AS2-style key listener (like CInput / the controls window)
Key.addListener({
  onKeyDown(): void {
    stats.lastKeyCode = Key.getCode();
    stats.lastAscii = Key.getAscii();
    const code = Key.getCode();
    if (code === 32) playLinkage(soundLinkages.find((l) => l === 'Weapon.Pistol.Fire.wav') ?? soundLinkages[0]);
    else if (code >= 49 && code <= 57) playLinkage(soundLinkages[code - 49]);
    else if (code === 77) SoundEngine.muted = !SoundEngine.muted;
  },
  onKeyUp(): void { stats.lastKeyCode = Key.getCode(); stats.lastAscii = Key.getAscii(); },
});
Mouse.addListener({ onMouseDown(): void { /* CInput sets mMouseDown here */ } });

// CContextMenu.InGame equivalent
function makeMenu(): ContextMenu {
  const menu = new ContextMenu();
  menu.hideBuiltInItems();
  menu.customItems.push(new ContextMenuItem('© Sean Cooper 2007', () => {}));
  let sound = true, music = true, detail = true;
  const s = new ContextMenuItem('Sound: ON', (_o, item) => { sound = !sound; item.caption = `Sound: ${sound ? 'ON' : 'OFF'}`; SoundEngine.muted = !sound; });
  s.separatorBefore = true;
  menu.customItems.push(s);
  menu.customItems.push(new ContextMenuItem('Music: ON', (_o, item) => { music = !music; item.caption = `Music: ${music ? 'ON' : 'OFF'}`; }));
  menu.customItems.push(new ContextMenuItem('Quality: BEST', (_o, item) => { detail = !detail; item.caption = `Quality: ${detail ? 'BEST' : 'LOW'}`; }));
  return menu;
}

async function main(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const menu = makeMenu();
  const platform = startPlatform({ container: stage, player, getMenu: () => menu });
  const updateCanvasStats = (): void => {
    const cv = platform.presenter.canvas;
    const r = cv.getBoundingClientRect();
    stats.canvas = { w: cv.width, h: cv.height, cssW: r.width, cssH: r.height, dpr: window.devicePixelRatio };
  };
  updateCanvasStats();
  platform.presenter.onResize(updateCanvasStats);
  setInterval(() => { stats.keysDown = Array.from({ length: 256 }, (_, i) => i).filter((i) => Key.isDown(i)); }, 50);
  SaveStore.onChange((s) => { stats.renderScale = s.renderScale; });
  (window as unknown as { __platform: unknown }).__platform = platform;

  // Audio: real library if extracted, otherwise silent timing only.
  try {
    const assets = new URL('./assets/', document.baseURI);
    const res = await fetch(new URL('library.json', assets));
    if (!res.ok) throw new Error(`library.json: HTTP ${res.status}`);
    const lib = (await res.json()) as LibraryJson;
    soundLinkages = Object.keys(lib.exports).filter((k) => lib.chars[String(lib.exports[k])]?.t === 'sound').sort();
    stats.audio.state = 'loading';
    stats.audio.preload = await preloadSounds(lib, assets, (d) => { stats.audio.decoded = d; });
  } catch (e) {
    stats.audio.error = String(e);
  }
  installAudioUnlock();
  await unlockAudioOverlay(stage);
  stats.audio.state = SoundEngine.context?.state ?? 'unavailable';
  SoundEngine.context?.addEventListener('statechange', () => { stats.audio.state = SoundEngine.context?.state ?? '?'; });
  stats.ready = true;
}

void main().catch((e) => { stats.errors.push(String(e)); console.error(e); });
