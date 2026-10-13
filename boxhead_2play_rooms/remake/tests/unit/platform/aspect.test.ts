import { describe, expect, it } from 'vitest';
import { aspectLockedBounds, initialContentSize } from '../../../electron/aspect.ts';

// Frame measured on Windows 11 @150 %: window 1294x998 for content 1280x960.
const FW = 14, FH = 38;
const content = (b: { width: number; height: number }): [number, number] => [b.width - FW, b.height - FH];

describe('Windows content-aspect lock (will-resize)', () => {
  const start = { x: 100, y: 50, width: 1280 + FW, height: 960 + FH };

  it('dragging the right edge sets the height from the width (top-left anchored)', () => {
    const b = aspectLockedBounds({ ...start, width: start.width - 300 }, 'right', FW, FH);
    expect(content(b)).toEqual([980, 735]);
    expect([b.x, b.y]).toEqual([100, 50]);
  });

  it('dragging the bottom edge sets the width from the height', () => {
    const b = aspectLockedBounds({ ...start, height: 600 + FH }, 'bottom', FW, FH);
    expect(content(b)).toEqual([800, 600]);
  });

  it('left / top edges keep the opposite edges anchored', () => {
    const p = { x: 400, y: 50, width: start.width - 300, height: start.height };
    const b = aspectLockedBounds(p, 'left', FW, FH);
    expect(content(b)).toEqual([980, 735]);
    expect(b.x + b.width).toBe(p.x + p.width);
    const q = { x: 100, y: 300, width: 900 + FW, height: 600 + FH };
    const c = aspectLockedBounds(q, 'top-left', FW, FH);
    expect(content(c)[0] / content(c)[1]).toBeCloseTo(4 / 3, 2);
    expect(c.x + c.width).toBe(q.x + q.width);
    expect(c.y + c.height).toBe(q.y + q.height);
  });

  it('corners follow the dominant dimension; minimum content is 640x480', () => {
    expect(content(aspectLockedBounds({ ...start, width: 1600 + FW, height: 900 + FH }, 'bottom-right', FW, FH))).toEqual([1600, 1200]);
    expect(content(aspectLockedBounds({ ...start, width: 1000 + FW, height: 900 + FH }, 'bottom-right', FW, FH))).toEqual([1200, 900]);
    expect(content(aspectLockedBounds({ ...start, width: 300 + FW, height: 200 + FH }, 'bottom-right', FW, FH))).toEqual([640, 480]);
  });

  it('a 4:3 proposal is returned unchanged (handler then lets Windows proceed)', () => {
    expect(aspectLockedBounds(start, 'bottom-right', FW, FH)).toEqual(start);
  });
});

describe('initial content size fits the work area', () => {
  it('1280x960 when it fits, scaled down 4:3 on small screens, never below 640x480', () => {
    expect(initialContentSize({ width: 1707, height: 1019 })).toEqual({ width: 1280, height: 960 });
    expect(initialContentSize({ width: 1366, height: 728 })).toEqual({ width: 896, height: 672 });
    expect(initialContentSize({ width: 800, height: 500 })).toEqual({ width: 640, height: 480 });
  });
});
