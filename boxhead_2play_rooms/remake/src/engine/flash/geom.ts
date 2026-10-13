/**
 * flash.geom (Flash Player 8 / AS2 API) — Point, Rectangle, Matrix, ColorTransform.        OWNER: lane C
 *
 * In Flash Player 8, Point/Rectangle/Matrix are implemented in ActionScript inside the player. The method bodies
 * below follow those implementations operation-for-operation (same evaluation order of floating point sums, same
 * special cases: `invert()` of an axis-aligned matrix never resets, `concat()` only computes skew terms when a skew
 * is present, `Point.normalize()` proceeds on NaN length, ...), cross-checked against Flash Player trace output
 * (Ruffle test corpus `tests/swfs/avm1/{matrix,point,rectangle,color_transform}`).
 * Deliberate difference: missing constructor arguments default to 0/1 instead of `undefined` (TS typing).
 */
import { numberToString as n2s } from './as2.ts';

export class Point {
  x: number;
  y: number;
  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }
  get length(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  /** Returns a new point. */
  add(v: Point): Point { const y = this.y + v.y; const x = this.x + v.x; return new Point(x, y); }
  /** Returns a new point. */
  subtract(v: Point): Point { const y = this.y - v.y; const x = this.x - v.x; return new Point(x, y); }
  clone(): Point { return new Point(this.x, this.y); }
  equals(p: Point): boolean { return p instanceof Point && p.x === this.x && p.y === this.y; }
  /** Scales in place so that the length equals `len`. Bails out only for length <= 0 (NaN proceeds, as in Flash). */
  normalize(len: number): void {
    const l = this.length;
    if (l <= 0) return;
    const s = len / l;
    this.x *= s;
    this.y *= s;
  }
  /** In place. */
  offset(dx: number, dy: number): void { this.x += dx; this.y += dy; }
  toString(): string { return `(x=${n2s(this.x)}, y=${n2s(this.y)})`; }
  static distance(a: Point, b: Point): number { return a.subtract(b).length; }
  /** f = 1 returns a, f = 0 returns b (Flash semantics). */
  static interpolate(a: Point, b: Point, f: number): Point {
    const y = b.y + (a.y - b.y) * f;
    const x = b.x + (a.x - b.x) * f;
    return new Point(x, y);
  }
  static polar(len: number, angle: number): Point {
    const y = len * Math.sin(angle);
    const x = len * Math.cos(angle);
    return new Point(x, y);
  }
}

export class Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
  get left(): number { return this.x; }
  set left(v: number) { this.width += this.x - v; this.x = v; }
  get right(): number { return this.x + this.width; }
  set right(v: number) { this.width = v - this.x; }
  get top(): number { return this.y; }
  set top(v: number) { this.height += this.y - v; this.y = v; }
  get bottom(): number { return this.y + this.height; }
  set bottom(v: number) { this.height = v - this.y; }
  get topLeft(): Point { return new Point(this.x, this.y); }
  set topLeft(p: Point) {
    this.width += this.x - p.x;
    this.height += this.y - p.y;
    this.x = p.x;
    this.y = p.y;
  }
  get bottomRight(): Point { return new Point(this.x + this.width, this.y + this.height); }
  set bottomRight(p: Point) { this.width = p.x - this.x; this.height = p.y - this.y; }
  get size(): Point { return new Point(this.width, this.height); }
  set size(p: Point) { this.width = p.x; this.height = p.y; }
  clone(): Rectangle { return new Rectangle(this.x, this.y, this.width, this.height); }
  contains(x: number, y: number): boolean { return x >= this.x && x < this.x + this.width && y >= this.y && y < this.y + this.height; }
  containsPoint(p: Point): boolean { return this.contains(p.x, p.y); }
  containsRectangle(r: Rectangle): boolean {
    const rr = r.x + r.width, rb = r.y + r.height;
    const right = this.x + this.width, bottom = this.y + this.height;
    return r.x >= this.x && r.x < right && r.y >= this.y && r.y < bottom &&
      rr > this.x && rr <= right && rb > this.y && rb <= bottom;
  }
  equals(r: Rectangle): boolean {
    return r instanceof Rectangle && r.x === this.x && r.y === this.y && r.width === this.width && r.height === this.height;
  }
  /** In place: grows by dx on left and right, dy on top and bottom. */
  inflate(dx: number, dy: number): void {
    this.x -= dx;
    this.width += dx * 2;
    this.y -= dy;
    this.height += dy * 2;
  }
  inflatePoint(p: Point): void { this.inflate(p.x, p.y); }
  /** True for width/height <= 0 or NaN. */
  isEmpty(): boolean { return !(this.width > 0) || !(this.height > 0); }
  setEmpty(): void { this.height = 0; this.width = 0; this.y = 0; this.x = 0; }
  offset(dx: number, dy: number): void { this.x += dx; this.y += dy; }
  offsetPoint(p: Point): void { this.offset(p.x, p.y); }
  intersects(r: Rectangle): boolean { return !this.intersection(r).isEmpty(); }
  intersection(r: Rectangle): Rectangle {
    const res = new Rectangle();
    if (this.isEmpty() || r.isEmpty()) return res;
    res.x = Math.max(this.x, r.x);
    res.y = Math.max(this.y, r.y);
    res.width = Math.min(this.x + this.width, r.x + r.width) - res.x;
    res.height = Math.min(this.y + this.height, r.y + r.height) - res.y;
    if (res.width <= 0 || res.height <= 0) res.setEmpty();
    return res;
  }
  union(r: Rectangle): Rectangle {
    if (this.isEmpty()) return r.clone();
    if (r.isEmpty()) return this.clone();
    const res = new Rectangle();
    res.x = Math.min(this.x, r.x);
    res.y = Math.min(this.y, r.y);
    res.width = Math.max(this.x + this.width, r.x + r.width) - res.x;
    res.height = Math.max(this.y + this.height, r.y + r.height) - res.y;
    return res;
  }
  toString(): string { return `(x=${n2s(this.x)}, y=${n2s(this.y)}, w=${n2s(this.width)}, h=${n2s(this.height)})`; }
}

export class Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
  constructor(a: number = 1, b: number = 0, c: number = 0, d: number = 1, tx: number = 0, ty: number = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }
  clone(): Matrix { return new Matrix(this.a, this.b, this.c, this.d, this.tx, this.ty); }
  identity(): void { this.d = 1; this.a = 1; this.c = 0; this.b = 0; this.ty = 0; this.tx = 0; }
  /**
   * In place: this = this followed by m (apply this first, then m). Exactly Flash's operation order: the skew terms
   * are only added when either matrix has a non-zero (or NaN) skew.
   */
  concat(m: Matrix): void {
    let a = this.a * m.a;
    let d = this.d * m.d;
    let b = 0;
    let c = 0;
    let tx = this.tx * m.a + m.tx;
    let ty = this.ty * m.d + m.ty;
    // AS2 `x != 0` is true for NaN and false for -0; `!==` behaves the same for numbers.
    if (this.b !== 0 || this.c !== 0 || m.b !== 0 || m.c !== 0) {
      a += this.b * m.c;
      d += this.c * m.b;
      b += this.a * m.b + this.b * m.d;
      c += this.c * m.a + this.d * m.c;
      tx += this.ty * m.c;
      ty += this.tx * m.b;
    }
    this.a = a; this.b = b; this.c = c; this.d = d; this.tx = tx; this.ty = ty;
  }
  /** In place: appends a rotation (radians). */
  rotate(q: number): void {
    const cos = Math.cos(q);
    const sin = Math.sin(q);
    this.concat(new Matrix(cos, sin, -sin, cos, 0, 0));
  }
  /** In place: appends a scale. */
  scale(sx: number, sy: number): void { this.concat(new Matrix(sx, 0, 0, sy, 0, 0)); }
  /** In place: appends a translation. */
  translate(dx: number, dy: number): void { this.tx += dx; this.ty += dy; }
  createBox(scaleX: number, scaleY: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    this.identity();
    this.rotate(rotation);
    this.scale(scaleX, scaleY);
    this.tx = tx;
    this.ty = ty;
  }
  createGradientBox(width: number, height: number, rotation: number = 0, tx: number = 0, ty: number = 0): void {
    const boxY = ty + height / 2;
    const boxX = tx + width / 2;
    const scaleY = height / 1638.4;
    const scaleX = width / 1638.4;
    this.createBox(scaleX, scaleY, rotation, boxX, boxY);
  }
  /**
   * In place. Flash quirks: an axis-aligned matrix is inverted per axis (a zero scale gives Infinity, no reset);
   * otherwise a singular matrix becomes the identity.
   */
  invert(): void {
    if (this.b === 0 && this.c === 0) {
      this.a = 1 / this.a;
      this.d = 1 / this.d;
      this.c = 0;
      this.b = 0;
      this.tx = -this.a * this.tx;
      this.ty = -this.d * this.ty;
      return;
    }
    const a = this.a, b = this.b, c = this.c, d = this.d;
    let det = a * d - b * c;
    if (det === 0) { this.identity(); return; }
    det = 1 / det;
    this.a = d * det;
    this.b = -b * det;
    this.c = -c * det;
    this.d = a * det;
    const p = this.deltaTransformPoint(new Point(this.tx, this.ty));
    this.tx = -p.x;
    this.ty = -p.y;
  }
  transformPoint(p: Point): Point {
    const y = this.d * p.y + this.b * p.x + this.ty;
    const x = this.a * p.x + this.c * p.y + this.tx;
    return new Point(x, y);
  }
  deltaTransformPoint(p: Point): Point {
    const y = this.d * p.y + this.b * p.x;
    const x = this.a * p.x + this.c * p.y;
    return new Point(x, y);
  }
  toString(): string { return `(a=${n2s(this.a)}, b=${n2s(this.b)}, c=${n2s(this.c)}, d=${n2s(this.d)}, tx=${n2s(this.tx)}, ty=${n2s(this.ty)})`; }
  /** Engine helper (not Flash API): returns a new matrix = first `this`, then `m`. */
  concatNew(m: Matrix): Matrix { const r = this.clone(); r.concat(m); return r; }
}

const toUint32 = (v: number): number => {
  if (!Number.isFinite(v)) return 0;
  return (v < 0 ? Math.ceil(v) : Math.floor(v)) >>> 0;
};

export class ColorTransform {
  redMultiplier: number;
  greenMultiplier: number;
  blueMultiplier: number;
  alphaMultiplier: number;
  redOffset: number;
  greenOffset: number;
  blueOffset: number;
  alphaOffset: number;
  constructor(
    redMultiplier: number = 1, greenMultiplier: number = 1, blueMultiplier: number = 1, alphaMultiplier: number = 1,
    redOffset: number = 0, greenOffset: number = 0, blueOffset: number = 0, alphaOffset: number = 0,
  ) {
    this.redMultiplier = redMultiplier;
    this.greenMultiplier = greenMultiplier;
    this.blueMultiplier = blueMultiplier;
    this.alphaMultiplier = alphaMultiplier;
    this.redOffset = redOffset;
    this.greenOffset = greenOffset;
    this.blueOffset = blueOffset;
    this.alphaOffset = alphaOffset;
  }
  /** Getter: (ro << 16) + (go << 8) + bo with uint32 wrapping. Setter: offsets = the color, multipliers = 0. */
  get rgb(): number {
    return (((toUint32(this.redOffset) << 16) >>> 0) + ((toUint32(this.greenOffset) << 8) >>> 0) + toUint32(this.blueOffset)) >>> 0;
  }
  set rgb(v: number) {
    const u = toUint32(v);
    this.redMultiplier = this.greenMultiplier = this.blueMultiplier = 0;
    this.redOffset = (u >>> 16) & 0xff;
    this.greenOffset = (u >>> 8) & 0xff;
    this.blueOffset = u & 0xff;
  }
  /**
   * In place, Flash Player semantics (which differ from the documentation): `second` is applied FIRST and `this`
   * after it, i.e. offset = second.offset * this.multiplier + this.offset; multiplier = second.multiplier * this.multiplier.
   * So `parentCx.clone().concat(childCx)` yields the accumulated transform for rendering a child.
   */
  concat(second: ColorTransform): void {
    this.redOffset = second.redOffset * this.redMultiplier + this.redOffset;
    this.greenOffset = second.greenOffset * this.greenMultiplier + this.greenOffset;
    this.blueOffset = second.blueOffset * this.blueMultiplier + this.blueOffset;
    this.alphaOffset = second.alphaOffset * this.alphaMultiplier + this.alphaOffset;
    this.redMultiplier = second.redMultiplier * this.redMultiplier;
    this.greenMultiplier = second.greenMultiplier * this.greenMultiplier;
    this.blueMultiplier = second.blueMultiplier * this.blueMultiplier;
    this.alphaMultiplier = second.alphaMultiplier * this.alphaMultiplier;
  }
  clone(): ColorTransform {
    return new ColorTransform(this.redMultiplier, this.greenMultiplier, this.blueMultiplier, this.alphaMultiplier,
      this.redOffset, this.greenOffset, this.blueOffset, this.alphaOffset);
  }
  /** Engine helper: true when this transform is the identity. */
  isIdentity(): boolean {
    return this.redMultiplier === 1 && this.greenMultiplier === 1 && this.blueMultiplier === 1 && this.alphaMultiplier === 1 &&
      this.redOffset === 0 && this.greenOffset === 0 && this.blueOffset === 0 && this.alphaOffset === 0;
  }
  /** Engine helper: true when only alphaMultiplier differs from identity. */
  isAlphaOnly(): boolean {
    return this.redMultiplier === 1 && this.greenMultiplier === 1 && this.blueMultiplier === 1 &&
      this.redOffset === 0 && this.greenOffset === 0 && this.blueOffset === 0 && this.alphaOffset === 0;
  }
  toString(): string {
    return `(redMultiplier=${n2s(this.redMultiplier)}, greenMultiplier=${n2s(this.greenMultiplier)}, blueMultiplier=${n2s(this.blueMultiplier)}, alphaMultiplier=${n2s(this.alphaMultiplier)}, redOffset=${n2s(this.redOffset)}, greenOffset=${n2s(this.greenOffset)}, blueOffset=${n2s(this.blueOffset)}, alphaOffset=${n2s(this.alphaOffset)})`;
  }
}
