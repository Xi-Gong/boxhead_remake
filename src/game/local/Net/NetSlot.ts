// LAN input slot (deviation LAN_MULTIPLAYER, v0.1.3). In a net session BOTH players' mControls entries are replaced
// with NetSlots driven by per-tick input bitmaps: the remote player becomes immune to the local keyboard, and the
// LOCAL player also runs through its own bitmap so both peers derive identical latches / timestamps (the grenade
// hold power must be the same number on both machines).
//
// The consumed interface is exactly what the 1:1 port reads (CThing_Creature_Player.State_PlayerControl +
// CThing_Weapon.Update): IsDown / IsPressed / IsReleased / IsUp / Renew (called on init, on every weapon switch and
// on respawn - a still-held key must re-produce its press edge, like CInput.UpdateKey does after Renew) and the
// mTimePressed / mTimeDown timestamps (Grenade.Fire). All times come from NetSession's virtual input clock
// (1000 / CMain.mFPS per executed tick), never from the wall clock.
export class NetSlot {
  // CInput slot look-alike fields (mKeycode keeps introspection working; unused for input).
  mKeycode = 0;
  mKeycode_1: number | undefined = undefined;
  mDown = false;
  mPressed = false;
  mReleased = false;
  mTimeDown = 0;
  mTimePressed = 0;
  mTimeReleased = 0;
  /** Tick index of the press edge (informational; power derives from the virtual timestamps). */
  pressTick = 0;

  /**
   * Tick-boundary update: the bitmap bit for this slot at the tick that is ABOUT to run. Edges, latches and
   * timestamps are derived here, so they are identical on both peers by construction.
   */
  setHeld(held: boolean, tick: number, timeMs: number): void {
    if (held) {
      if (!this.mDown) {
        this.mDown = true;
        this.mPressed = true;
        this.mTimeDown = timeMs;
        this.mTimePressed = timeMs;
        this.pressTick = tick;
      }
    } else if (this.mDown) {
      this.mDown = false;
      this.mReleased = true;
      this.mTimeReleased = timeMs;
    }
  }

  IsDown(): boolean { return this.mDown; }
  IsUp(): boolean { return !this.mDown; }

  IsPressed(): boolean {
    if (this.mPressed) {
      this.mPressed = false;
      return true;
    }
    return false;
  }

  IsReleased(): boolean {
    if (this.mReleased) {
      this.mReleased = false;
      this.mPressed = false;
      return true;
    }
    return false;
  }

  Renew(): void {
    this.mReleased = false;
    this.mPressed = false;
    this.mDown = false;
  }
}

/**
 * The seven bitmap bits of one player's lockstep input frame (protocol.ts 'in' message). The names ARE the
 * mControls member names, which also map straight onto the CInput slot names ('KEY_' + name / + '2').
 */
export const SLOT_ORDER = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'FIRE', 'NEXT_WEAPON', 'PREV_WEAPON'] as const;
export type SlotBitName = (typeof SLOT_ORDER)[number];

/** Pack the held flags into the wire bitmap. */
export function packBits(held: Record<SlotBitName, boolean>): number {
  let bits = 0;
  for (let i = 0; i < SLOT_ORDER.length; i++) if (held[SLOT_ORDER[i]]) bits |= 1 << i;
  return bits;
}

/** Unpack bit i of the wire bitmap. */
export function unpackBit(bits: number, name: SlotBitName): boolean {
  return ((bits >> SLOT_ORDER.indexOf(name)) & 1) !== 0;
}
