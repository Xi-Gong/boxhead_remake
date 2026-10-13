/**
 * Flash's pixel alignment of thin strokes (lane V, measured with tools/oracle/visual/strokeProbe.ts in Flash Player 8
 * and 28; identical on the stage and through BitmapData.draw, for DefineShape line styles and drawing-API lineStyle).
 *
 * The stroke's DEVICE width W decides:
 *   - W < 1 (incl. hairlines / lineStyle(0)): drawn as a solid 1 px line, snapped like W = 1;
 *   - W a whole number: every path point is moved to the pixel grid before stroking - odd W: x -> floor(x) + 0.5
 *     (the line covers whole pixels around it: a 1 px line centred anywhere in [20, 21) fills pixel row 20), even W:
 *     x -> round(x), half up (a 2 px line centred at 20.25 covers rows 19-20, at 20.5 rows 20-21);
 *   - any other width (e.g. 1.5): not snapped, exact anti-aliased coverage.
 * Canvas2D strokes the exact geometry, so without this a 1 px outline at an integer coordinate becomes two 50% grey
 * rows (room walls, barrels, HUD frames, XSI character outlines at 1x).
 *
 * Pure (no DOM) except `snappedPath2D`.
 */

/** Debug switch (visual tests: before/after comparisons): false = exact, unsnapped strokes (pre-lane-V behaviour). */
export const strokeSnapConfig = { enabled: true };

/** Snapping mode for a device stroke width: 0 = none, 1 = odd (floor + 0.5), 2 = even (round). */
export type SnapMode = 0 | 1 | 2;

/** Device widths within this distance of a whole number count as whole (half a twip). */
const WHOLE_EPS = 0.025;

/** Effective device width (hairline / sub-pixel -> 1) and the snapping mode for it. */
export function strokeSnap(deviceWidth: number): { width: number; mode: SnapMode } {
  if (!strokeSnapConfig.enabled) return { width: deviceWidth >= 1 ? deviceWidth : 1, mode: 0 };
  if (!(deviceWidth >= 1)) return { width: 1, mode: 1 };
  const r = Math.round(deviceWidth);
  if (Math.abs(deviceWidth - r) > WHOLE_EPS) return { width: deviceWidth, mode: 0 };
  return { width: r, mode: r % 2 === 1 ? 1 : 2 };
}

export function snapCoord(v: number, mode: SnapMode): number {
  if (mode === 1) return Math.floor(v) + 0.5;
  if (mode === 2) return Math.floor(v + 0.5);
  return v;
}

export interface Affine { a: number; b: number; c: number; d: number; tx: number; ty: number }

/**
 * Transform a flat path command array (op codes 0 = M x y, 1 = L x y, 2 = Q cx cy x y, 3 = Z - the format of
 * swf/paths.ts and flash/Graphics.ts) to device space with every point snapped.
 */
export function snapCmds(cmds: readonly number[], m: Affine, mode: SnapMode): number[] {
  const out: number[] = [];
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i]!;
    out.push(op);
    const n = op === 2 ? 2 : op === 3 ? 0 : 1;
    for (let k = 0; k < n; k++) {
      const x = cmds[i + 1 + 2 * k]!, y = cmds[i + 2 + 2 * k]!;
      out.push(snapCoord(m.a * x + m.c * y + m.tx, mode), snapCoord(m.b * x + m.d * y + m.ty, mode));
    }
    i += 1 + 2 * n;
  }
  return out;
}

/** Path2D (device space) of snapCmds(); `closeLast` closes the final subpath (like Graphics' buildPath2D). */
export function snappedPath2D(cmds: readonly number[], m: Affine, mode: SnapMode, closeLast = false): Path2D {
  const s = snapCmds(cmds, m, mode);
  const p = new Path2D();
  for (let i = 0; i < s.length;) {
    const op = s[i]!;
    if (op === 0) { p.moveTo(s[i + 1]!, s[i + 2]!); i += 3; }
    else if (op === 1) { p.lineTo(s[i + 1]!, s[i + 2]!); i += 3; }
    else if (op === 2) { p.quadraticCurveTo(s[i + 1]!, s[i + 2]!, s[i + 3]!, s[i + 4]!); i += 5; }
    else { p.closePath(); i += 1; }
  }
  if (closeLast) p.closePath();
  return p;
}
