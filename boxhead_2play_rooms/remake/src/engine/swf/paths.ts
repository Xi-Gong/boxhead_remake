/**
 * Pure path helpers for the display-list player (lane E). No DOM: usable in Node tests.
 *
 * Library shape paths are SVG path data in px with explicit, space separated commands (`M x y`, `L x y`,
 * `Q cx cy x y`, `Z`). We parse them once into flat command arrays, flatten them into polylines for hit testing
 * (even-odd or non-zero) and stroke distance tests.
 */

/** Opcodes of a parsed path (flat array: op, args...). */
export const OP_M = 0, OP_L = 1, OP_Q = 2, OP_Z = 3;

export type PathCmds = number[];

const TOKEN = /([MLQZmlqz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/** Parse SVG path data restricted to M/L/Q/Z (absolute) into a flat command array. */
export function parsePath(d: string): PathCmds {
  const out: PathCmds = [];
  let cmd = '';
  const nums: number[] = [];
  const flush = (): void => {
    if (!cmd) return;
    const c = cmd.toUpperCase();
    if (c === 'Z') { out.push(OP_Z); return; }
    const n = c === 'Q' ? 4 : 2;
    const op = c === 'M' ? OP_M : c === 'L' ? OP_L : OP_Q;
    for (let i = 0; i + n <= nums.length; i += n) {
      // SVG: extra pairs after M are implicit L
      out.push(i > 0 && op === OP_M ? OP_L : op);
      for (let k = 0; k < n; k++) out.push(nums[i + k]!);
    }
  };
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(d))) {
    if (m[1]) {
      flush();
      cmd = m[1];
      nums.length = 0;
      if (cmd === 'Z' || cmd === 'z') { out.push(OP_Z); cmd = ''; }
    } else nums.push(Number(m[2]));
  }
  flush();
  return out;
}

/** Build path command array from a morph command string + interpolated coordinates. */
export function morphCmds(cmd: string, a: readonly number[], b: readonly number[], t: number): PathCmds {
  const out: PathCmds = [];
  let j = 0;
  const lerp = (): number => { const v = a[j]! + (b[j]! - a[j]!) * t; j++; return v; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd.charCodeAt(i);
    if (c === 77 /* M */) out.push(OP_M, lerp(), lerp());
    else if (c === 76 /* L */) out.push(OP_L, lerp(), lerp());
    else if (c === 81 /* Q */) out.push(OP_Q, lerp(), lerp(), lerp(), lerp());
    else if (c === 90 /* Z */) out.push(OP_Z);
  }
  return out;
}

/** SVG path data from a command array (for Path2D construction). */
export function cmdsToSvg(cmds: PathCmds): string {
  let s = '';
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i++]!;
    if (op === OP_M) { s += `M${cmds[i]} ${cmds[i + 1]}`; i += 2; }
    else if (op === OP_L) { s += `L${cmds[i]} ${cmds[i + 1]}`; i += 2; }
    else if (op === OP_Q) { s += `Q${cmds[i]} ${cmds[i + 1]} ${cmds[i + 2]} ${cmds[i + 3]}`; i += 4; }
    else s += 'Z';
  }
  return s;
}

/** Polylines (x0,y0,x1,y1,...) — one per sub-path, implicitly closed for fills. */
export type Polys = Float64Array[];

/** Flatten quadratic curves into line segments (fixed subdivision; adequate for hit testing). */
export function flatten(cmds: PathCmds, segs = 8): Polys {
  const polys: Polys = [];
  let cur: number[] = [];
  let x = 0, y = 0;
  const end = (): void => { if (cur.length >= 4) polys.push(Float64Array.from(cur)); cur = []; };
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i++]!;
    if (op === OP_M) {
      end();
      x = cmds[i++]!; y = cmds[i++]!;
      cur.push(x, y);
    } else if (op === OP_L) {
      if (cur.length === 0) cur.push(x, y);
      x = cmds[i++]!; y = cmds[i++]!;
      cur.push(x, y);
    } else if (op === OP_Q) {
      if (cur.length === 0) cur.push(x, y);
      const cx = cmds[i++]!, cy = cmds[i++]!, ax = cmds[i++]!, ay = cmds[i++]!;
      for (let k = 1; k <= segs; k++) {
        const t = k / segs, u = 1 - t;
        cur.push(u * u * x + 2 * u * t * cx + t * t * ax, u * u * y + 2 * u * t * cy + t * t * ay);
      }
      x = ax; y = ay;
    } else {
      // Z: close (point list is implicitly closed for fills); next command continues from the start point
      if (cur.length >= 2) { x = cur[0]!; y = cur[1]!; }
      end();
    }
  }
  end();
  return polys;
}

/** Point in polygons, even-odd (`evenOdd`) or non-zero winding. Polygons are implicitly closed. */
export function pointInPolys(polys: Polys, px: number, py: number, evenOdd = true): boolean {
  let crossings = 0;
  let winding = 0;
  for (const p of polys) {
    const n = p.length;
    if (n < 6) continue;
    let x0 = p[n - 2]!, y0 = p[n - 1]!;
    for (let i = 0; i < n; i += 2) {
      const x1 = p[i]!, y1 = p[i + 1]!;
      if ((y0 <= py) !== (y1 <= py)) {
        const xi = x0 + ((py - y0) * (x1 - x0)) / (y1 - y0);
        if (xi > px) { crossings++; winding += y1 > y0 ? 1 : -1; }
      }
      x0 = x1; y0 = y1;
    }
  }
  return evenOdd ? (crossings & 1) === 1 : winding !== 0;
}

/** True if (px,py) is within `r` of any segment of the (open) polylines. */
export function pointNearPolys(polys: Polys, px: number, py: number, r: number, closed = false): boolean {
  const r2 = r * r;
  for (const p of polys) {
    const n = p.length;
    if (n < 2) continue;
    if (n === 2) { if ((p[0]! - px) ** 2 + (p[1]! - py) ** 2 <= r2) return true; continue; }
    const last = closed ? n : n - 2;
    for (let i = 0; i < last; i += 2) {
      const x0 = p[i]!, y0 = p[i + 1]!;
      const j = (i + 2) % n;
      const x1 = p[j]!, y1 = p[j + 1]!;
      const dx = x1 - x0, dy = y1 - y0;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x0 + t * dx - px, ey = y0 + t * dy - py;
      if (ex * ex + ey * ey <= r2) return true;
    }
  }
  return false;
}

/** Control-point bounds of a command array (exact for lines; conservative for curves). */
export function cmdsBounds(cmds: PathCmds): { xMin: number; yMin: number; xMax: number; yMax: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i++]!;
    const n = op === OP_Q ? 4 : op === OP_Z ? 0 : 2;
    for (let k = 0; k < n; k += 2) {
      const x = cmds[i + k]!, y = cmds[i + k + 1]!;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    i += n;
  }
  return x1 >= x0 ? { xMin: x0, yMin: y0, xMax: x1, yMax: y1 } : null;
}
