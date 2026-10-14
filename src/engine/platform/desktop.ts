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
  /** LAN multiplayer transport (v0.1.3); undefined would hide every LAN entry point. */
  readonly lan: LanApi;
}

declare global {
  interface Window { boxheadDesktop?: DesktopApi }
}

/** A host found by LAN discovery (structural mirror of protocol.ts HostInfo). */
export interface LanHostEntry {
  ip: string;
  name: string;
  app: string;
  status: 'lobby' | 'playing';
  /** 1 = waiting for player 2, 2 = room full. */
  players: 1 | 2;
  port: number;
}

/** LAN multiplayer transport surface (v0.1.3, deviation LAN_MULTIPLAYER); implemented by the Electron preload. */
export interface LanApi {
  /** Start listening for host beacons; hosts arrive through onHosts. */
  discoverStart(): Promise<{ ok: boolean; reason?: string }>;
  discoverStop(): void;
  /** Host: start the TCP server + beacons. Resolves with the chosen port on ok. */
  hostStart(): Promise<{ ok: boolean; reason?: string; port?: number }>;
  /** Host: what the beacon advertises ('lobby' = joinable, 'playing' = in game). */
  hostSetStatus(status: 'lobby' | 'playing'): void;
  hostStop(): void;
  /** Join: connect to a host (port undefined = scan the default range, for manual-IP entry). */
  connect(ip: string, port: number | undefined, hello: { name: string; sid?: string; char: number; capTick?: number }): Promise<{ ok: boolean; reason?: string }>;
  /** Send one protocol message to the peer (fire and forget). */
  send(msg: unknown): void;
  /** Drop the peer link but keep hosting. */
  closePeer(): void;
  /** Everything off (leave the LAN lobby). */
  shutdown(): void;
  /** v0.1.4: this machine's non-internal IPv4s (the room shows them for join-by-IP). */
  addresses?(): Promise<string[]>;
  onMessage(cb: (msg: any) => void): void;
  onPeer(cb: (s: { connected: boolean; reason?: string }) => void): void;
  onHosts(cb: (hosts: LanHostEntry[]) => void): void;
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
