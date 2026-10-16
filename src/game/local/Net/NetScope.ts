// LAN scope wrappers (deviation LAN_MULTIPLAYER, v0.1.3). Installed once by scope.ts alongside every other wrapper;
// each one is a cheap no-op unless a net session is active. The chain order matters: this State_RunWorld wrapper is
// installed AFTER the v0.1.2 savequit wrapper, so it runs OUTERMOST and owns the tick.
//
//   State_RunWorld  - the lockstep gate. Net mode owns the pause key (the latch is consumed here so CWorld.Process
//                     never toggles its own mPaused, which would run an ungated tick on the unpause tick and
//                     desync): P toggles a session-local pause that skips world.Process entirely (the peer's frame
//                     stream dries up and IT freezes with "peer paused" - pause is free in lockstep). Without a
//                     frame for the next tick the simulation is skipped too (the canvas keeps the last frame; the
//                     overlay shows why). world.Draw still runs on every flagDraw call so BOTH peers execute the
//                     identical render calls (rendering must stay RNG-neutral; audited in tests/sim/netlockstep).
//   Process_Init    - swaps both players' mControls entries for NetSlots (re-applies on every world rebuild).
//   Grenade.Fire    - throw power from the virtual input clock instead of getTimer(): Fire computes
//                     (getTimer() - tTime), so we shift tTime by (getTimer() - virtualNow) - the subtraction then
//                     yields the virtual delta, identical on both peers, with zero reimplementation.
//   InitFinished    - (stacked outside the v0.1.2 consumePending wrapper) hands the built world to the session.
import { getTimer } from '../../../engine/runtime.ts';
import { CMain, Thing, World } from '../../packages.ts';
import { DESYNC_RETURN_MS, netSession } from './NetSession.ts';
import { SLOT_ORDER } from './NetSlot.ts';

export function installNetScope(): void {
  // ---- State_RunWorld: lockstep gate + net-owned pause ----------------------------------------
  const mainProto = CMain.prototype as any;
  const stateRunWorld = mainProto.State_RunWorld;
  mainProto.State_RunWorld = function (this: any, flagDraw?: any): void {
    const session = netSession();
    const w = this.mcWorld;
    if (!session || !w || !session.holdsWorld(w)) {
      stateRunWorld.call(this, flagDraw);
      return;
    }
    // Net mode owns the pause key: consume the latch so CWorld.Process's own pause path never fires.
    if (CMain.mInput?.KEY_PAUSE?.mPressed) {
      CMain.mInput.KEY_PAUSE.IsPressed(); // consume
      session.netPaused = !session.netPaused;
      w.mHud.Pause(session.netPaused);
    }
    if (session.netPaused) {
      if (flagDraw) w.Draw();
      return;
    }
    // v0.2.1: a checksum desync used to freeze both peers forever - the overlay promised a lobby return that no
    // code ever performed. After the grace window (so the players see what happened) both peers abandon to the
    // room independently; a checkpoint taken after divergence may diverge again, so the fresh-RETRY strip is the
    // safe escape (both peers hold the identical checkpoint by determinism of the captures themselves).
    if (session.phase === 'desync' && session.desyncAt !== undefined && Date.now() - session.desyncAt >= DESYNC_RETURN_MS) {
      session.abandonToLobby();
      this.SetState('State_LanLobby');
      return;
    }
    if (!session.tryBeginTick(w)) {
      if (flagDraw) w.Draw();
      return;
    }
    stateRunWorld.call(this, flagDraw);
    session.afterTick(w);
    // Natural end (coop all-dead / DM kill limit): mCompleteState was set inside this same tick on BOTH peers
    // (deterministic sim) and the original state machine just routed away from RunWorld - tell the session so the
    // bridge can leave 'playing' at the next room entry (v0.2.1 room-unstick; idempotent, forfeit paths unaffected).
    if (w.mCompleteState) session.markEnded();
  };

  // ---- Player Process_Init: swap both players' controls for NetSlots --------------------------
  const playerProto = (Thing.Creature as any).CThing_Creature_Player.prototype;
  const processInit = playerProto.Process_Init;
  playerProto.Process_Init = function (this: any): void {
    processInit.call(this);
    const session = netSession();
    if (!session) return;
    for (const name of SLOT_ORDER) {
      const slot = session.slot(this.mPlayerIndex, name);
      if (slot) this.mControls[name] = slot;
    }
  };

  // ---- Grenade: deterministic throw power ------------------------------------------------------
  const grenadeProto = (Thing.Weapon as any).CThing_Weapon_Grenade.prototype;
  const grenadeFire = grenadeProto.Fire;
  grenadeProto.Fire = function (this: any, tPosition?: any, tAngle?: any, tTime?: any): any {
    const session = netSession();
    if (!session) return grenadeFire.call(this, tPosition, tAngle, tTime);
    // Fire computes (getTimer() - tTime); shifting tTime by the clock difference makes it (virtualNow - tTime).
    return grenadeFire.call(this, tPosition, tAngle, (tTime ?? 0) - (getTimer() - session.virtualNow()));
  };

  // ---- InitFinished: hand the built world to the session (after consumePending applied a resume).
  const worldProto = (World as any).CWorld.prototype;
  const initFinished = worldProto.InitFinished;
  worldProto.InitFinished = function (this: any): void {
    initFinished.call(this);
    const session = netSession();
    if (session && session.phase === 'starting') session.onWorldReady(this);
  };
}
