/**
 * Electron preload (sandboxed, context-isolated).                      OWNER: lane D (platform)
 * Exposes the tiny `window.boxheadDesktop` API declared in src/engine/platform/desktop.ts.
 * Bundled by tools/build-electron.ts -> dist-electron/preload.cjs.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../src/engine/platform/desktop.ts';

const api: DesktopApi = {
  isElectron: true,
  toggleFullscreen: () => ipcRenderer.send('boxhead:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('boxhead:is-fullscreen') as Promise<boolean>,
  quit: () => ipcRenderer.send('boxhead:quit'),
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
  },
};

contextBridge.exposeInMainWorld('boxheadDesktop', api);
