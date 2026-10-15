// v0.1.8: Windows can reset the native cursor (fullscreen toggle, focus loss) without any observable style
// change, and setCursor dedupes + the render loop is paused while the context menu is open — so the Presenter
// must actively re-apply the last wanted cursor on window focus/blur and resize.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Presenter } from '../../../src/engine/platform/Presenter.ts';

/** Minimal DOM: only what the Presenter constructor + setCursor/reassert touch. */
function makeDom(): {
  container: Record<string, any>;
  listeners: Map<string, Set<() => void>>;
  fire(type: string): void;
} {
  const listeners = new Map<string, Set<() => void>>();
  const win = {
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (t: string, fn: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(fn); },
    removeEventListener: (t: string, fn: () => void) => { listeners.get(t)?.delete(fn); },
  };
  const ctx = { imageSmoothingEnabled: true, imageSmoothingQuality: 'low', fillStyle: '', setTransform() {}, save() {}, restore() {}, fillRect() {} };
  const canvasFactory = () => ({
    className: '', width: 0, height: 0, tabIndex: 0,
    style: {} as Record<string, string>,
    getContext: () => ctx,
    remove() {},
  });
  const container = {
    style: {} as Record<string, string>,
    appendChild() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { createElement: () => canvasFactory() });
  vi.stubGlobal('getComputedStyle', () => ({ position: 'absolute' }));
  return {
    container,
    listeners,
    fire(type: string): void { for (const fn of listeners.get(type) ?? []) fn(); },
  };
}

describe('Presenter cursor re-assert (v0.1.8)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('re-applies the last cursor when the window regains/loses focus (native cursor reset)', () => {
    const dom = makeDom();
    const p = new Presenter(dom.container as unknown as HTMLElement);
    p.setCursor('none');
    expect(dom.container.style.cursor).toBe('none');
    // Windows reset the native cursor underneath us (no style event we could observe).
    dom.container.style.cursor = 'default';
    dom.fire('focus');
    expect(dom.container.style.cursor).toBe('none');
    dom.container.style.cursor = 'default';
    dom.fire('blur');
    expect(dom.container.style.cursor).toBe('none');
    p.dispose();
  });

  it('re-applies the cursor on resize (Electron setFullScreen changes the window size, not the DOM)', () => {
    const dom = makeDom();
    const p = new Presenter(dom.container as unknown as HTMLElement);
    p.setCursor('none');
    dom.container.style.cursor = 'default';
    dom.fire('resize');
    expect(dom.container.style.cursor).toBe('none');
    p.dispose();
  });

  it('dispose removes the listeners', () => {
    const dom = makeDom();
    const p = new Presenter(dom.container as unknown as HTMLElement);
    p.dispose();
    for (const set of dom.listeners.values()) expect(set.size).toBe(0);
  });
});
