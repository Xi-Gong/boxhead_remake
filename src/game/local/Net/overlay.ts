// LAN in-game DOM overlays (deviation LAN_MULTIPLAYER, v0.1.3): one status strip (waiting / peer paused /
// reconnect countdown / desync / forfeit) and a small ping readout, both outside the canvas so they never touch
// the simulation or the visual baseline tests. Driven by NetSession.onStateChange through bridge.setNetOverlaySync.
import type { NetSession } from './NetSession.ts';
import { setNetOverlaySync } from './bridge.ts';

let statusEl: HTMLDivElement | undefined;
let pingEl: HTMLDivElement | undefined;
let hideTimer: number | undefined;
/** Pending delayed WAITING-strip show (the grace window, v0.1.7). */
let stallTimer: number | undefined;
/** True while the status strip uses the prominent (reconnect countdown) style. */
let prominent = false;

/** Grace before the WAITING strip appears: shorter micro-stalls never flash (v0.1.7). */
export const STALL_GRACE_MS = 150;

/** Pure: is a stall that started at `stallSince` due to show its strip at `now`? */
export function stallStripDue(stallSince: number | undefined, now: number): boolean {
  return stallSince !== undefined && now - stallSince >= STALL_GRACE_MS;
}

const STYLE_NORMAL = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);padding:6px 18px;'
  + 'background:rgba(0,0,0,0.72);border:1px solid #9c9c9c;color:#fff;font:bold 15px Calibri,sans-serif;'
  + 'text-align:center;pointer-events:none;z-index:8;display:none;white-space:pre';
const STYLE_PROMINENT = 'position:absolute;left:50%;top:10%;transform:translateX(-50%);padding:12px 34px;'
  + 'background:rgba(64,0,0,0.85);border:2px solid #ef1304;color:#fff;font:bold 22px Calibri,sans-serif;'
  + 'text-align:center;pointer-events:none;z-index:8;display:none;white-space:pre';

function ensure(): boolean {
  if (typeof document === 'undefined') return false;
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.style.cssText = STYLE_NORMAL;
    (document.getElementById('stage') ?? document.body).appendChild(statusEl);
    pingEl = document.createElement('div');
    pingEl.style.cssText = 'position:absolute;right:10px;top:8px;padding:2px 10px;background:rgba(0,0,0,0.55);'
      + 'color:#9f9;font:12px Consolas,monospace;pointer-events:none;z-index:8;display:none';
    (document.getElementById('stage') ?? document.body).appendChild(pingEl);
  }
  return true;
}

function show(text: string, big = false): void {
  if (!ensure() || !statusEl) return;
  if (big !== prominent) {
    // Swap the stylesheet (keeps display/none semantics; both strings end with display:none, show() sets block).
    prominent = big;
    const wasVisible = statusEl.style.display === 'block';
    statusEl.style.cssText = big ? STYLE_PROMINENT : STYLE_NORMAL;
    statusEl.style.display = wasVisible ? 'block' : 'none';
  }
  statusEl.textContent = text;
  statusEl.style.display = 'block';
  if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
}

function hideSoon(ms: number): void {
  if (!ensure() || !statusEl) return;
  if (hideTimer !== undefined) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, ms) as unknown as number;
}

/** Called by the bridge on every session state change (and once per heartbeat while playing, v0.1.7). */
function sync(session: NetSession | null): void {
  if (!ensure()) return;
  if (!session) {
    cancelStallTimer();
    if (statusEl) statusEl.style.display = 'none';
    if (pingEl) pingEl.style.display = 'none';
    return;
  }
  const inGame = session.phase === 'playing' || session.phase === 'reconnecting' || session.phase === 'desync';
  if (pingEl) {
    // v0.1.7: live per heartbeat; hidden once the game is over (the lobby room view shows its own PING line).
    const rtt = inGame ? session.rttMs : undefined;
    pingEl.style.display = rtt !== undefined ? 'block' : 'none';
    if (rtt !== undefined) pingEl.textContent = `${rtt <= 0 ? '<1' : Math.round(rtt)} ms`;
  }
  if (session.phase === 'reconnecting') {
    // Prominent, and re-synced every 500 ms by the bridge's deadline timer so the seconds actually tick down.
    cancelStallTimer();
    const s = session.reconnectSecondsLeft();
    show(session.role === 1 ? `RECONNECTING TO HOST - ${s}s` : `PLAYER 2 LOST - WAITING TO RECONNECT - ${s}s`, true);
    return;
  }
  if (session.phase === 'desync') {
    cancelStallTimer();
    show('CONNECTION DESYNCED (tick ' + session.desyncTick + ')\nreturning to the LAN lobby');
    return;
  }
  if (session.phase === 'ended') {
    cancelStallTimer();
    if (session.endReason === 'timeout' || session.endReason === 'peer-timeout') {
      show('CONNECTION LOST - GAME OVER');
    } else {
      show(session.mode === 'DeathMatch' ? 'GAME OVER' : 'RUN OVER');
    }
    hideSoon(2500);
    return;
  }
  // playing: transient stalls only
  if (session.stallReason === 'peer') {
    const text = 'WAITING FOR PLAYER ' + (session.role === 0 ? '2' : '1') + '...';
    if (stallStripDue(session.stallSince, Date.now())) {
      cancelStallTimer();
      show(text);
    } else if (stallTimer === undefined) {
      // Inside the grace window: show only if the stall actually persists (micro-stalls never flash, v0.1.7).
      stallTimer = setTimeout(() => {
        stallTimer = undefined;
        if (session.stallReason === 'peer' && session.phase === 'playing') show(text);
      }, STALL_GRACE_MS) as unknown as number;
    }
    return;
  }
  cancelStallTimer();
  hideSoon(600);
}

function cancelStallTimer(): void {
  if (stallTimer !== undefined) { clearTimeout(stallTimer); stallTimer = undefined; }
}

export function installNetOverlay(): void {
  setNetOverlaySync(sync);
}
