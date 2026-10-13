/**
 * Pure helper for the Electron main process: keep the window CONTENT at 4:3 while the user drags a window edge.
 * Needed on Windows, where BrowserWindow.setAspectRatio() applies the ratio to the whole window rect (title bar and
 * borders included) and ignores `extraSize` (verified with Electron 44).        OWNER: lane D (platform)
 */
export interface Bounds { x: number; y: number; width: number; height: number }

/**
 * @param proposed  window bounds Windows is about to apply (will-resize `newBounds`, DIP)
 * @param edge      will-resize `details.edge` ('left', 'top-right', ...; 'top' accepted too)
 * @param frameW    window width minus content width (DIP)
 * @param frameH    window height minus content height (DIP)
 * @returns window bounds whose content is ratio-locked, anchored on the edges that are not being dragged.
 */
export function aspectLockedBounds(
  proposed: Bounds, edge: string, frameW: number, frameH: number, ratio = 4 / 3, minContentW = 640,
): Bounds {
  let cw = Math.max(1, proposed.width - frameW);
  let ch = Math.max(1, proposed.height - frameH);
  if (edge === 'left' || edge === 'right') ch = cw / ratio;
  else if (edge === 'top' || edge === 'bottom') cw = ch * ratio;
  else if (cw / ch > ratio) ch = cw / ratio; // corner: the dimension that grew most wins
  else cw = ch * ratio;
  if (cw < minContentW) { cw = minContentW; ch = minContentW / ratio; }
  const width = Math.round(cw) + frameW;
  const height = Math.round(ch) + frameH;
  return {
    x: edge.includes('left') ? proposed.x + proposed.width - width : proposed.x,
    y: edge.includes('top') ? proposed.y + proposed.height - height : proposed.y,
    width,
    height,
  };
}

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
