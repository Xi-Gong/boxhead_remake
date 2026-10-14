// IPC glue between the renderer's NetSession and the pure-node LanTransport (electron/lan.ts). OWNER: v0.1.3 LAN
// The renderer never touches node directly (sandbox: true): every LAN operation goes through these channels.
import { app, ipcMain, type BrowserWindow } from 'electron';
import { LanTransport, type LanEvent, type LanHello } from './lan.ts';

/** Both sides must run the exact same build: version + Chromium (V8 maths) identity. */
function identityString(): string {
  return `${app.getVersion()}+${process.versions.chrome ?? '?'}`;
}

export function registerLanIpc(getWin: () => BrowserWindow | undefined): void {
  const transport = new LanTransport({ identity: identityString() });
  const send = (channel: string, payload: unknown): void => {
    const win = getWin();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  transport.onEvent((e: LanEvent) => {
    if (e.kind === 'hosts') send('boxhead:lan-hosts', e.hosts ?? []);
    else if (e.kind === 'peer') send('boxhead:lan-peer', { connected: e.connected === true, reason: e.reason });
    else send('boxhead:lan-error', { message: e.message ?? 'lan error' });
  });
  transport.onMessage((msg) => send('boxhead:lan-message', msg));

  const tryRun = async (fn: () => void | Promise<unknown>): Promise<{ ok: boolean; reason?: string; port?: number }> => {
    try {
      const r = await fn();
      return { ok: true, port: typeof r === 'number' ? r : undefined };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  };

  ipcMain.handle('boxhead:lan-discover', () => tryRun(() => transport.startDiscovery()));
  ipcMain.handle('boxhead:lan-discover-stop', () => tryRun(() => transport.stopDiscovery()));
  ipcMain.handle('boxhead:lan-host', () => tryRun(() => transport.startHost()));
  ipcMain.handle('boxhead:lan-host-status', (_e, status: 'lobby' | 'playing') => tryRun(() => transport.setHostStatus(status)));
  ipcMain.handle('boxhead:lan-host-stop', () => tryRun(() => transport.stopHost()));
  ipcMain.handle('boxhead:lan-connect', (_e, ip: string, port: number | undefined, hello: LanHello) => transport.connect(ip, hello, port));
  ipcMain.on('boxhead:lan-send', (_e, msg) => transport.send(msg));
  ipcMain.handle('boxhead:lan-close-peer', () => tryRun(() => transport.closePeer()));
  ipcMain.handle('boxhead:lan-shutdown', () => tryRun(() => transport.shutdown()));
  // v0.1.4: the host's own IPv4 addresses, shown in the room view ("give this to player 2").
  ipcMain.handle('boxhead:lan-addresses', () => transport.hostAddresses());

  app.on('before-quit', () => transport.shutdown());
}
