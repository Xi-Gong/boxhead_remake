/**
 * Pure helpers for the Electron main process window sizing.        OWNER: lane D (platform)
 * DYNAMIC_VIEWPORT: the 4:3 content aspect lock is gone - the window resizes freely and the page fills it
 * (the game view grows with the window; only the 640x480 authored minimum remains).
 */

/**
 * Initial content size: 1280x960 (2x the 640x480 stage) when it fits the work area, otherwise the largest 4:3 size
 * in steps of 32x24 that fits (frame allowance included), never below 640x480.
 */
export function initialContentSize(workArea: { width: number; height: number }, frameAllowanceW = 16, frameAllowanceH = 56): { width: number; height: number } {
  const maxW = workArea.width - frameAllowanceW;
  const maxH = workArea.height - frameAllowanceH;
  let steps = 40; // 40 * 32 = 1280
  while (steps > 20 && (steps * 32 > maxW || steps * 24 > maxH)) steps--;
  return { width: steps * 32, height: steps * 24 };
}

/** The subset of Electron's before-input-event `Input` the fullscreen shortcut needs. */
export interface ShortcutInput { type: string; key: string; code?: string; alt?: boolean; isAutoRepeat?: boolean }

/**
 * Lane X1: F11 or Alt+Enter (main or numpad Enter) toggles real window fullscreen in the main process (the page never
 * sees them). 'toggle' on the first key-down, 'swallow' on its auto-repeats, undefined for every other input.
 */
export function fullscreenShortcut(input: ShortcutInput): 'toggle' | 'swallow' | undefined {
  if (input.type !== 'keyDown') return undefined;
  const hit = input.key === 'F11' || (!!input.alt && (input.key === 'Enter' || input.code === 'Enter' || input.code === 'NumpadEnter'));
  if (!hit) return undefined;
  return input.isAutoRepeat ? 'swallow' : 'toggle';
}
