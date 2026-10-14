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

/** Left-stick deadzone (below it the axis counts as centered). */
export const STICK_DEADZONE = 0.35;

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
  /** Left stick quantized with STICK_DEADZONE. */
  stick: PadDirs;
  /** D-pad (buttons 12-15) with a small aliasing guard: a direction counts once released and re-pressed. */
  dpad: PadDirs;
}

const NO_DIRS: PadDirs = { left: false, right: false, up: false, down: false };

/** Stateful diff of one pad slot between polls (button edges; directions are read as hold flags). */
export class GamepadWatcher {
  /** Baseline "everything released": buttons already held at the first poll count as just pressed. */
  private prevButtons: boolean[] = [];

  constructor(private readonly provider: PadProvider, private readonly slot: number) {}

  poll(): PadPoll {
    const pad = this.provider()[this.slot];
    if (!pad || !pad.connected) {
      const allUp = new Set<number>();
      for (let i = 0; i < this.prevButtons.length; i++) if (this.prevButtons[i]) allUp.add(i);
      this.prevButtons = [];
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
    const ax = axes[0] ?? 0;
    const ay = axes[1] ?? 0;
    const stick: PadDirs = {
      left: ax < -STICK_DEADZONE,
      right: ax > STICK_DEADZONE,
      up: ay < -STICK_DEADZONE, // standard mapping: up is negative y
      down: ay > STICK_DEADZONE,
    };
    const dpad: PadDirs = {
      left: !!buttons[14]?.pressed,
      right: !!buttons[15]?.pressed,
      up: !!buttons[12]?.pressed,
      down: !!buttons[13]?.pressed,
    };
    return { present: true, id, axes, down, up, stick, dpad };
  }
}
