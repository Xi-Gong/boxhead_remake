/**
 * Engine-generic gamepad polling (deviation GAMEPAD_INPUT).                OWNER: lane D (platform)
 *
 * Gamepads fire no DOM events, so they must be POLLED once per animation frame (Loop's beforeTick hook): the raw
 * navigator.getGamepads() snapshots (or an injected provider in tests) are diffed against the previous poll to get
 * button edges, and the left stick / d-pad are quantized to the same four boolean directions the keyboard produces
 * (8 directions through combinations; aiming in this game is movement-direction, so no analog angles are needed).
 *
 * "Standard gamepad mapping" indices (https://w3.org/TR/gamepad/#remapping), also used by the game-side translator:
 *   buttons 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 8=Back 9=Start 12=Up 13=Down 14=Left 15=Right
 *   axes    0=left x  1=left y  2=right x  3=right y
 */

/** Minimal shape of a standard-mapping Gamepad the poller needs. */
export interface RawPad {
  index: number;
  connected: boolean;
  /** Human-readable pad name (navigator Gamepad.id); shown by the input badge. */
  id?: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

/** Provider of the current pad snapshots (index-aligned, nulls allowed like getGamepads()). */
export type PadProvider = () => readonly (RawPad | null)[];

/** navigator.getGamepads wrapped; returns no pads when the API (or window) is absent (Node tests, SSR). */
export function navigatorPadProvider(): PadProvider {
  return () => {
    const nav = typeof navigator !== 'undefined' ? (navigator as { getGamepads?: () => (Gamepad | null)[] }) : undefined;
    if (!nav?.getGamepads) return [];
    try {
      return nav.getGamepads();
    } catch {
      return [];
    }
  };
}

/** Left-stick deadzone (below it the axis counts as centered) - used by the ANALOG menu cursor speed. */
export const STICK_DEADZONE = 0.35;

/**
 * v0.1.7 radial 8-direction quantization thresholds (the game-side movement/aim flags). v0.1.4 thresholded each
 * axis independently, so the direction wedges changed shape with the deflection magnitude (at half push a diagonal
 * needed a ~1-degree window around 45 degrees while cardinals got +/-44 degrees), and releasing the stick flicked
 * through a diagonal as the two axes crossed the threshold at different times. The stick now ENGAGES at 40 %
 * magnitude, HOLDS its direction down to 30 % (the release band keeps the last sector unchanged - no flicker),
 * and the direction is the angle snapped to eight even 22.5-degree sectors regardless of magnitude.
 */
export const STICK_ENGAGE = 0.40;
export const STICK_RELEASE = 0.30;
/** Angular stickiness (degrees): a sector only changes once the stick moved this far from where it was set. */
export const STICK_STICKY_DEG = 4;

/** Four boolean directions (combos give the 8 keyboard directions). */
export interface PadDirs { left: boolean; right: boolean; up: boolean; down: boolean }

export interface PadPoll {
  /** A connected pad was seen this poll. */
  present: boolean;
  /** The pad's name (RawPad.id) when present. */
  id?: string;
  /** Raw axes copy (may be shorter than 4 on exotic pads; missing axes read as 0). */
  axes: number[];
  /** Buttons newly pressed since the previous poll (standard indices). */
  down: Set<number>;
  /** Buttons released since the previous poll. */
  up: Set<number>;
  /** Left stick quantized to the 8 keyboard directions (radial engage/release + even sectors; v0.1.7). */
  stick: PadDirs;
  /** D-pad (buttons 12-15) with a small aliasing guard: a direction counts once released and re-pressed. */
  dpad: PadDirs;
}

const NO_DIRS: PadDirs = { left: false, right: false, up: false, down: false };

/** Smallest absolute difference between two angles in degrees. */
const angDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Direction flags of one of the eight 45-degree sector centres (-180..180; standard mapping: up is negative y). */
const dirsOfSector = (sector: number): PadDirs => {
  const c = Math.cos(sector * Math.PI / 180);
  const s = Math.sin(sector * Math.PI / 180);
  return { left: c < -0.5, right: c > 0.5, up: s < -0.5, down: s > 0.5 };
};

/** Stateful diff of one pad slot between polls (button edges; directions are read as hold flags). */
export class GamepadWatcher {
  /** Baseline "everything released": buttons already held at the first poll count as just pressed. */
  private prevButtons: boolean[] = [];
  /** Radial engage state + the sector's anchor angle (see STICK_ENGAGE; v0.1.7). */
  private stickEngaged = false;
  private stickSector = 0;
  private stickAngleAt: number | undefined;

  constructor(private readonly provider: PadProvider, private readonly slot: number) {}

  poll(): PadPoll {
    const pad = this.provider()[this.slot];
    if (!pad || !pad.connected) {
      const allUp = new Set<number>();
      for (let i = 0; i < this.prevButtons.length; i++) if (this.prevButtons[i]) allUp.add(i);
      this.prevButtons = [];
      this.stickEngaged = false;
      this.stickAngleAt = undefined;
      return { present: false, axes: [], down: new Set(), up: allUp, stick: { ...NO_DIRS }, dpad: { ...NO_DIRS } };
    }
    const buttons = pad.buttons ?? [];
    const now = buttons.map((b) => !!(b && b.pressed));
    const down = new Set<number>();
    const up = new Set<number>();
    for (let i = 0; i < Math.max(now.length, this.prevButtons.length); i++) {
      const cur = !!now[i];
      const prev = !!this.prevButtons[i];
      if (cur && !prev) down.add(i);
      if (!cur && prev) up.add(i);
    }
    this.prevButtons = now;
    const axes = [...(pad.axes ?? [])];
    const id = pad.id;
    const stick = this.quantizeStick(axes[0] ?? 0, axes[1] ?? 0);
    const dpad: PadDirs = {
      left: !!buttons[14]?.pressed,
      right: !!buttons[15]?.pressed,
      up: !!buttons[12]?.pressed,
      down: !!buttons[13]?.pressed,
    };
    return { present: true, id, axes, down, up, stick, dpad };
  }

  /**
   * Radial 8-direction quantization with magnitude hysteresis and angular stickiness (v0.1.7; see STICK_ENGAGE):
   * below STICK_RELEASE everything is off; between RELEASE and ENGAGE the LAST direction is held unchanged (the
   * release band - letting go never flickers through a diagonal); at ENGAGE and above the angle snaps to the
   * nearest 22.5-degree sector, and a new sector is only taken once the stick moved STICK_STICKY_DEG from the
   * angle that set the current one (boundary wobble does not flip the direction).
   */
  private quantizeStick(ax: number, ay: number): PadDirs {
    const m = Math.hypot(ax, ay);
    if (!this.stickEngaged) {
      if (m < STICK_ENGAGE) return { ...NO_DIRS };
      this.stickEngaged = true;
      this.stickAngleAt = undefined; // fresh sector acquisition
    } else if (m < STICK_RELEASE) {
      this.stickEngaged = false;
      this.stickAngleAt = undefined;
      return { ...NO_DIRS };
    }
    if (m < STICK_ENGAGE) return dirsOfSector(this.stickSector); // the release band: hold the last direction
    const deg = Math.atan2(ay, ax) * 180 / Math.PI;
    const sector = Math.round(deg / 45) * 45;
    if (this.stickAngleAt === undefined
      || (sector !== this.stickSector && angDiff(deg, this.stickAngleAt) >= STICK_STICKY_DEG)) {
      this.stickSector = sector;
      this.stickAngleAt = deg;
    }
    return dirsOfSector(this.stickSector);
  }
}
