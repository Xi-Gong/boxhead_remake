/**
 * Contract of the API the Electron preload (electron/preload.ts) exposes as `window.boxheadDesktop`.   OWNER: lane D
 * Undefined in a normal browser.
 */
export interface DesktopApi {
  readonly isElectron: true;
  /** Toggle real window fullscreen (main process). */
  toggleFullscreen(): void;
  isFullscreen(): Promise<boolean>;
  /** Quit the app (closes the window). */
  quit(): void;
  readonly versions: { electron: string; chrome: string; node: string };
}

declare global {
  interface Window { boxheadDesktop?: DesktopApi }
}

export const DESKTOP_GLOBAL = 'boxheadDesktop';

export const desktop: DesktopApi | undefined = typeof window !== 'undefined' ? window.boxheadDesktop : undefined;

export const isElectron = (): boolean => desktop?.isElectron === true;

/** F11 / Alt+Enter: Electron -> main process (real window fullscreen); browser -> Fullscreen API. */
export function toggleFullscreen(): void {
  if (desktop?.isElectron) { desktop.toggleFullscreen(); return; }
  const d = document;
  if (d.fullscreenElement) void d.exitFullscreen().catch(() => {});
  else void d.documentElement.requestFullscreen?.().catch(() => {});
}
