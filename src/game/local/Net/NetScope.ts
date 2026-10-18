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
import { frameTime, withTimerValue } from '../../../engine/flash/clock.ts';
import { CMain, CSound, Thing, World } from '../../packages.ts';
import { DESYNC_RETURN_MS, netSession } from './NetSession.ts';
import { SLOT_ORDER } from './NetSlot.ts';
import { MAX_NET_CATCHUP_TICKS, netStallRewind } from './protocol.ts';
import { applyCorrections, queueSound } from './Rollback.ts';
import { shadowDrawOverride } from './Predict.ts';

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
    // v0.2.3: the toggle goes through session.setPaused - pause/resume are WIRE state now (both peers show the
    // PAUSED! overlay on the same frozen tick; either side may resume).
    if (CMain.mInput?.KEY_PAUSE?.mPressed) {
      CMain.mInput.KEY_PAUSE.IsPressed(); // consume
      session.setPaused(!session.netPaused);
    }
    if (session.netPaused && session.phase !== 'desync') {
      if (flagDraw) w.Draw();
      return;
    }
    // v0.2.1: a checksum desync used to freeze both peers forever - the overlay promised a lobby return that no
    // code ever performed. After the grace window (so the players see what happened) both peers abandon to the
    // room independently; a checkpoint taken after divergence may diverge again, so the fresh-RETRY strip is the
    // safe escape (both peers hold the identical checkpoint by determinism of the captures themselves).
    if (session.phase === 'desync' && session.desyncAt !== undefined && performance.now() - session.desyncAt >= DESYNC_RETURN_MS) {
      session.abandonToLobby();
      this.SetState('State_LanLobby');
      return;
    }
    // v0.2.3 rollback: a late frame that differs from the prediction left a correction pending - restore the
    // ring slot before the divergence and replay to the head NOW (messages only arrive between frames, so this
    // always runs at a tick boundary; the head tick below then executes with true inputs).
    if (session.rollback && session.correctionPending !== undefined && session.phase === 'playing') {
      applyCorrections(session, w);
    }
    if (session.rollbackV2) {
      session.commitConfirmed(w);
      if (session.updatePauseBarrier()) {
        if (flagDraw && !session.presentation.external) w.Draw();
        return;
      }
      // A speculative terminal state waits for confirmation; never route away from a rewindable world.
      if (w.mCompleteState) {
        if (session.confirmedThrough >= session.tickIndex(w) - 1 || session.endReason) {
          const ownProcess = Object.getOwnPropertyDescriptor(w, 'Process');
          w.Process = () => {};
          try { stateRunWorld.call(this, flagDraw); }
          finally { if (ownProcess) Object.defineProperty(w, 'Process', ownProcess); else delete w.Process; }
          session.markEnded();
        } else if (flagDraw && !session.presentation.external) w.Draw();
        return;
      }
    }
    const mode = session.beginTick(w);
    if (mode === 'stall') {
      // v0.2.1 L1: a late peer frame must not cost a cadence slot - hand the just-consumed time slice back so
      // the schedule retries THIS tick as soon as the frame lands (debt clamped by netStallRewind). The credit
      // bucket bounds the total: a PERSISTENT phase mismatch yields slots until the peers re-lock (the pre-
      // v0.2.1 skips were the only phase correction the lockstep had). Only for playing-phase stalls:
      // reconnect/desync freezes must freeze truly. (In rollback mode this is rare: only past the window.)
      if (session.phase === 'playing') {
        const m: any = this;
        if (session.spendCatchupCredit(getTimer(), 1000 / CMain.mFPS)) {
          m.mTimeSlice = netStallRewind(m.mTimeSlice, frameTime(), 1000 / CMain.mFPS, MAX_NET_CATCHUP_TICKS);
          m.mFrameCap = 2; // bounded catch-up burst while the schedule owes ticks
        }
      }
      if (flagDraw && !session.presentation.external) w.Draw();
      return;
    }
    if (session.rollbackV2) {
      session.executeWorldStep(w, session.tickIndex(w));
      session.afterTick(w);
      if (flagDraw && !session.presentation.external) w.Draw();
      return;
    }
    if (mode === 'confirmed' || !session.rollback) {
      stateRunWorld.call(this, flagDraw);
      session.afterTick(w);
      // Natural end (coop all-dead / DM kill limit): mCompleteState was set inside this same tick on BOTH peers
      // (deterministic sim) and the original state machine just routed away from RunWorld - tell the session so the
      // bridge can leave 'playing' at the next room entry (v0.2.1 room-unstick; idempotent, forfeit paths unaffected).
      if (w.mCompleteState) session.markEnded();
      // v.2.1 L1 settle: back to the original single-tick cap once the schedule owes less than two ticks.
      const m: any = this;
      if (m.mFrameCap !== 1 && frameTime() - m.mTimeSlice < 2 * (1000 / CMain.mFPS)) m.mFrameCap = 1;
      return;
    }
    // ---- v0.2.3 predicted tick: run the sim on the repeat-last prediction, no routing, queued sounds ----
    const t = session.tickIndex(w);
    session.soundRecordingTick = t;
    try {
      w.Process();
      // A predicted game end must not route (the true timeline may continue) - latch it into the meta; a
      // confirmation replay that re-derives it leaves mCompleteState set and the next confirmed tick routes;
      // a right prediction re-applies the latch on confirm (Rollback.onRemoteFrame).
      if (w.mCompleteState) {
        const meta = session.tickMeta.get(t);
        if (meta) meta.endState = w.mCompleteState;
        w.mCompleteState = undefined;
      }
      if (flagDraw) w.Draw();
    } finally {
      session.soundRecordingTick = undefined;
    }
    session.afterTick(w);
  };

  // ---- CSound.PlaySound: queue sample starts of predicted/replayed ticks (v0.2.3 rollback) --------------
  // EVERY start funnels through the prototype method (the per-sample fPlay closures call pClass.PlaySound) -
  // wrap it BEFORE any RegisterSound captures it (installNetScope runs inside applyScope, before the first
  // CMain ctor in every entrypoint). While a predicted/replayed tick records, sounds queue; the flush and the
  // replay re-emit them through this same choke point, so the ordered audio canary stays exact.
  const csoundProto = (CSound as any).prototype;
  // Intercept before a sample can stop/re-pan its live channel, not just at Sound.start.
  for (const name of ['PlaySound_Normal', 'PlaySound_Positional', 'PlaySound_Velocity', 'PlaySound_Loop', 'PlaySound_VolumeAndLoop', 'PlaySound_FadeInAndLoop']) {
    const previous = csoundProto[name];
    csoundProto[name] = function (this: any, ...args: any[]): any {
      const s = netSession();
      if (!s?.rollbackV2 || !s.shouldQueueSound()) return previous.apply(this, args);
      const values = args.map(arg => arg?.clone ? arg.clone() : arg);
      s.events.record(s.soundRecordingTick!, s.soundOwner, `${name}:${this.mLinkID}`, () => {
        s.presentingSound = true;
        try { previous.apply(this, values); } finally { s.presentingSound = false; }
      });
    };
  }
  const weaponProto = (Thing.Weapon as any).CThing_Weapon.prototype;
  const updateWeapon = weaponProto.Update;
  weaponProto.Update = function (this: any, ...args: any[]): any {
    const s = netSession();
    if (!s?.rollbackV2) return updateWeapon.apply(this, args);
    const owner = s.soundOwner;
    s.soundOwner = this.mParent?.mPlayerIndex ?? -1;
    try { return updateWeapon.apply(this, args); } finally { s.soundOwner = owner; }
  };
  const origPlaySound = csoundProto.PlaySound;
  if (origPlaySound) {
    const wrapped = function (this: any, item: any, secOffset?: any, nLoop?: any): any {
      const s = netSession();
      if (s && s.shouldQueueSound()) {
        queueSound(s, { item, secOffset, nLoop });
        return;
      }
      return origPlaySound.call(this, item, secOffset, nLoop);
    };
    (wrapped as any).__boxheadNetSoundQueue = true; // belt-asserted by the netlockstep suite (T8)
    csoundProto.PlaySound = wrapped;
  }

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
  const drawWorld = worldProto.Draw;
  worldProto.Draw = function (this: any): void {
    const s = netSession();
    if (s?.rollbackV2 && s.holdsWorld(this)) s.presentation.draw(s, this, () => drawWorld.call(this));
    else drawWorld.call(this);
  };
  const trackWorld = worldProto.Process_Tracking;
  worldProto.Process_Tracking = function (this: any, ...args: any[]): any {
    const s = netSession();
    return s?.rollbackV2 ? s.presentation.track(this, () => trackWorld.apply(this, args)) : trackWorld.apply(this, args);
  };
  const shakeWorld = worldProto.Process_Shake;
  worldProto.Process_Shake = function (this: any): void {
    const s = netSession();
    if (!s?.rollbackV2 || s.presentation.advancing) shakeWorld.call(this);
  };
  const brightnessWorld = worldProto.Process_Brightness;
  worldProto.Process_Brightness = function (this: any): any {
    const s = netSession();
    return s?.rollbackV2 ? s.presentation.brightness(this, () => brightnessWorld.call(this)) : brightnessWorld.call(this);
  };
  const processWorld = worldProto.Process;
  worldProto.Process = function (this: any): any {
    const session = netSession();
    if (session?.rollback && session.predictionLimit > 0 && session.holdsWorld(this)) {
      return withTimerValue(session.virtualNow(), () => processWorld.call(this));
    }
    return processWorld.call(this);
  };
  const initFinished = worldProto.InitFinished;
  worldProto.InitFinished = function (this: any): void {
    initFinished.call(this);
    const session = netSession();
    if (session && session.phase === 'starting') session.onWorldReady(this);
  };

  // ---- Independent camera (v0.2.3): LAN coop drops the shared-screen contract ------------------
  // Three wrappers that MUST act together (any missing one strands a far-away player):
  //   KeepDistance          the original 19x13 player-to-player tether clears separation-growing deltas - the
  //                         "invisible wall" when two LAN players walk apart. No-op in net coop.
  //   ...WithinPlayerScope  the player respawn scan accepts nothing outside the same 19x13 box and has NO
  //                         fallback (returns undefined -> _Spawn_Player false): with the tether gone, players
  //                         roam apart and P2 could never respawn. Always true in net coop. (Zombie/devil
  //                         spawns never use it - they go through Spawn_ValidPosition.)
  //   TrackThing            the coop camera anchor is the running average over BOTH players; each net client
  //                         ignores the REMOTE player's tracking so its camera follows only its own player.
  //                         mTrackPosition is render state (not checksummed - the DYNAMIC_VIEWPORT precedent),
  //                         so per-client divergence is invisible to the lockstep. DM split screens are already
  //                         independent (mTrackPositions per player) and stay untouched; offline coop keeps all
  //                         three original behaviours.
  const keepDistancePrev = playerProto.KeepDistance;
  playerProto.KeepDistance = function (this: any): any {
    const session = netSession();
    if (session && World.CWorld.mGameMode === 'Coop') return this;
    return keepDistancePrev.call(this);
  };
  const scopePrev = worldProto.Spawn_ValidPosition_WithinPlayerScope;
  worldProto.Spawn_ValidPosition_WithinPlayerScope = function (this: any, p1: any, p2: any): boolean {
    const session = netSession();
    if (session && World.CWorld.mGameMode === 'Coop') return true;
    return scopePrev.call(this, p1, p2);
  };
  const trackThingPrev = worldProto.TrackThing;
  worldProto.TrackThing = function (this: any, tThing: any): void {
    const session = netSession();
    if (session && World.CWorld.mGameMode === 'Coop' && tThing?.mPlayerIndex !== undefined && tThing.mPlayerIndex !== session.role) return;
    return trackThingPrev.call(this, tThing);
  };

  // (v0.2.1 L3 display prediction RETIRED in v0.2.3: with rollback the local player's SIM position is already
  // immediate, so the Player-Draw shadow swap and the Process_Tracking camera-bias wrapper are gone - the
  // camera follows the authoritative position natively, and the original tracking smoothing absorbs the rare
  // one-frame snap of a correction.)

  // ---- Player Draw: render the LOCAL player at the display-predicted position (v0.2.1 L3, RESTORED in the
  // final v0.2.3 cut) ---------------------------------------------------------------------------------------------
  // Rollback carries the sim (stall-free + jitter absorption); the shadow carries the D-tick input-delay
  // GAP in what the player SEES - together: no cadence holes, no visible input lag. Display-layer only
  // (mPosition/mAngle swapped around the RNG-free Draw call and restored).
  const playerDraw = playerProto.Draw;
  const scratchAngle = new (Thing.Math as any).CThing_Angle(0);
  const scratchDelta = new (Thing.Math as any).CThing_Position(1, 0, 0);
  playerProto.Draw = function (this: any, ...args: any[]): any {
    const session = netSession();
    const o = session && !session.rollbackV2 ? shadowDrawOverride(session, this) : null;
    if (!o) return playerDraw.apply(this, args as any[]);
    const realPos = this.mPosition;
    const realAngle = this.mAngle;
    scratchDelta.mX = o.dx;
    scratchDelta.mY = o.dy;
    scratchDelta.mZ = 0;
    scratchAngle.__set__mDelta(scratchDelta);
    this.mPosition = new (Thing.Math as any).CThing_Position(o.x, o.y, realPos.mZ);
    this.mAngle = scratchAngle;
    try {
      return playerDraw.apply(this, args as any[]);
    } finally {
      this.mPosition = realPos;
      this.mAngle = realAngle;
    }
  };
}
