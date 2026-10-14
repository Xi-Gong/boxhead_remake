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
  lan: {
    discoverStart: () => ipcRenderer.invoke('boxhead:lan-discover') as Promise<{ ok: boolean; reason?: string }>,
    discoverStop: () => void ipcRenderer.invoke('boxhead:lan-discover-stop'),
    hostStart: () => ipcRenderer.invoke('boxhead:lan-host') as Promise<{ ok: boolean; reason?: string; port?: number }>,
    hostSetStatus: (status) => void ipcRenderer.invoke('boxhead:lan-host-status', status),
    hostStop: () => void ipcRenderer.invoke('boxhead:lan-host-stop'),
    connect: (ip, port, hello) => ipcRenderer.invoke('boxhead:lan-connect', ip, port, hello) as Promise<{ ok: boolean; reason?: string }>,
    send: (msg) => ipcRenderer.send('boxhead:lan-send', msg),
    closePeer: () => void ipcRenderer.invoke('boxhead:lan-close-peer'),
    shutdown: () => void ipcRenderer.invoke('boxhead:lan-shutdown'),
    addresses: () => ipcRenderer.invoke('boxhead:lan-addresses') as Promise<string[]>,
    onMessage: (cb) => { ipcRenderer.on('boxhead:lan-message', (_e, msg) => cb(msg)); },
    onPeer: (cb) => { ipcRenderer.on('boxhead:lan-peer', (_e, s) => cb(s)); },
    onHosts: (cb) => { ipcRenderer.on('boxhead:lan-hosts', (_e, hosts) => cb(hosts)); },
  },
};

contextBridge.exposeInMainWorld('boxheadDesktop', api);
