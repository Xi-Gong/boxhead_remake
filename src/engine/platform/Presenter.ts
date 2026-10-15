/**
 * Game canvas: 640x480 logical stage, letterboxed 4:3 into the container, device-pixel-ratio aware.   OWNER: lane D
 *
 *     const presenter = new Presenter(document.getElementById('stage')!);
 *     presenter.render(player);                    // sets ctx transform logical->device, calls player.render(ctx, s)
 *     presenter.clientToLogical(e.clientX, e.clientY)
 *     presenter.toggleFullscreen()                 // Electron: IPC to main; browser: Fullscreen API
 *
 * The container is expected to fill the window (index.html #stage: position:absolute; inset:0). Bars are black
 * (container background) like the Flash standalone player's "showAll" scale mode.
 */
import { toggleFullscreen } from './desktop.ts';

export const STAGE_W = 640;
export const STAGE_H = 480;

export interface RenderablePlayer {
  render(ctx: CanvasRenderingContext2D, deviceScale: number): void;
}

export interface PresenterOptions {
  /** Canvas background drawn before player.render (SWF stage colour #000). */
  background?: string;
  imageSmoothing?: boolean;
  imageSmoothingQuality?: ImageSmoothingQuality;
}

export interface Fit { cssW: number; cssH: number; left: number; top: number; deviceW: number; deviceH: number }

/** Pure: fit a 4:3 stage into a container (CSS px) and choose the backing-store size (device px). */
export function computeFit(containerW: number, containerH: number, dpr: number, stageW = STAGE_W, stageH = STAGE_H): Fit {
  const cw = Math.max(1, containerW), ch = Math.max(1, containerH);
  const scale = Math.min(cw / stageW, ch / stageH);
  // Whole device pixels (never larger than the container) so the compositor does not resample the canvas.
  const deviceW = Math.max(1, Math.floor(stageW * scale * dpr + 1e-6));
  const deviceH = Math.max(1, Math.floor(stageH * scale * dpr + 1e-6));
  const cssW = deviceW / dpr, cssH = deviceH / dpr;
  return { cssW, cssH, left: (cw - cssW) / 2, top: (ch - cssH) / 2, deviceW, deviceH };
}

export class Presenter {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly container: HTMLElement;
  /** Device px per logical px (x and y; equal up to rounding). */
  scaleX = 1;
  scaleY = 1;
  private readonly opts: Required<PresenterOptions>;
  private readonly ro: ResizeObserver | undefined;
  private dprQuery: MediaQueryList | undefined;
  private cursor = '';
  private readonly listeners = new Set<() => void>();

  constructor(container: HTMLElement, opts: PresenterOptions = {}) {
    this.container = container;
    this.opts = {
      background: opts.background ?? '#000000',
      imageSmoothing: opts.imageSmoothing ?? true,
      imageSmoothingQuality: opts.imageSmoothingQuality ?? 'low',
    };
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.background ||= '#000';
    container.style.overflow = 'hidden';
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.style.position = 'absolute';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: false });
    if (!ctx) throw new Error('Canvas2D unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(container);
    }
    window.addEventListener('resize', this.resize);
    // Windows can reset the native cursor (fullscreen toggle, focus loss) without any style change we could
    // observe; setCursor dedupes and the render loop is paused while the context menu is open, so re-apply
    // the last wanted value actively (resize also fires on Electron's setFullScreen window-size change).
    window.addEventListener('focus', this.reassertCursor);
    window.addEventListener('blur', this.reassertCursor);
    this.watchDpr();
  }

  /** Recompute size (called automatically on resize / DPR change). */
  readonly resize = (): void => {
    const r = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const f = computeFit(r.width || window.innerWidth, r.height || window.innerHeight, dpr);
    const c = this.canvas;
    if (c.width !== f.deviceW || c.height !== f.deviceH) {
      c.width = f.deviceW;
      c.height = f.deviceH;
    }
    c.style.width = `${f.cssW}px`;
    c.style.height = `${f.cssH}px`;
    c.style.left = `${f.left}px`;
    c.style.top = `${f.top}px`;
    this.scaleX = f.deviceW / STAGE_W;
    this.scaleY = f.deviceH / STAGE_H;
    this.applyContextState();
    for (const l of this.listeners) l();
    this.reassertCursor();
  };

  /** Notified after every resize (e.g. to re-render while paused). */
  onResize(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private watchDpr(): void {
    if (typeof matchMedia !== 'function') return;
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onDpr);
  }

  private readonly onDpr = (): void => { this.resize(); this.watchDpr(); };

  private applyContextState(): void {
    this.ctx.imageSmoothingEnabled = this.opts.imageSmoothing;
    this.ctx.imageSmoothingQuality = this.opts.imageSmoothingQuality;
  }

  /** Device pixels per logical pixel (what player.render receives). */
  get deviceScale(): number { return this.scaleX; }

  /** Draw one frame: clear to the stage colour, map logical -> device px, let the player draw. */
  render(player: RenderablePlayer): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.opts.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    this.applyContextState();
    ctx.save();
    player.render(ctx, this.scaleX);
    ctx.restore();
  }

  /** Client (CSS px, e.g. MouseEvent.clientX/Y) -> logical stage px (may be outside 0..640/0..480 over the bars). */
  clientToLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) * STAGE_W) / (r.width || 1),
      y: ((clientY - r.top) * STAGE_H) / (r.height || 1),
    };
  }

  /** Logical stage px -> client CSS px (e.g. to place the HTML context menu). */
  logicalToClient(x: number, y: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (x * r.width) / STAGE_W, y: r.top + (y * r.height) / STAGE_H };
  }

  /** CSS cursor over the stage ('default' | 'pointer' | 'none' ...). */
  setCursor(cursor: string): void {
    if (cursor === this.cursor) return;
    this.cursor = cursor;
    this.container.style.cursor = cursor;
  }

  /** Force the last wanted cursor back onto the container (see constructor: native cursor resets). */
  private readonly reassertCursor = (): void => { if (this.cursor) this.container.style.cursor = this.cursor; };

  toggleFullscreen(): void { toggleFullscreen(); }

  dispose(): void {
    this.ro?.disconnect();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('focus', this.reassertCursor);
    window.removeEventListener('blur', this.reassertCursor);
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.canvas.remove();
  }
}
