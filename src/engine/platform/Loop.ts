/**
 * Flash 50 Hz enterFrame emulation on requestAnimationFrame.          OWNER: lane D (platform)
 *
 * Usage (src/main.ts):
 *     const loop = new Loop({ player, render: () => presenter.render(player) });
 *     loop.start();
 *
 * Scheduling (pure `FrameScheduler`, unit-tested with injected time):
 *   - EFs are due on a fixed grid: `nextEF += 20 ms` after each EF; the first EF runs on the first rAF.
 *   - At most `ceil(rafInterval / 20)` EFs run per rAF (rafInterval = median of recent rAF deltas), so 60/144 Hz
 *     displays run one EF on ~5 of 6 / 5 of 14 frames and 30 Hz displays run 1-2 EFs per frame: 50 EF/s on all.
 *   - A backlog is never caught up: if more EFs are due than this rAF may run (jank, hidden tab, breakpoint), the
 *     grid restarts at `now` and exactly one EF runs. Lost time is lost, like Flash Player slowing down.
 *   - For each EF: `clock.beginEnterFrame(scheduledTime)` then `player.enterFrame()`. Render once per rAF if any
 *     EF ran.
 * Times are ms since `clock.origin` (the getTimer() timebase), so frameTime() and getTimer() agree.
 */
import { beginEnterFrame, clock } from '../flash/clock.ts';
import { pumpSoundEvents } from './AudioEngine.ts';

export const EF_MS = 20;
/** Upper bound of EFs per rAF (a 12.5 Hz display would need 4). */
export const MAX_EF_PER_RAF = 4;
/** rAF deltas above this are gaps (hidden tab, debugger), not refresh intervals. */
const MAX_SAMPLE_MS = 250;
const SAMPLES = 9;
const DEFAULT_INTERVAL = 1000 / 60;

export class FrameScheduler {
  /** Scheduled time of the next EF (ms). NaN until the first rAF. */
  nextEF = Number.NaN;
  private lastNow = Number.NaN;
  private deltas: number[] = [];
  readonly efMs: number;

  constructor(efMs = EF_MS) { this.efMs = efMs; }

  /** Robust estimate of the rAF interval (median of recent deltas). */
  get rafInterval(): number {
    if (this.deltas.length === 0) return DEFAULT_INTERVAL;
    const s = [...this.deltas].sort((a, b) => a - b);
    return s[(s.length - 1) >> 1]!;
  }

  /** EFs allowed per rAF for the current refresh rate. */
  get maxPerRaf(): number {
    return Math.max(1, Math.min(MAX_EF_PER_RAF, Math.ceil(this.rafInterval / this.efMs - 1e-6)));
  }

  /** Forget the grid (e.g. after a pause): the next rAF runs an EF immediately. */
  reset(): void { this.nextEF = Number.NaN; this.lastNow = Number.NaN; }

  /** Call once per rAF with the current time (ms). Returns the scheduled times of the EFs to run now. */
  plan(now: number): number[] {
    if (Number.isFinite(this.lastNow)) {
      const dt = now - this.lastNow;
      if (dt > 0 && dt <= MAX_SAMPLE_MS) {
        this.deltas.push(dt);
        if (this.deltas.length > SAMPLES) this.deltas.shift();
      }
    }
    this.lastNow = now;
    if (!Number.isFinite(this.nextEF)) this.nextEF = now;
    const max = this.maxPerRaf;
    // More EFs due than this rAF may run -> drop the backlog (never catch up).
    if (now - this.nextEF >= max * this.efMs) this.nextEF = now;
    const out: number[] = [];
    while (this.nextEF <= now && out.length < max) {
      out.push(this.nextEF);
      this.nextEF += this.efMs;
    }
    return out;
  }
}

export interface LoopPlayer { enterFrame(): void }

export interface LoopOptions {
  player: LoopPlayer;
  /** Called once per rAF after the EFs, if at least one EF ran. */
  render?: () => void;
  /** Called after each EF (debug overlays, profilers). */
  afterEnterFrame?: (scheduledMs: number) => void;
  /**
   * Called once per rAF BEFORE the (possibly skipped) EF batch, with the paused/blocked state — even while paused,
   * so an input device that has no DOM events (gamepads, deviation GAMEPAD_INPUT) can be polled every frame and
   * reconcile its keys with the same lifecycle as the keyboard (blocked = release everything, like Key._clear()).
   */
  beforeTick?: (blocked: boolean) => void;
  /** Error handler for exceptions thrown by enterFrame/render (default: console.error, loop keeps running). */
  onError?: (e: unknown) => void;
}

export class Loop {
  readonly scheduler = new FrameScheduler();
  private raf = 0;
  private running = false;
  private paused = false;
  /** Total EFs run (debug). */
  efCount = 0;
  private readonly opts: LoopOptions;

  constructor(opts: LoopOptions) { this.opts = opts; }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduler.reset();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Freeze enterFrame (Flash freezes while its context menu is open). Rendering also stops. */
  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    if (!p) this.scheduler.reset();
  }

  get isPaused(): boolean { return this.paused; }

  /** Replace the per-rAF pre-tick hook (gamepad polling installs itself here after startPlatform). */
  setBeforeTick(fn: ((blocked: boolean) => void) | undefined): void { this.opts.beforeTick = fn; }

  private readonly tick = (ts: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    pumpSoundEvents();
    this.opts.beforeTick?.(this.paused);
    if (this.paused) return;
    const now = ts - clock.origin;
    const due = this.scheduler.plan(now);
    if (due.length === 0) return;
    try {
      for (const t of due) {
        beginEnterFrame(t);
        this.opts.player.enterFrame();
        this.efCount++;
        this.opts.afterEnterFrame?.(t);
      }
      this.opts.render?.();
    } catch (e) {
      (this.opts.onError ?? ((err: unknown) => console.error('[loop]', err)))(e);
    }
  };
}
