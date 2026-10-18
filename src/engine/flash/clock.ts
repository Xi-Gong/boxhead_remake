/**
 * Time source for the AS2 port.
 *
 * - `getTimer()`  : AS2 getTimer() — integer milliseconds since start. Real wall-clock time in the app; fully virtual
 *                   in headless tests.
 * - `frameTime()` : the SCHEDULED time of the current enterFrame (EF) tick (multiple of 20 ms at 50 fps). The port of
 *                   CMain.ProcessFrames reads this instead of getTimer() so tick maths are exact at any monitor refresh
 *                   rate (see deviations.ts).
 */
export interface Clock {
  mode: 'real' | 'virtual';
  /** performance.now() at start (real mode). */
  origin: number;
  /** Virtual "now" in ms (virtual mode). */
  virtualNow: number;
  /** Scheduled EF time in ms since start. */
  efTime: number;
}

const perfNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const clock: Clock = { mode: 'real', origin: perfNow(), virtualNow: 0, efTime: 0 };
let timerOverride: number | undefined;

/** Synchronous simulation scope: replay reads tick time without moving the platform/enterFrame clock. */
export function withTimerValue<T>(timeMs: number, run: () => T): T {
  const previous = timerOverride;
  timerOverride = timeMs;
  try { return run(); } finally { timerOverride = previous; }
}

/** AS2 getTimer(). */
export function getTimer(): number {
  if (timerOverride !== undefined) return Math.floor(timerOverride);
  return clock.mode === 'virtual' ? Math.floor(clock.virtualNow) : Math.floor(perfNow() - clock.origin);
}

/** Scheduled time (ms since start) of the enterFrame currently being processed. */
export function frameTime(): number {
  return clock.efTime;
}

/** Called by the loop at the start of each enterFrame. */
export function beginEnterFrame(scheduledMs: number): void {
  clock.efTime = scheduledMs;
}

/** Switch to a deterministic virtual clock (tests / headless). */
export function useVirtualClock(startMs = 0): void {
  clock.mode = 'virtual';
  clock.virtualNow = startMs;
  clock.efTime = startMs;
}

/** Advance the virtual clock. */
export function advanceVirtual(ms: number): void {
  clock.virtualNow += ms;
}

/** Back to real time (resets origin to now). */
export function useRealClock(): void {
  clock.mode = 'real';
  clock.origin = perfNow();
  clock.efTime = 0;
}

/** Milliseconds since start as a float (engine use only; AS2 code uses getTimer()). */
export function nowMs(): number {
  return clock.mode === 'virtual' ? clock.virtualNow : perfNow() - clock.origin;
}
