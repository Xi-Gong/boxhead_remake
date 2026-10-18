// App entry (browser + Electron renderer). Boot sequence:
//   fetch assets (library.json + bitmaps, decoded sounds, xsi.json) -> add the remake's local symbols ->
//   register the ported AS2 classes (allClasses + registerClasses), root/sprite frame scripts, button actions and the
//   scope rules -> wait for audio (browser: "Click to start") -> create the Player -> start the 50 Hz platform loop.
// The first Player.enterFrame() (first loop tick) runs root frame 1 of the real SWF timeline (FLASH8 -> START_LOAD ->
// LOADING (>= 0.5 s) -> DATA -> LOADED (cover fade) -> frame 62: the Main clip = CMain).
import type { LibraryJson, XsiJson } from './shared/assetSchema.ts';
import { BitmapData } from './engine/flash/BitmapData.ts';
import { Library, Player, _root, setScriptErrorHandler, setTimelineSoundHandler } from './engine/swf/Player.ts';
import {
  audioDiagnostics, desktop, installAudioUnlock, isElectron, playTimelineSound, preloadSounds, resumeAudio, SaveStore,
  SoundEngine, startPlatform, tickAudioWatchdog, unlockAudioOverlay,
} from './engine/platform/index.ts';
import type { PlatformHandle } from './engine/platform/index.ts';
import './game/allClasses.ts';
import { LINKAGE_CLASSES, registerClasses } from './game/registerClasses.ts';
import { registerMainTimeline } from './game/frames/MainTimeline.ts';
import { registerSpriteScripts, setXsiSource } from './game/frames/SpriteScripts.ts';
import { registerButtonActions } from './game/frames/ButtonActions.ts';
import { applyScope } from './game/scope.ts';
import { installLocalSymbols } from './game/local/localSymbols.ts';
import { installGamepad } from './game/local/Gamepad.ts';
import { installInputBadge } from './game/local/InputBadge.ts';
import { lanBridge } from './game/local/Net/bridge.ts';
import { netSession } from './game/local/Net/NetSession.ts';
import { maxUnlockedWave, recordWaveReached } from './game/local/WaveUnlock.ts';
import { initDebriefDom } from './game/local/DebriefName.ts';
import { setViewportPresenter } from './game/local/Viewport.ts';
import * as GamePackages from './game/packages.ts';
import { _global } from './engine/flash/as2.ts';
import { CMain } from './game/packages.ts';

interface GameDebug {
  ready: boolean;
  stage: string;
  progress: number;
  errors: string[];
  missingClasses: string[];
  player?: Player;
  platform?: PlatformHandle;
  library?: Library;
  /** Automation: the CMain instance and the name of its current state. */
  main?: () => any;
  state?: () => string | undefined;
  /** Automation / debugging: the AS2 package namespaces and BitmapData. */
  pkg?: unknown;
  BitmapData?: unknown;
  /** Automation / debugging: the LAN bridge + session state (playtests). */
  lan?: () => unknown;
  /** Automation / debugging: audio health snapshot (v0.1.10 recovery observability). */
  audio?: () => unknown;
  /** Automation: suspend() the real AudioContext / kill() (close) it, to exercise the watchdog. */
  audioCtl?: { suspend: () => unknown; kill: () => unknown };
  /** Automation: force a context resume attempt / one watchdog beat (no 1 s wait). */
  resumeAudio?: typeof resumeAudio;
  tickAudioWatchdog?: typeof tickAudioWatchdog;
  /** QA hook (the netsmooth playtest): the original's own cheat switch _global.mInfinateLife. */
  __setInfiniteLife?: (on: boolean) => Promise<void>;
  __setRollbackV2?: (on: boolean) => void;
  __netDigest?: () => unknown;
  __responseTrace?: (enabled?: boolean) => unknown;
  /** QA hook (the v0.2.3 playtest): deliver a wire desync notice to the live session (visual gate). */
  __forceDesync?: () => boolean;
  /** QA hook (the v0.2.4 playtest): seed the persisted best-wave unlock (WaveUnlock); returns the current max. */
  __setWaveUnlock?: (n: number) => number;
}

declare global {
  interface Window { __game: GameDebug }
}

const dbg: GameDebug = {
  ready: false, stage: 'boot', progress: 0, errors: [], missingClasses: [],
  pkg: GamePackages,
  BitmapData,
  lan: () => {
    const b = lanBridge();
    const s: any = b.session;
    const frames = s ? {
      localKeys: [...(s as any).localFrames.keys()].join(','),
      remoteKeys: [...(s as any).remoteFrames.keys()].join(','),
    } : null;
    return {
      bridge: b.phase, msg: b.message, peers: b.hosts.length, peerName: b.peerName,
      isHost: b.isHost, ready: b.ready, sel: b.sel, bridgeRtt: b.rttMs,
      session: s?.phase, stall: s?.stallReason, rtt: s?.rttMs, mode: s?.mode, startTick: s?.startTick,
      inputDelay: s?.startOpts?.inputDelay ?? s?.inputDelay ?? null, endReason: s?.endReason ?? null,
      worldTick: s?.world?.mTick, state: (window as any).__game?.state?.(),
      checkpoint: s?.netCheckpoint?.tick ?? null, frames,
      desyncDetail: s?.desyncDetail ?? null,
      netcode: s?.startOpts?.netcode ?? 'legacy', diagnostics: s?.diagnostics ?? [],
      paused: s?.netPaused ?? false,
      appliedBits: s?.debugAppliedBits() ?? 0,
      presentation: s?.presentation?.displayedLocal,
      confirmedEvents: s ? [s.events.confirmedCount, s.events.confirmedHash] : null,
      // v0.2.3 smoothness observability: stall episodes + rollback health (netlockstep pins the semantics;
      // the netsmooth playtest asserts on these over a delayed-link window).
      stallCount: s?.stallCount ?? null,
      shadow: s?.shadow ? { valid: s.shadow.valid, x: s.shadow.x, y: s.shadow.y, corrections: s.shadow.corrections, divergencePx: s.shadow.lastDivergencePx } : null,
      rollback: s?.rollback
        ? {
            ...s.rollbackStats,
            predictionLimit: s.predictionLimit,
            confirmLag: (s.world ? s.tickIndex(s.world) : 0) - s.confirmTick,
            ringSize: s.ring.filter(Boolean).length,
            confirmTick: s.confirmTick,
          }
        : null,
    };
  },
  main: () => CMain?._this,
  audio: () => audioDiagnostics(),
  audioCtl: {
    suspend: () => SoundEngine.context?.suspend(),
    kill: () => SoundEngine.context?.close(),
  },
  __setInfiniteLife: async (on: boolean) => { _global.mInfinateLife = on; },
  __setRollbackV2: (on: boolean) => { lanBridge().useRollbackV2 = on; },
  __netDigest: () => netSession()?.debugChecksum(),
  __responseTrace: (enabled?: boolean) => {
    const trace = netSession()?.responseTrace;
    if (enabled !== undefined) trace?.setEnabled(enabled);
    return trace?.read() ?? [];
  },
  __forceDesync: () => { const s = (lanBridge() as any)?.session; if (!s) return false; s.onNetMessage({ t: 'desync', tick: 1 }); return true; },
  __setWaveUnlock: (n: number) => { recordWaveReached(n); return maxUnlockedWave(); },
  // Watchdog nudge for the packaged audio assertions; also the future Electron 'boxhead:audio-nudge' hook.
  resumeAudio, tickAudioWatchdog,
  state: () => {
    const m = CMain?._this;
    if (!m) return undefined;
    return Object.getOwnPropertyNames(Object.getPrototypeOf(m)).find((k) => k.startsWith('State_') && m[k] === m.fState);
  },
};
window.__game = dbg;
for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
  const session = netSession();
  if (!session?.responseTrace.enabled || session.phase !== 'playing') return;
  const key = event as KeyboardEvent, target = key.target as HTMLElement | null;
  if (target?.matches('input, textarea, [contenteditable="true"]')) return;
  session.responseTrace.record('input', session.tickIndex(session.currentWorld()), session.role,
    { type, code: key.code, repeat: key.repeat });
}, true);

function status(el: HTMLElement, text: string): void {
  el.textContent = text;
}

async function fetchJson<T>(url: URL): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.pathname}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function boot(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const msg = document.createElement('div');
  msg.style.cssText = 'color:#888;font:14px Arial,Helvetica,sans-serif;user-select:none';
  stage.appendChild(msg);

  const params = new URLSearchParams(location.search);
  const scaleParam = Number(params.get('scale'));
  const renderScale = scaleParam === 1 || scaleParam === 2 ? scaleParam : SaveStore.renderScale;
  BitmapData.defaultScale = renderScale;
  SaveStore.activeRenderScale = renderScale;

  const assets = new URL('./assets/', document.baseURI);

  // 1) library.json + bitmaps (lane E), then rebuild it with the remake's local symbols (scope: instructions page,
  //    highscore table) so attachMovie / registerClass see them like any other linkage.
  dbg.stage = 'library';
  const loaded = await Library.load(assets.href, (f) => { dbg.progress = f * 0.6; status(msg, `Loading ${Math.round(dbg.progress * 100)}%`); });
  const json: LibraryJson = loaded.json;
  installLocalSymbols(json);
  const library = new Library(json);
  for (const [id, bmp] of loaded.bitmaps) library.bitmaps.set(id, bmp);
  dbg.library = library;

  // 2) sounds (lane D) and the XSI character data (lane B/F1)
  dbg.stage = 'sounds';
  await preloadSounds(json, assets, (done, total) => {
    dbg.progress = 0.6 + 0.3 * (total ? done / total : 1);
    status(msg, `Loading ${Math.round(dbg.progress * 100)}%`);
  });
  dbg.stage = 'xsi';
  setXsiSource(await fetchJson<XsiJson>(new URL('xsi.json', assets)));
  dbg.progress = 1;
  status(msg, 'Loading 100%');

  // 3) game code: classes, frame scripts, button actions, scope - all before the first enterFrame
  dbg.stage = 'register';
  setScriptErrorHandler((err, where) => {
    const text = `${where}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
    if (dbg.errors.length < 200) dbg.errors.push(text);
    console.error(`[swf] script error in ${where}:`, err);
  });
  dbg.missingClasses = registerClasses((json.classes as Record<string, string> | undefined) ?? LINKAGE_CLASSES);
  if (dbg.missingClasses.length) console.warn('[game] unresolved linkage classes:', dbg.missingClasses);
  registerMainTimeline();
  registerSpriteScripts();
  registerButtonActions();
  applyScope();
  setTimelineSoundHandler(playTimelineSound);
  // Dev builds only (lane V visual tests): ?scene=<id> drives the game to a fixed screen and freezes it there
  // (src/dev/scenes.ts, ids in src/dev/sceneList.ts). Production builds drop this branch (import.meta.env.DEV = false).
  let sceneId = import.meta.env.DEV ? params.get('scene') : null;
  if (sceneId) (await import('./dev/scenes.ts')).installScene(sceneId, { seed: Number(params.get('seed') ?? 1), legacyRender: params.has('legacyRender') });
  // Dev builds only (lane X2 effect scenes): ?fxscene=<id> (src/dev/fxScenes.ts, ids in src/dev/fxSceneList.ts).
  const fxSceneId = import.meta.env.DEV && !sceneId ? params.get('fxscene') : null;
  if (fxSceneId) {
    (await import('./dev/fxScenes.ts')).installFxScene(fxSceneId, { seed: Number(params.get('seed') ?? 1) });
    sceneId = fxSceneId;
  }

  // 4) audio unlock (browser: needs a click; Electron: autoplay allowed -> resolves immediately)
  dbg.stage = 'audio';
  installAudioUnlock();
  // v0.1.10: Electron nudges the audio watchdog on window focus/restore, OS resume and second-instance refocus
  // (the watchdog would self-heal within ~5 s anyway - the nudge just removes that latency).
  desktop?.onAudioNudge?.(() => { void resumeAudio(); tickAudioWatchdog(); });
  if (!isElectron() && !sceneId) await unlockAudioOverlay(stage);
  msg.remove();

  // 5) player + platform loop (the first tick executes root frame 1)
  dbg.stage = 'running';
  const player = new Player(library, { renderScale });
  dbg.player = player;
  dbg.platform = startPlatform({ container: stage, player, getMenu: () => _root?.menu });
  lanBridge().setPresenter(dbg.platform.presenter); // LAN DOM overlays track the letterboxed canvas (v0.1.4)
  initDebriefDom(dbg.platform.presenter, stage); // debrief name-input conduit (v0.1.8 DEBRIEF_NAME_IME_INPUT)
  setViewportPresenter(dbg.platform.presenter); // DYNAMIC_VIEWPORT: world view follows window resizes
  dbg.platform.presenter.canvas.focus();
  // Local gamepad support (deviation GAMEPAD_INPUT): poll the pads every rAF before the enterFrame batch.
  const gamepad = installGamepad({
    player,
    mouse: dbg.platform.mouse,
    presenter: dbg.platform.presenter,
    container: stage,
  });
  dbg.platform.setBeforeTick(gamepad.poll);
  dbg.platform.loop.setBeforeRender(() => {
    const session = netSession(), main = dbg.main?.();
    if (!session?.rollbackV2) return false;
    session.presentation.external = true;
    const world = main?.mcWorld;
    if (session.phase !== 'playing' || session.netPaused || main?.fState !== main?.State_RunWorld || !world || !session.holdsWorld(world)) return false;
    world.Draw();
    return true;
  });
  // Input recognition badge (v0.1.4): bottom-left KEYBOARD / PAD chips with activity + assignment.
  installInputBadge(gamepad);
  dbg.ready = true;
}

boot().catch((e) => {
  dbg.stage = 'failed';
  dbg.errors.push(String(e instanceof Error ? (e.stack ?? e.message) : e));
  console.error(e);
  const stage = document.getElementById('stage');
  if (stage) stage.textContent = `Failed to start: ${e instanceof Error ? e.message : String(e)}`;
});
