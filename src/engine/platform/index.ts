/**
 * Platform layer entry point (browser + Electron renderer).            OWNER: lane D (platform)
 *
 * Boot sketch for src/main.ts:
 *
 *     import { preloadSounds, installAudioUnlock, unlockAudioOverlay, startPlatform, SaveStore } from './engine/platform/index.ts';
 *     const assets = new URL('./assets/', document.baseURI);
 *     const library = await Library.load(assets.href, ...);                         // lane E
 *     await preloadSounds(library.json, assets, (done, total) => ...);              // decode all sounds
 *     installAudioUnlock();
 *     await unlockAudioOverlay(document.getElementById('stage')!);                  // browser only; no-op in Electron
 *     const player = new Player(library, { renderScale: SaveStore.renderScale });
 *     const platform = startPlatform({ container: document.getElementById('stage')!, player });
 *
 * startPlatform creates the Presenter (canvas), attaches keyboard, mouse and the HTML context menu, and starts the
 * 50 Hz enterFrame Loop (paused while the context menu is open, like Flash).
 */
import type { Player } from '../swf/Player.ts';
import { attachContextMenu, type ContextMenuOverlay } from './ContextMenu.ts';
import type { ContextMenu as AS2ContextMenu } from '../flash/stubs.ts';
import { attachKeyboard, type KeyInputSink } from './Keyboard.ts';
import { Loop, type LoopPlayer } from './Loop.ts';
import { attachMouse, type MouseHandle, type PointerPlayer } from './Pointer.ts';
import { Presenter, type PresenterOptions, type RenderablePlayer } from './Presenter.ts';

export * from './AudioEngine.ts';
export { attachContextMenu, buildMenuRows, ContextMenuOverlay } from './ContextMenu.ts';
export { desktop, isElectron, toggleFullscreen } from './desktop.ts';
export type { DesktopApi } from './desktop.ts';
export { attachKeyboard, flashAscii, flashKeyCode } from './Keyboard.ts';
export { EF_MS, FrameScheduler, Loop } from './Loop.ts';
export { attachMouse } from './Pointer.ts';
export { computeFill, Presenter, STAGE_H, STAGE_W } from './Presenter.ts';
export { SaveStore } from './SaveStore.ts';
export type { RenderScale, Settings } from './SaveStore.ts';
export { GamepadWatcher, navigatorPadProvider, STICK_DEADZONE } from './Gamepad.ts';
export type { PadDirs, PadProvider, PadPoll, RawPad } from './Gamepad.ts';

/** What the platform needs from the display-list Player (lane E's Player satisfies it; checked below). */
export interface StageSizedPlayer {
  /** DYNAMIC_VIEWPORT: adopt the live stage size derived from the window (>= the authored 640x480). */
  setStageSize(stageW: number, stageH: number): void;
}

export interface PlatformPlayer extends LoopPlayer, RenderablePlayer, PointerPlayer, KeyInputSink, StageSizedPlayer {}

// Compile-time check that lane E's Player contract fits the platform.
const playerFits = (p: Player): PlatformPlayer => p;
void playerFits;

export interface StartPlatformOptions {
  container: HTMLElement;
  player: PlatformPlayer;
  presenter?: PresenterOptions;
  /** AS2 menu to show on right-click (default `_root.menu`). */
  getMenu?: () => AS2ContextMenu | undefined;
  /** Start the loop immediately (default true). */
  autoStart?: boolean;
}

export interface PlatformHandle {
  presenter: Presenter;
  loop: Loop;
  mouse: MouseHandle;
  menu: ContextMenuOverlay;
  /** Replace the loop's per-rAF pre-tick hook (gamepad polling; deviation GAMEPAD_INPUT). */
  setBeforeTick(fn: ((blocked: boolean) => void) | undefined): void;
  dispose(): void;
}

export function startPlatform(opts: StartPlatformOptions): PlatformHandle {
  const { player } = opts;
  const presenter = new Presenter(opts.container, opts.presenter);
  // DYNAMIC_VIEWPORT: the live stage follows the window; the engine re-lays the root out on every render.
  const adoptStage = (): void => { player.setStageSize(presenter.stageW, presenter.stageH); };
  presenter.onResize(adoptStage);
  adoptStage();
  let menuOpen = false;
  const isBlocked = (): boolean => menuOpen;
  const mouse = attachMouse({ player, presenter, isBlocked });
  const loop = new Loop({
    player,
    render: () => {
      presenter.render(player);
      mouse.updateCursor();
    },
  });
  const detachKeyboard = attachKeyboard({ player, isBlocked });
  const menu = attachContextMenu({
    container: presenter.container,
    getMenu: opts.getMenu,
    onOpenChange: (open) => { menuOpen = open; loop.setPaused(open); },
  });
  if (opts.autoStart !== false) loop.start();
  return {
    presenter, loop, mouse, menu,
    setBeforeTick: (fn) => loop.setBeforeTick(fn),
    dispose(): void {
      loop.stop();
      menu.dispose();
      detachKeyboard();
      mouse.detach();
      presenter.dispose();
    },
  };
}
