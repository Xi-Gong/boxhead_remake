// LAN in-game DOM overlays (deviation LAN_MULTIPLAYER, v0.1.3): one status strip (waiting / peer paused /
// reconnect countdown / desync / forfeit) and a small ping readout, both outside the canvas so they never touch
// the simulation or the visual baseline tests. Driven by NetSession.onStateChange through bridge.setNetOverlaySync.
import type { NetSession } from './NetSession.ts';
import { setNetOverlaySync } from './bridge.ts';

let statusEl: HTMLDivElement | undefined;
let pingEl: HTMLDivElement | undefined;
let hideTimer: number | undefined;

function ensure(): boolean {
  if (typeof document === 'undefined') return false;
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);padding:6px 18px;'
      + 'background:rgba(0,0,0,0.72);border:1px solid #9c9c9c;color:#fff;font:bold 15px Calibri,sans-serif;'
      + 'text-align:center;pointer-events:none;z-index:8;display:none;white-space:pre';
    (document.getElementById('stage') ?? document.body).appendChild(statusEl);
    pingEl = document.createElement('div');
    pingEl.style.cssText = 'position:absolute;right:10px;top:8px;padding:2px 10px;background:rgba(0,0,0,0.55);'
      + 'color:#9f9;font:12px Consolas,monospace;pointer-events:none;z-index:8;display:none';
    (document.getElementById('stage') ?? document.body).appendChild(pingEl);
  }
  return true;
}

function show(text: string): void {
  if (!ensure() || !statusEl) return;
  statusEl.textContent = text;
  statusEl.style.display = 'block';
  if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
}

function hideSoon(ms: number): void {
  if (!ensure() || !statusEl) return;
  if (hideTimer !== undefined) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, ms) as unknown as number;
}

/** Called by the bridge on every session state change (and once at game start). */
function sync(session: NetSession | null): void {
  if (!ensure()) return;
  if (!session) {
    if (statusEl) statusEl.style.display = 'none';
    if (pingEl) pingEl.style.display = 'none';
    return;
  }
  if (pingEl) {
    const rtt = session.rttMs;
    pingEl.style.display = rtt !== undefined ? 'block' : 'none';
    if (rtt !== undefined) pingEl.textContent = `${rtt <= 0 ? '<1' : Math.round(rtt)} ms`;
  }
  if (session.phase === 'reconnecting') {
    const s = session.reconnectSecondsLeft();
    show(session.role === 1 ? `PLAYER 1 LOST - RECONNECTING... ${s}s` : `PLAYER 2 LOST - WAITING... ${s}s`);
    return;
  }
  if (session.phase === 'desync') {
    show('CONNECTION DESYNCED (tick ' + session.desyncTick + ')\nreturning to the LAN lobby');
    return;
  }
  if (session.phase === 'ended') {
    show(session.mode === 'DeathMatch' ? 'GAME OVER' : 'RUN OVER');
    hideSoon(2500);
    return;
  }
  // playing: transient stalls only
  if (session.stallReason === 'peer') {
    show('WAITING FOR PLAYER ' + (session.role === 0 ? '2' : '1') + '...');
    return;
  }
  hideSoon(600);
}

export function installNetOverlay(): void {
  setNetOverlaySync(sync);
}
