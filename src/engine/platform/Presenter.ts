/**
 * Game canvas: the window is FILLED at the original aspect scale and the logical stage grows with it
 * (deviation DYNAMIC_VIEWPORT): scale s = min(cw/640, ch/480), so the limiting dimension stays exactly
 * 640x480 and the other extends — the stage is never smaller than the authored 640x480 content.
 * 640x480-authored content (menus) is centred on the grown stage by the engine's stage layout; the
 * in-game world view uses the full stage. At a 4:3 window this is byte-identical to the old letterbox.
 * Device-pixel-ratio aware.   OWNER: lane D
 *
 *     const presenter = new Presenter(document.getElementById('stage')!);
 *     presenter.render(player);                    // sets ctx transform logical->device, calls player.render(ctx, s)
 *     presenter.clientToLogical(e.clientX, e.clientY)
 *     presenter.toggleFullscreen()                 // Electron: IPC to main; browser: Fullscreen API
 *
 * The container is expected to fill the window (index.html #stage: position:absolute; inset:0).
 */
import { toggleFullscreen } from './desktop.ts';

/** The AUTHORED content size (the original SWF stage). The live stage is always >= STAGE_W x STAGE_H. */
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

export interface Fill { deviceW: number; deviceH: number; stageW: number; stageH: number }

/**
 * Pure: fill a container (CSS px) with the canvas and derive the live logical stage + backing store (device px).
 * Whole device pixels (never larger than the container) so the compositor does not resample the canvas; the stage
 * is rounded to whole logical px and clamped to >= the authored size (sub-pixel backing rounding then shrinks the
 * scale by a hair instead of cropping content).
 */
export function computeFill(containerW: number, containerH: number, dpr: number, stageW0 = STAGE_W, stageH0 = STAGE_H): Fill {
  const cw = Math.max(1, containerW), ch = Math.max(1, containerH);
  const scale = Math.min(cw / stageW0, ch / stageH0);
  const deviceW = Math.max(1, Math.floor(cw * dpr + 1e-6));
  const deviceH = Math.max(1, Math.floor(ch * dpr + 1e-6));
  return {
    deviceW,
    deviceH,
    stageW: Math.max(stageW0, Math.round(deviceW / (dpr * scale))),
    stageH: Math.max(stageH0, Math.round(deviceH / (dpr * scale))),
  };
}

export class Presenter {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly container: HTMLElement;
  /** Live logical stage size (>= 640x480; equals it at 4:3 windows). Read by tests and the stage layout. */
  stageW = STAGE_W;
  stageH = STAGE_H;
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
    const f = computeFill(r.width || window.innerWidth, r.height || window.innerHeight, dpr);
    const c = this.canvas;
    if (c.width !== f.deviceW || c.height !== f.deviceH) {
      c.width = f.deviceW;
      c.height = f.deviceH;
    }
    // Whole-device CSS size centred in the container (identical to it up to sub-pixel backing rounding).
    const cssW = f.deviceW / dpr, cssH = f.deviceH / dpr;
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    c.style.left = `${(r.width - cssW) / 2}px`;
    c.style.top = `${(r.height - cssH) / 2}px`;
    this.stageW = f.stageW;
    this.stageH = f.stageH;
    this.scaleX = f.deviceW / f.stageW;
    this.scaleY = f.deviceH / f.stageH;
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

  /**
   * Where the authored 640x480 content sits on the live stage ((stageW-STAGE_W)/2, (stageH-STAGE_H)/2; (0,0) at 4:3).
   * Menu-space (content) coordinates = stage coordinates - this offset.
   */
  get contentOffset(): { x: number; y: number } {
    return { x: (this.stageW - STAGE_W) / 2, y: (this.stageH - STAGE_H) / 2 };
  }

  /** Client (CSS px, e.g. MouseEvent.clientX/Y) -> logical STAGE px (may be outside 0..stageW/0..stageH). */
  clientToLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) * this.stageW) / (r.width || 1),
      y: ((clientY - r.top) * this.stageH) / (r.height || 1),
    };
  }

  /** Logical STAGE px -> client CSS px (e.g. to place the HTML context menu). */
  logicalToClient(x: number, y: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (x * r.width) / this.stageW, y: r.top + (y * r.height) / this.stageH };
  }

  /**
   * Authored-content (menu space, 640x480) px -> client CSS px: DOM widgets glued to SWF art below the stage's
   * content offset (the LAN IP box, the debrief name conduit) use this so they follow the centred content at any
   * window shape. Identity to logicalToClient at 4:3 windows.
   */
  contentToClient(x: number, y: number): { x: number; y: number } {
    const o = this.contentOffset;
    return this.logicalToClient(x + o.x, y + o.y);
  }

  /** Client CSS px -> authored-content (menu space) px (inverse of contentToClient). */
  clientToContent(clientX: number, clientY: number): { x: number; y: number } {
    const o = this.contentOffset;
    const p = this.clientToLogical(clientX, clientY);
    return { x: p.x - o.x, y: p.y - o.y };
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
