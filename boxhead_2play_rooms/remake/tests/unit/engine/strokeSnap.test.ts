// Lane V (visual fidelity): Flash's pixel alignment of thin strokes, measured in Flash Player 8 and 28 with
// tools/oracle/visual/strokeProbe.ts (20x20 squares stroked at x/y = 20 + f, f = 0 / 0.25 / 0.5 / 0.75, on the stage
// and through BitmapData.draw; drawing-API lineStyle and DefineShape line styles; scaled placements).
import { describe, expect, it } from 'vitest';
import { snapCmds, snapCoord, strokeSnap } from '../../../src/engine/flash/strokeSnap.ts';

/** Pixel rows a horizontal line of device width w centred at y covers (fully), after snapping. */
function rows(y: number, deviceWidth: number): number[] {
  const s = strokeSnap(deviceWidth);
  const c = snapCoord(y, s.mode);
  const out: number[] = [];
  for (let r = Math.floor(c - s.width / 2); r < c + s.width / 2; r++) out.push(r);
  return out;
}

describe('strokeSnap (Flash Player stroke pixel alignment)', () => {
  it('a 1 px line fills exactly the pixel row containing its centre (measured: row 20 for y = 20, 20.25, 20.5, 20.75)', () => {
    for (const f of [0, 0.25, 0.5, 0.75]) expect(rows(20 + f, 1)).toEqual([20]);
  });

  it('hairlines and device widths below 1 px are drawn as snapped 1 px lines (lineStyle(0); width 1 at scale 0.77)', () => {
    expect(strokeSnap(0)).toEqual({ width: 1, mode: 1 });
    expect(strokeSnap(0.05)).toEqual({ width: 1, mode: 1 });
    expect(strokeSnap(0.77)).toEqual({ width: 1, mode: 1 });
    for (const f of [0, 0.25, 0.5, 0.75]) expect(rows(360 + f, 0.77)).toEqual([360]);
  });

  it('a 2 px line snaps its centre to the nearest pixel edge, half up (rows 19-20 for f < 0.5, 20-21 for f >= 0.5)', () => {
    expect(rows(20, 2)).toEqual([19, 20]);
    expect(rows(20.25, 2)).toEqual([19, 20]);
    expect(rows(20.5, 2)).toEqual([20, 21]);
    expect(rows(20.75, 2)).toEqual([20, 21]);
    // width 1 under a 2x scale = device width 2 (measured identical)
    expect(strokeSnap(1 * 2)).toEqual({ width: 2, mode: 2 });
  });

  it('a 3 px line covers rows floor(c)-1 .. floor(c)+1 for every fraction', () => {
    for (const f of [0, 0.25, 0.5, 0.75]) expect(rows(100 + f, 3)).toEqual([99, 100, 101]);
  });

  it('non-whole widths are not snapped (1.5 px: measured exact coverage 0.75/0.75, 0.5/1, 0.25/1/0.25, 1/0.5)', () => {
    expect(strokeSnap(1.5)).toEqual({ width: 1.5, mode: 0 });
    expect(snapCoord(20.25, 0)).toBe(20.25);
  });

  it('snapCmds transforms to device space and snaps every point (M, L, Q control + anchor; Z kept)', () => {
    const cmds = [0, 0, 0, 1, 20, 0, 2, 25, 5, 20, 10, 3];
    const out = snapCmds(cmds, { a: 1, b: 0, c: 0, d: 1, tx: 10.75, ty: 20.25 }, 1);
    expect(out).toEqual([0, 10.5, 20.5, 1, 30.5, 20.5, 2, 35.5, 25.5, 30.5, 30.5, 3]);
    const even = snapCmds([0, 0, 0, 1, 1, 0], { a: 2, b: 0, c: 0, d: 2, tx: 0.5, ty: 0.25 }, 2);
    expect(even).toEqual([0, 1, 0, 1, 3, 0]);
  });
});
