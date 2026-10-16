import { describe, expect, it } from 'vitest';
import { fullscreenShortcut, initialContentSize } from '../../../electron/aspect.ts';

describe('initial content size fits the work area', () => {
  it('1280x960 when it fits, scaled down 4:3 on small screens, never below 640x480', () => {
    expect(initialContentSize({ width: 1707, height: 1019 })).toEqual({ width: 1280, height: 960 });
    expect(initialContentSize({ width: 1366, height: 728 })).toEqual({ width: 896, height: 672 });
    expect(initialContentSize({ width: 800, height: 500 })).toEqual({ width: 640, height: 480 });
  });
});

describe('lane X1: fullscreen shortcut of the Electron main process (before-input-event)', () => {
  const kd = (key: string, extra: Partial<{ code: string; alt: boolean; isAutoRepeat: boolean }> = {}) => ({ type: 'keyDown', key, ...extra });
  it('F11 and Alt+Enter (main / numpad) toggle once; auto-repeats are swallowed; everything else passes', () => {
    expect(fullscreenShortcut(kd('F11'))).toBe('toggle');
    expect(fullscreenShortcut(kd('Enter', { code: 'Enter', alt: true }))).toBe('toggle');
    expect(fullscreenShortcut(kd('Enter', { code: 'NumpadEnter', alt: true }))).toBe('toggle');
    expect(fullscreenShortcut(kd('F11', { isAutoRepeat: true }))).toBe('swallow');
    expect(fullscreenShortcut(kd('Enter', { code: 'Enter' }))).toBeUndefined(); // plain Enter is a game key
    expect(fullscreenShortcut(kd('F12'))).toBeUndefined();
    expect(fullscreenShortcut(kd('p', { code: 'KeyP', alt: true }))).toBeUndefined();
    expect(fullscreenShortcut({ type: 'keyUp', key: 'F11' })).toBeUndefined();
  });
});
