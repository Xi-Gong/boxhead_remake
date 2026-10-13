/** Small allocation-light 2D affine helpers (Flash order: x' = a*x + c*y + tx, y' = b*x + d*y + ty). */

export interface M6 { a: number; b: number; c: number; d: number; tx: number; ty: number }
export interface Bounds { xMin: number; yMin: number; xMax: number; yMax: number }

export const ID6: Readonly<M6> = Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

/** p ∘ m : apply m first, then p (parent device matrix times child local matrix). */
export function mul(p: M6, m: M6): M6 {
  return {
    a: p.a * m.a + p.c * m.b,
    b: p.b * m.a + p.d * m.b,
    c: p.a * m.c + p.c * m.d,
    d: p.b * m.c + p.d * m.d,
    tx: p.a * m.tx + p.c * m.ty + p.tx,
    ty: p.b * m.tx + p.d * m.ty + p.ty,
  };
}

export function invert(m: M6): M6 {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0 || !Number.isFinite(det)) return { a: 1, b: 0, c: 0, d: 1, tx: -m.tx, ty: -m.ty };
  const a = m.d / det, b = -m.b / det, c = -m.c / det, d = m.a / det;
  return { a, b, c, d, tx: -(a * m.tx + c * m.ty), ty: -(b * m.tx + d * m.ty) };
}

export function apply(m: M6, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
}

/** AABB of a rectangle transformed by m. */
export function transformBounds(m: M6, b: Bounds): Bounds {
  const x0 = b.xMin, y0 = b.yMin, x1 = b.xMax, y1 = b.yMax;
  const ax = m.a * x0, cx0 = m.c * y0, ax1 = m.a * x1, cy1 = m.c * y1;
  const bx = m.b * x0, dy0 = m.d * y0, bx1 = m.b * x1, dy1 = m.d * y1;
  const xs0 = ax + cx0, xs1 = ax1 + cx0, xs2 = ax + cy1, xs3 = ax1 + cy1;
  const ys0 = bx + dy0, ys1 = bx1 + dy0, ys2 = bx + dy1, ys3 = bx1 + dy1;
  return {
    xMin: Math.min(xs0, xs1, xs2, xs3) + m.tx,
    xMax: Math.max(xs0, xs1, xs2, xs3) + m.tx,
    yMin: Math.min(ys0, ys1, ys2, ys3) + m.ty,
    yMax: Math.max(ys0, ys1, ys2, ys3) + m.ty,
  };
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    xMin: Math.min(a.xMin, b.xMin), yMin: Math.min(a.yMin, b.yMin),
    xMax: Math.max(a.xMax, b.xMax), yMax: Math.max(a.yMax, b.yMax),
  };
}

/** Device scale of a matrix (sqrt |det|). */
export const matScale = (m: M6): number => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));

export const isIdentity = (m: M6): boolean => m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.tx === 0 && m.ty === 0;
