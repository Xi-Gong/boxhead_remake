/**
 * AS2 display list — DisplayObject base + MovieClip, TextField, Button.          OWNER: lane E (display-list player)
 *
 * This file is the CONTRACT the game port (src/game) codes against. Signatures and documented semantics must not
 * change without updating the conventions doc.
 *
 * Key semantics (Flash Player 8, AVM1):
 *   - Coordinates are logical px (stage 640x480). `_x/_y` are stored as int32 twips, the setter TRUNCATES toward zero
 *     (1.26 -> 1.25, -0.03 -> 0; int32 overflow -> -107374182.4) [ORACLE P2]; `_rotation` is normalised to [-180, 180];
 *     `_xscale/_yscale` are stored exactly; `_width/_height` read back rounded to twips.
 *   - `_alpha` is 0..100 but stored as an 8.8 color-transform multiplier: get(set(v)) = trunc(v*2.56)/2.56.
 *   - Children live at integer depths. Timeline-placed objects use depth-16384 (negative). Script-created clips use
 *     depth >= 0 and are never touched by timeline operations. A named child is also a property on its parent.
 *   - MovieClip subclasses registered for a linkage (Object.registerClass) are instantiated WITHOUT running a JS
 *     constructor (Object.create(Class.prototype)); after the clip is named, placed, its init object copied and its
 *     frame-1 children built (but NOT yet constructed), the engine calls `ctor()` (the ported AS2 constructor body).
 *     Subclasses implement `ctor()` and call `super.ctor()` first (mirrors AS2 `super()`); they must not declare a JS
 *     constructor.
 *   - CONSTRUCTION ORDER (Flash Player 8/28/32, measured by oracle probe P11 — tests/goldens/flash/p11_construct*.json):
 *       1. the whole tree is built first: the clip, its init object (visible in its ctor), its frame-1 children,
 *          grandchildren... (they exist, `typeof` = movieclip, but their constructors have NOT run); the frame-1
 *          DoActions of the tree are queued (children before parents); the instance hook runs per object;
 *       2. PARENT FIRST: the attached clip's ctor() runs inside attachMovie / duplicateMovieClip / createEmptyMovieClip;
 *       3. then the constructors of everything the timelines placed, pre-order (an object before its children,
 *          children by ascending depth, depth-first). They run before attachMovie returns when it is called from a
 *          frame script (or outside any script); when attachMovie is called inside a constructor they run after that
 *          constructor returns; when called from an event handler (onEnterFrame — how CMain attaches "World" —, mouse
 *          events) they run right after the handler returns (so `mc.child` exists but is unconstructed until then).
 *          Children placed by a timeline advance / goto follow the same rule (immediately in the timeline phase);
 *       4. queued frame scripts (children first), then onLoad events (parent first; for clips constructed during the
 *          timeline phase, after all actions of that phase).
 *   - Event handlers are plain function-valued properties (onEnterFrame, onPress, onRelease, onReleaseOutside,
 *     onRollOver, onRollOut, onMouseDown, onMouseUp, onKeyDown, onKeyUp), invoked with `this` = the object.
 *
 * Engine notes (lane E):
 *   - Build order of one object (attachMovie and timeline placement alike): create (Object.create of the registered
 *     class or MovieClip) -> name/depth/parent property -> PlaceObject properties -> initObject (AS2 for..in order) ->
 *     frame-1 children (built recursively) -> its frame-1 DoAction queued -> instance hook. Constructors (ctor()) and
 *     onLoad then follow the CONSTRUCTION ORDER above (engine/swf/state.ts: pendingCtors, flushConstructors).
 *   - Engine-internal members are prefixed with `$` (never touched by game code).
 *   - All instances are created with Object.create — never rely on class field initializers in subclasses.
 */
import { ColorTransform, Matrix, Point, Rectangle } from '../flash/geom.ts';
import { BitmapFilter, fromRecord } from '../flash/filters.ts';
import type { BitmapData, IDrawable } from '../flash/BitmapData.ts';
import { Graphics } from '../flash/Graphics.ts';
import { TextFormat } from '../flash/TextFormat.ts';
import { forIn, toAS2String, toNumber } from '../flash/as2.ts';
import type {
  ButtonDef, ButtonRecord, CX, EditTextDef, Filter, FontDef, Mat, MorphDef, ShapeDef, SoundInfo, SpriteDef,
  StaticTextDef,
} from '../../shared/assetSchema.ts';
import {
  canConstructNow, drainActions, engine, flushConstructors, lib, queueAction, queueLoad, warnOnce,
} from './state.ts';
import { getFrameScript, getInstanceHook, getTimelineSoundHandler, reportScriptError } from './registry.ts';
import {
  replayFrames, resolveFrame, T_BLEND, T_CACHE, T_CHAR, T_CX, T_FILTERS, T_MATRIX, T_RATIO,
  type PlacementState, type TimelineState,
} from './timeline.ts';
import { apply, invert, mul, transformBounds, unionBounds, type Bounds, type M6 } from './mat.ts';
import { flatten, pointInPolys, pointNearPolys, type Polys } from './paths.ts';
import {
  applyFormat, caretIndexAt, commonFormat, defaultFmt, layoutText, normalizeSpans, parseHtml, replaceRange,
  restrictAllows, spansText, toHtml, type Align, type Span, type TextEnv, type TextFmt, type TextLayout,
} from './text.ts';
import { renderContentOf } from './render/renderer.ts';

export type DOKind = 'mc' | 'shape' | 'morph' | 'text' | 'edit' | 'button' | 'bitmap';

/** Flash's value for every field of an empty object's getBounds(). */
export const INVALID_BOUNDS = 6710886.35;

/** Round to the nearest twip (bounds / _width / _height results). */
const twips = (v: number): number => Math.round(v * 20) / 20;
/**
 * [ORACLE P2] Script-set positions (_x/_y; by the same storage also transform.matrix tx/ty and createTextField x/y) are
 * stored as int32 twips TRUNCATED toward zero: 1.26 -> 1.25, 0.975 -> 0.95, -0.03 -> 0 (so `_x += 0.04` never moves a
 * clip). A twip value outside int32 becomes -2^31 twips = -107374182.4 (Flash Player 28/32; Flash Player 8 wraps
 * modulo 2^32 instead: 1e9 -> -73741824 — the game never gets near either).
 */
export const twipsTrunc = (v: number): number => {
  const t = Math.trunc(v * 20);
  return (t > 2147483647 || t < -2147483648 ? -2147483648 : t) / 20;
};
const fixed8 = (v: number): number => Math.max(-32768, Math.min(32767, Math.trunc(v * 256))) / 256;
const finite = (v: unknown): number | undefined => {
  if (v === undefined || v === null) return undefined;
  const n = toNumber(v);
  return Number.isFinite(n) ? n : undefined;
};
/** AS2 (SWF7+) ToBoolean. */
export function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  return v !== undefined && v !== null;
}
const toDepth = (v: unknown): number => {
  const n = toNumber(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

/** Hit-testing configuration (injectable for tests / alternative implementations). */
export const hitConfig = {
  /** Point-in-fill test on flattened polylines in local coordinates. */
  pointInFill: (polys: Polys, x: number, y: number, evenOdd: boolean): boolean => pointInPolys(polys, x, y, evenOdd),
  /** Point-near-stroke test (radius in local units). */
  pointOnStroke: (polys: Polys, x: number, y: number, r: number): boolean => pointNearPolys(polys, x, y, r),
};

function cxFromRecord(c: CX): ColorTransform | null {
  if (c.rm === 1 && c.gm === 1 && c.bm === 1 && c.am === 1 && c.ra === 0 && c.ga === 0 && c.ba === 0 && c.aa === 0) return null;
  return new ColorTransform(c.rm, c.gm, c.bm, c.am, c.ra, c.ga, c.ba, c.aa);
}

const BLEND_NAMES = ['normal', 'normal', 'layer', 'multiply', 'screen', 'lighten', 'darken', 'difference', 'add',
  'subtract', 'invert', 'alpha', 'erase', 'overlay', 'hardlight'];

function filtersFromRecords(fs: readonly Filter[]): BitmapFilter[] {
  const out: BitmapFilter[] = [];
  for (const f of fs) { const b = fromRecord(f); if (b) out.push(b); }
  return out;
}

function filtersKey(fs: readonly BitmapFilter[]): string {
  let k = '';
  for (const f of fs) k += JSON.stringify(f) + ';';
  return k;
}

/** flash.geom.Transform bound to a display object (AS2 `mc.transform`). */
export class Transform {
  private readonly o: DisplayObject;
  constructor(o: DisplayObject) { this.o = o; }
  get matrix(): Matrix { return this.o.$m.clone(); }
  set matrix(m: Matrix) {
    if (!m || typeof m !== 'object') return;
    const o = this.o;
    o.$m = new Matrix(Number(m.a), Number(m.b), Number(m.c), Number(m.d), twipsTrunc(Number(m.tx)), twipsTrunc(Number(m.ty)));
    o.$srOk = false;
    o.$scriptXf = true;
    o.$invXf();
  }
  get colorTransform(): ColorTransform { return this.o.$cx ? this.o.$cx.clone() : new ColorTransform(); }
  set colorTransform(c: ColorTransform) {
    if (!c || typeof c !== 'object') return;
    const n = new ColorTransform(fixed8(c.redMultiplier), fixed8(c.greenMultiplier), fixed8(c.blueMultiplier),
      fixed8(c.alphaMultiplier), Math.trunc(c.redOffset), Math.trunc(c.greenOffset), Math.trunc(c.blueOffset), Math.trunc(c.alphaOffset));
    this.o.$cx = n.isIdentity() ? null : n;
    this.o.$scriptXf = true;
    this.o.$invXf();
  }
  get concatenatedMatrix(): Matrix { const m = this.o.$concat(); return new Matrix(m.a, m.b, m.c, m.d, m.tx, m.ty); }
  get concatenatedColorTransform(): ColorTransform {
    const c = new ColorTransform();
    for (let x: DisplayObject | undefined = this.o; x; x = x._parent) if (x.$cx) c.concat(x.$cx);
    return c;
  }
  get pixelBounds(): Rectangle {
    const b = this.o.$boundsWith(this.o.$concat());
    return b ? new Rectangle(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin) : new Rectangle();
  }
}

export abstract class DisplayObject implements IDrawable {
  /** Dynamic AS2 properties (named children, ad-hoc fields set by game code). */
  [key: string]: any;

  declare _name: string;
  declare _parent: MovieClip | undefined;

  // ------------------------------------------------------------------ engine internals (initialised by initBase)
  declare $kind: DOKind;
  declare $m: Matrix;
  declare $srOk: boolean;
  declare $xs: number;
  declare $ys: number;
  declare $rot: number;
  declare $skew: number;
  declare $cx: ColorTransform | null;
  declare $visible: boolean;
  declare $filters: BitmapFilter[] | null;
  declare $fkey: string;
  declare $cab: boolean;
  declare $blend: string;
  declare $depth: number;
  declare $charId: number;
  declare $clipDepth: number;
  declare $ratio: number;
  declare $placeFrame: number;
  declare $timeline: boolean;
  declare $scriptXf: boolean;
  declare $ver: number;
  declare $removed: boolean;
  declare $fcache: unknown;
  declare $maskedBy: DisplayObject | null;
  declare $maskOf: DisplayObject | null;
  /** Owner for objects that are not in a MovieClip child list (button state children). */
  declare $owner: DisplayObject | null;

  get _x(): number { return this.$m.tx; }
  set _x(v: number) {
    const n = finite(v); if (n === undefined) return;
    this.$m.tx = twipsTrunc(n); this.$scriptXf = true; this.$invXf();
  }
  get _y(): number { return this.$m.ty; }
  set _y(v: number) {
    const n = finite(v); if (n === undefined) return;
    this.$m.ty = twipsTrunc(n); this.$scriptXf = true; this.$invXf();
  }
  get _xscale(): number { this.$cacheSR(); return this.$xs * 100; }
  set _xscale(v: number) { const n = finite(v); if (n !== undefined) this.$setScaleX(n / 100); }
  get _yscale(): number { this.$cacheSR(); return this.$ys * 100; }
  set _yscale(v: number) { const n = finite(v); if (n !== undefined) this.$setScaleY(n / 100); }
  get _rotation(): number { this.$cacheSR(); return (this.$rot * 180) / Math.PI; }
  set _rotation(v: number) {
    let n = finite(v); if (n === undefined) return;
    n %= 360;
    if (n < -180) n += 360; else if (n > 180) n -= 360;
    this.$setRotation((n * Math.PI) / 180);
  }
  get _alpha(): number { return this.$cx ? this.$cx.alphaMultiplier * 100 : 100; }
  set _alpha(v: number) {
    const n = finite(v); if (n === undefined) return;
    const cx = this.$cx ?? new ColorTransform();
    cx.alphaMultiplier = fixed8(n / 100);
    this.$cx = cx.isIdentity() ? null : cx;
    this.$scriptXf = true;
    this.$invXf();
  }
  get _visible(): boolean { return this.$visible; }
  set _visible(v: boolean) {
    const b = asBool(v);
    if (b !== this.$visible) { this.$visible = b; this.$invXf(); }
  }
  /** Width/height of the transformed bounds in the parent's space; setting rescales. */
  get _width(): number { const b = this.$boundsWith(this.$m); return b ? twips(b.xMax - b.xMin) : 0; }
  set _width(v: number) {
    const n = finite(v); if (n === undefined) return;
    this.$setSize(n, true);
  }
  get _height(): number { const b = this.$boundsWith(this.$m); return b ? twips(b.yMax - b.yMin) : 0; }
  set _height(v: number) {
    const n = finite(v); if (n === undefined) return;
    this.$setSize(n, false);
  }
  get _xmouse(): number { return apply(invert(this.$concat()), engine.mouseX, engine.mouseY)[0]; }
  get _ymouse(): number { return apply(invert(this.$concat()), engine.mouseX, engine.mouseY)[1]; }
  get _target(): string {
    const parts: string[] = [];
    for (let x: DisplayObject | undefined = this; x && x._parent; x = x._parent) parts.unshift(x._name);
    return '/' + parts.join('/');
  }
  get _url(): string { return ''; }
  get _quality(): string { return engine.quality; }
  set _quality(v: string) {
    const q = String(v).toUpperCase();
    if (q === 'LOW' || q === 'MEDIUM' || q === 'HIGH' || q === 'BEST' || q === 'AUTOHIGH' || q === 'AUTOLOW') engine.quality = q;
  }
  get _highquality(): number { return engine.quality === 'LOW' ? 0 : engine.quality === 'BEST' ? 2 : 1; }
  set _highquality(v: number) { const n = toNumber(v); engine.quality = n <= 0 ? 'LOW' : n >= 2 ? 'BEST' : 'HIGH'; }
  /** Getter returns COPIES of the filters (Flash semantics); setter copies the array. */
  get filters(): BitmapFilter[] { return this.$filters ? this.$filters.map((f) => f.clone()) : []; }
  set filters(v: BitmapFilter[]) {
    const arr = Array.isArray(v) ? v.filter((f): f is BitmapFilter => f instanceof BitmapFilter).map((f) => f.clone()) : [];
    this.$setFilters(arr);
  }
  get cacheAsBitmap(): boolean { return this.$cab; }
  set cacheAsBitmap(v: boolean) { this.$cab = asBool(v); this.$invXf(); }
  get blendMode(): string | number { return this.$blend; }
  set blendMode(v: string | number) {
    if (typeof v === 'number') this.$blend = BLEND_NAMES[v] ?? 'normal';
    else if (typeof v === 'string' && BLEND_NAMES.includes(v)) this.$blend = v;
    this.$invXf();
  }
  /** `mc.transform.matrix = m` / `mc.transform.colorTransform = cx` (flash.geom.Transform semantics: copies). */
  get transform(): { matrix: Matrix; colorTransform: ColorTransform } { return new Transform(this); }
  set transform(t: { matrix: Matrix; colorTransform: ColorTransform }) {
    if (!t || typeof t !== 'object') return;
    const tr = new Transform(this);
    tr.matrix = t.matrix;
    tr.colorTransform = t.colorTransform;
  }

  getDepth(): number { return this.$depth; }
  swapDepths(target: number | DisplayObject): void {
    const p = this._parent;
    if (!p) return;
    let depth: number;
    if (target instanceof DisplayObject) {
      if (target._parent !== p) return;
      depth = target.$depth;
    } else {
      const n = toNumber(target);
      if (!Number.isFinite(n)) return;
      depth = Math.trunc(n);
    }
    swapChildDepth(p, this, depth);
  }
  /** Bounds of this object in `targetSpace` coordinates (Flash rules: transformed tag bounds, recursive AABB). */
  getBounds(targetSpace?: DisplayObject): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const b = this.$boundsWith(null);
    if (!b) return { xMin: INVALID_BOUNDS, xMax: INVALID_BOUNDS, yMin: INVALID_BOUNDS, yMax: INVALID_BOUNDS };
    let out = b;
    if (targetSpace instanceof DisplayObject && targetSpace !== this) {
      const m = mul(invert(targetSpace.$concat()), this.$concat());
      out = transformBounds(m, b);
    }
    return { xMin: twips(out.xMin), xMax: twips(out.xMax), yMin: twips(out.yMin), yMax: twips(out.yMax) };
  }
  /** AS3-style alias used by some engine code. */
  getRect(targetSpace?: DisplayObject): { xMin: number; xMax: number; yMin: number; yMax: number } { return this.getBounds(targetSpace); }
  /**
   * [ORACLE P8] localToGlobal / globalToLocal act on the clip found through the TARGET PATH of `this`: when siblings
   * share an instance name, every one of them converts like the FIRST (lowest depth) of them. Measured on the room
   * markers: rooms 10/14/15/17 hold several devil markers all named "_DevilInit"; in Flash every one reports the
   * position of the first (CWorld_Init.GetPosition -> mc.localToGlobal), while getDepth() reports its own depth — so
   * all devils of those rooms spawn at one point. (Only these two natives are known to resolve by path.)
   */
  localToGlobal(pt: Point | { x: number; y: number }): void {
    if (!pt || typeof pt !== 'object') return;
    const [x, y] = apply(this.$byPath().$concat(), Number(pt.x), Number(pt.y));
    pt.x = x; pt.y = y;
  }
  globalToLocal(pt: Point | { x: number; y: number }): void {
    if (!pt || typeof pt !== 'object') return;
    const [x, y] = apply(invert(this.$byPath().$concat()), Number(pt.x), Number(pt.y));
    pt.x = x; pt.y = y;
  }
  hitTest(xOrTarget: number | DisplayObject, y?: number, shapeFlag?: boolean): boolean {
    if (xOrTarget instanceof DisplayObject) {
      const a = this.$boundsWith(this.$concat());
      const b = xOrTarget.$boundsWith(xOrTarget.$concat());
      if (!a || !b) return false;
      return a.xMin <= b.xMax && b.xMin <= a.xMax && a.yMin <= b.yMax && b.yMin <= a.yMax;
    }
    const gx = toNumber(xOrTarget), gy = toNumber(y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return false;
    if (asBool(shapeFlag)) return this.$hitGlobal(gx, gy, false);
    const b = this.$boundsWith(this.$concat());
    return !!b && gx >= b.xMin && gx <= b.xMax && gy >= b.yMin && gy <= b.yMax;
  }

  // IDrawable
  renderContent(ctx: CanvasRenderingContext2D, cx: ColorTransform | null, deviceScale: number): void {
    renderContentOf(this, ctx, cx, deviceScale);
  }
  contentBounds(): Rectangle {
    const b = this.$boundsWith(null);
    return b ? new Rectangle(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin) : new Rectangle(0, 0, 0, 0);
  }

  toString(): string {
    const parts: string[] = [];
    for (let x: DisplayObject | undefined = this; x && x._parent; x = x._parent) parts.unshift(x._name);
    return parts.length ? '_level0.' + parts.join('.') : '_level0';
  }

  // ------------------------------------------------------------------ engine internals

  /** Content changed (graphics, children, text, frame...): bump the version of this object and its ancestors. */
  $inv(): void {
    let x: DisplayObject | null | undefined = this;
    while (x) { x.$ver++; x = x._parent ?? x.$owner; }
  }
  /**
   * Own transform / color transform / visibility / filters changed: only the ancestors' content changes. Keeps this
   * object's filter cache valid (e.g. fading a filtered clip with _alpha re-uses the filtered bitmap).
   */
  $invXf(): void {
    let x: DisplayObject | null | undefined = this._parent ?? this.$owner;
    while (x) { x.$ver++; x = x._parent ?? x.$owner; }
  }
  /** The object this one's target path resolves to (first child of that name, at every level) [ORACLE P8]. */
  $byPath(): DisplayObject {
    const p = this._parent;
    if (!p || !this._name || this.$removed) return this;
    const rp = p.$byPath();
    const list = rp instanceof MovieClip ? rp.$list : p.$list;
    for (const c of list) if (c._name === this._name) return c;
    return this;
  }
  /** Local -> global (stage) matrix. */
  $concat(): M6 {
    let m: M6 = this.$m;
    for (let p = this._parent ?? (this.$owner as DisplayObject | null); p; p = p._parent ?? (p.$owner as DisplayObject | null)) m = mul(p.$m, m);
    return m;
  }
  $cacheSR(): void {
    if (this.$srOk) return;
    const { a, b, c, d } = this.$m;
    this.$rot = Math.atan2(b, a);
    this.$skew = Math.atan2(-c, d) - this.$rot;
    this.$xs = Math.sqrt(a * a + b * b);
    this.$ys = Math.sqrt(c * c + d * d);
    this.$srOk = true;
  }
  $setScaleX(s: number): void {
    this.$cacheSR();
    this.$xs = s;
    this.$m.a = Math.cos(this.$rot) * s;
    this.$m.b = Math.sin(this.$rot) * s;
    this.$scriptXf = true;
    this.$invXf();
  }
  $setScaleY(s: number): void {
    this.$cacheSR();
    this.$ys = s;
    this.$m.c = -Math.sin(this.$rot + this.$skew) * s;
    this.$m.d = Math.cos(this.$rot + this.$skew) * s;
    this.$scriptXf = true;
    this.$invXf();
  }
  $setRotation(rad: number): void {
    this.$cacheSR();
    this.$rot = rad;
    const m = this.$m;
    m.a = this.$xs * Math.cos(rad);
    m.b = this.$xs * Math.sin(rad);
    m.c = this.$ys * -Math.sin(rad + this.$skew);
    m.d = this.$ys * Math.cos(rad + this.$skew);
    this.$scriptXf = true;
    this.$invXf();
  }
  /** Ruffle's reverse-engineered _width/_height setter. */
  $setSize(value: number, isWidth: boolean): void {
    const b = this.$boundsWith(null);
    const w = b ? b.xMax - b.xMin : 0, h = b ? b.yMax - b.yMin : 0;
    this.$cacheSR();
    const rot = this.$rot;
    const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
    const prevX = this.$xs, prevY = this.$ys;
    if (isWidth) {
      const ar = h / w;
      const tx = w !== 0 ? value / w : 0, ty = w !== 0 ? value / h : 0;
      const nx = ar * (cos * tx + sin * ty) / ((cos + ar * sin) * (ar * cos + sin));
      const ny = (sin * prevX + ar * cos * prevY) / (ar * cos + sin);
      this.$setScaleX(Number.isFinite(nx) ? nx : 0);
      this.$setScaleY(Number.isFinite(ny) ? ny : prevY);
    } else {
      const ar = w / h;
      const tx = h !== 0 ? value / w : 0, ty = h !== 0 ? value / h : 0;
      const nx = (ar * cos * prevX + sin * prevY) / (ar * cos + sin);
      const ny = ar * (sin * tx + cos * ty) / ((cos + ar * sin) * (ar * cos + sin));
      this.$setScaleX(Number.isFinite(nx) ? nx : prevX);
      this.$setScaleY(Number.isFinite(ny) ? ny : 0);
    }
  }
  $setFilters(arr: BitmapFilter[] | null): void {
    this.$filters = arr && arr.length ? arr : null;
    this.$fkey = this.$filters ? filtersKey(this.$filters) : '';
    this.$invXf();
  }
  /** Own content bounds (no children), local space; null = nothing. */
  $selfBounds(): Bounds | null { return null; }
  /** Children taking part in bounds/hit/render (MovieClip list or button state children). */
  $kids(): readonly DisplayObject[] | null { return null; }
  /** Bounds of content (self + children) transformed by m (null = local space). Ruffle bounds_with_transform. */
  $boundsWith(m: M6 | null): Bounds | null {
    const s = this.$selfBounds();
    let out: Bounds | null = s ? (m ? transformBounds(m, s) : { ...s }) : null;
    const kids = this.$kids();
    if (kids) {
      for (const k of kids) {
        const km = m ? mul(m, k.$m) : k.$m;
        out = unionBounds(out, k.$boundsWith(km));
      }
    }
    return out;
  }
  /** Shape hit test with a point in this object's local space. */
  $hitLocal(x: number, y: number, mouse: boolean): boolean {
    void mouse;
    const b = this.$selfBounds();
    return !!b && x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax;
  }
  /** Shape hit test with a global (stage) point. */
  $hitGlobal(gx: number, gy: number, mouse: boolean): boolean {
    const [x, y] = apply(invert(this.$concat()), gx, gy);
    if (this.$maskedBy && !this.$maskedBy.$hitGlobal(gx, gy, false)) return false;
    return this.$hitLocal(x, y, mouse);
  }
}

// ==================================================================================================== MovieClip

interface DrawCall { f: string; a: unknown[] }

export class MovieClip extends DisplayObject {
  declare $def: SpriteDef | null;
  /** Sprite id used for frame scripts (0 = root, -1 = no timeline). */
  declare $spriteId: number;
  declare $list: DisplayObject[];
  declare $frame: number;
  declare $total: number;
  declare $playing: boolean;
  declare $tl: TimelineState;
  declare $g: Graphics | null;
  declare $gcalls: DrawCall[] | null;
  declare enabled: boolean;
  declare useHandCursor: boolean;
  declare hitArea: DisplayObject | undefined;

  /** Ported AS2 constructor body. Base implementation does nothing. */
  ctor(): void {}

  get _currentframe(): number { return this.$frame; }
  get _totalframes(): number { return this.$total; }
  get _framesloaded(): number { return this.$total; }

  play(): void { this.$playing = true; }
  stop(): void { this.$playing = false; }
  nextFrame(): void {
    this.$playing = false;
    if (this.$frame < this.$total) this.$gotoFrame(this.$frame + 1);
  }
  prevFrame(): void {
    this.$playing = false;
    if (this.$frame > 1) this.$gotoFrame(this.$frame - 1);
  }
  /** frame: 1-based number or label. */
  gotoAndStop(frame: number | string): void {
    const n = resolveFrame(this.$def, frame, this.$total);
    this.$playing = false;
    if (n !== null) this.$gotoFrame(n);
  }
  gotoAndPlay(frame: number | string): void {
    const n = resolveFrame(this.$def, frame, this.$total);
    this.$playing = true;
    if (n !== null) this.$gotoFrame(n);
  }

  /** Attach a library symbol by linkage name. Returns undefined if the linkage is not exported (Flash semantics). */
  attachMovie(linkage: string, name: string, depth: number, initObject?: Record<string, any>): MovieClip | undefined {
    if (!engine.library) return undefined;
    const id = engine.library.charIdForLinkage(String(linkage));
    if (id === undefined) return undefined;
    const def = engine.library.char(id);
    if (!def || def.t !== 'sprite') return undefined;
    const o = createInstance(id) as MovieClip;
    constructObject(this, o, String(name), toDepth(depth), null, initObject);
    return o;
  }
  createEmptyMovieClip(name: string, depth: number): MovieClip {
    const o = allocMovieClip(null, -1, undefined);
    constructObject(this, o, String(name), toDepth(depth), null, undefined);
    return o;
  }
  duplicateMovieClip(name: string, depth: number, initObject?: Record<string, any>): MovieClip | undefined {
    const p = this._parent;
    if (!p) return undefined;
    const o = (this.$charId >= 0 && this.$def ? createInstance(this.$charId) : allocMovieClip(null, -1, undefined)) as MovieClip;
    o.$m = this.$m.clone();
    o.$srOk = false;
    o.$cx = this.$cx ? this.$cx.clone() : null;
    if (this.$gcalls) for (const call of this.$gcalls) (o as any)[call.f](...call.a);
    constructObject(p, o, String(name), toDepth(depth), null, initObject);
    return o;
  }
  createTextField(name: string, depth: number, x: number, y: number, width: number, height: number): TextField {
    const tf = allocTextField(null);
    tf.$rect = { x: 0, y: 0, w: Math.max(0, toNumber(width) || 0), h: Math.max(0, toNumber(height) || 0) };
    tf.$m.tx = twipsTrunc(toNumber(x) || 0);
    tf.$m.ty = twipsTrunc(toNumber(y) || 0);
    constructObject(this, tf, String(name), toDepth(depth), null, undefined);
    return tf;
  }
  removeMovieClip(): void {
    const p = this._parent;
    if (!p || this.$depth < 0) return;
    removeChildObj(p, this);
  }
  attachBitmap(bmd: BitmapData, depth: number, pixelSnapping?: string, smoothing?: boolean): void {
    if (!bmd || typeof bmd !== 'object') return;
    const b = Object.create(Bitmap.prototype) as Bitmap;
    initBase(b, 'bitmap');
    b.$bmd = bmd;
    b.$snap = pixelSnapping === 'always' || pixelSnapping === 'never' ? pixelSnapping : 'auto';
    b.$smooth = asBool(smoothing);
    b._name = '';
    insertChild(this, b, toDepth(depth));
  }
  getNextHighestDepth(): number {
    const l = this.$list;
    const top = l.length ? l[l.length - 1]!.$depth : -1;
    return Math.max(top + 1, 0);
  }
  getInstanceAtDepth(depth: number): DisplayObject | undefined { return childAtDepth(this, toDepth(depth)); }
  setMask(mc: MovieClip | null): void {
    if (this.$maskedBy) this.$maskedBy.$maskOf = null;
    this.$maskedBy = mc instanceof DisplayObject ? mc : null;
    if (this.$maskedBy) this.$maskedBy.$maskOf = this;
    this.$inv();
  }

  // Drawing API (flash.display.Graphics on the clip). Rendered beneath children.
  clear(): void {
    if (this.$g) this.$g.clear();
    this.$gcalls = null;
    this.$inv();
  }
  lineStyle(thickness?: number, rgb?: number, alpha?: number, pixelHinting?: boolean, noScale?: string, capsStyle?: string,
    jointStyle?: string, miterLimit?: number): void {
    this.$draw('lineStyle', [thickness, rgb, alpha, pixelHinting, noScale, capsStyle, jointStyle, miterLimit]);
  }
  beginFill(rgb: number, alpha?: number): void { this.$draw('beginFill', [rgb, alpha]); }
  beginBitmapFill(bmp: BitmapData, matrix?: Matrix, repeat?: boolean, smoothing?: boolean): void {
    this.$draw('beginBitmapFill', [bmp, matrix ? (matrix as Matrix).clone?.() ?? matrix : matrix, repeat, smoothing]);
  }
  beginGradientFill(type: string, colors: number[], alphas: number[], ratios: number[], matrix: Matrix | object,
    spreadMethod?: string, interpolationMethod?: string, focalPointRatio?: number): void {
    this.$draw('beginGradientFill', [type, colors, alphas, ratios, matrix, spreadMethod, interpolationMethod, focalPointRatio]);
  }
  moveTo(x: number, y: number): void { this.$draw('moveTo', [x, y]); }
  lineTo(x: number, y: number): void { this.$draw('lineTo', [x, y]); }
  curveTo(cx: number, cy: number, ax: number, ay: number): void { this.$draw('curveTo', [cx, cy, ax, ay]); }
  endFill(): void { this.$draw('endFill', []); }

  // Misc AS2 MovieClip API used by frame scripts (no-ops in the remake).
  getBytesLoaded(): number { return 1; }
  getBytesTotal(): number { return 1; }
  getURL(_url?: string, _window?: string): void { /* scope: no external links */ }
  loadMovie(_url?: string): void { /* not supported */ }
  unloadMovie(): void { /* not supported */ }
  startDrag(): void { /* not used */ }
  stopDrag(): void { /* not used */ }

  // ------------------------------------------------------------------ engine internals

  $draw(f: string, a: unknown[]): void {
    const g = this.$g ?? (this.$g = new Graphics());
    (g as any)[f](...a);
    (this.$gcalls ?? (this.$gcalls = [])).push({ f, a });
    this.$inv();
  }
  override $selfBounds(): Bounds | null {
    const r = this.$g?.bounds();
    return r ? { xMin: r.x, yMin: r.y, xMax: r.x + r.width, yMax: r.y + r.height } : null;
  }
  override $kids(): readonly DisplayObject[] { return this.$list; }
  /** Button mode: any mouse handler defined (AVM1 rule). */
  $isButtonMode(): boolean {
    return this.onPress !== undefined || this.onRelease !== undefined || this.onReleaseOutside !== undefined ||
      this.onRollOver !== undefined || this.onRollOut !== undefined || this.onDragOver !== undefined || this.onDragOut !== undefined;
  }
  override $hitLocal(x: number, y: number, mouse: boolean): boolean {
    if (this.$g && this.$g.hitTest(x, y)) return true;
    return hitChildren(this.$list, x, y, mouse);
  }
  /** Advance one frame (enterFrame of a playing clip). */
  $advance(): void {
    if (this.$total <= 1 || !this.$def) return;
    this.$gotoFrame(this.$frame < this.$total ? this.$frame + 1 : 1);
  }
  /** Go to `target` (already resolved & clamped). Applies display-list ops, plays target-frame sounds, queues its script. */
  $gotoFrame(target: number): void {
    const def = this.$def;
    if (!def || target === this.$frame || this.$removed) return;
    const rewind = target < this.$frame;
    let st: TimelineState;
    if (rewind) st = replayFrames(def, new Map(), 1, target);
    else {
      for (const p of this.$tl.values()) p.touched = 0;
      st = replayFrames(def, this.$tl, this.$frame + 1, target);
    }
    this.$frame = target;
    const jobs: DisplayObject[] = [];
    reconcile(this, st, target, rewind, jobs);
    frameEntered(this, target);
    this.$inv();
    deferConstruction(jobs, 0); // [ORACLE P11] timeline-placed children: constructed per the calling context
  }
}
MovieClip.prototype.enabled = true;
MovieClip.prototype.useHandCursor = true;

// ==================================================================================================== TextField

type AutoSize = 'none' | 'left' | 'center' | 'right';
interface FontRes { font?: FontDef; css: string }

/** AS2 TextField (dynamic or input), created from DefineEditText or createTextField. Renders with embedded glyphs. */
export class TextField extends DisplayObject {
  declare $def: EditTextDef | null;
  declare $rect: { x: number; y: number; w: number; h: number };
  declare $spans: Span[];
  declare $fmt: TextFmt;
  declare $html: boolean;
  declare $multiline: boolean;
  declare $wordWrap: boolean;
  declare $embed: boolean;
  declare $password: boolean;
  declare $border: boolean;
  declare $borderColor: number;
  declare $background: boolean;
  declare $backgroundColor: number;
  declare $autoSize: AutoSize;
  declare $type: 'dynamic' | 'input';
  declare $selectable: boolean;
  declare $maxChars: number | null;
  declare $restrict: string | null;
  declare $tagFont: FontDef | undefined;
  declare $layoutCache: TextLayout | null;
  declare $fontCache: Map<string, FontRes>;
  declare variable: string;

  get text(): string { return spansText(this.$spans); }
  set text(v: string) {
    const s = normalizeNewlines(toAS2String(v));
    // identical result (same text, already in the new text format): nothing changes — keep render caches
    if (this.$spans.length === 1 && this.$spans[0]!.text === s && sameFmt(this.$spans[0]!.fmt, this.$fmt)) return;
    this.$spans = [{ text: s, fmt: { ...this.$fmt } }];
    this.$changed();
  }
  get htmlText(): string { return this.$html ? toHtml(this.$spans) : this.text; }
  set htmlText(v: string) {
    const s = v === undefined ? '' : String(v);
    if (this.$html) this.$spans = parseHtml(s, this.$fmt, this.$multiline);
    else this.$spans = [{ text: normalizeNewlines(s), fmt: { ...this.$fmt } }];
    this.$changed();
  }
  get html(): boolean { return this.$html; }
  set html(v: boolean) { this.$html = asBool(v); }
  get textColor(): number { return this.$spans[0]?.fmt.color ?? this.$fmt.color; }
  set textColor(v: number) {
    const c = (toNumber(v) >>> 0) & 0xffffff;
    if (this.$fmt.color === c && this.$spans.every((sp) => sp.fmt.color === c)) return;
    this.$fmt.color = c;
    for (const s of this.$spans) s.fmt.color = c;
    this.$spans = normalizeSpans(this.$spans, this.$fmt);
    this.$changed();
  }
  get selectable(): boolean { return this.$selectable; }
  set selectable(v: boolean) { this.$selectable = asBool(v); if (!this.$selectable && engine.focus === this) engine.focus = null; }
  /** 'dynamic' | 'input' */
  get type(): 'dynamic' | 'input' { return this.$type; }
  set type(v: 'dynamic' | 'input') { if (v === 'dynamic' || v === 'input') this.$type = v; }
  get maxChars(): number | null { return this.$maxChars; }
  set maxChars(v: number | null) { const n = finite(v); this.$maxChars = n === undefined || n <= 0 ? null : Math.trunc(n); }
  get restrict(): string | null { return this.$restrict; }
  set restrict(v: string | null) { this.$restrict = v === null || v === undefined ? null : String(v); }
  get autoSize(): boolean | string { return this.$autoSize; }
  set autoSize(v: boolean | string) {
    const s = v === true ? 'left' : v === false ? 'none' : String(v).toLowerCase();
    this.$autoSize = s === 'left' || s === 'center' || s === 'right' ? s : 'none';
    this.$changed();
  }
  get multiline(): boolean { return this.$multiline; }
  set multiline(v: boolean) { this.$multiline = asBool(v); this.$changed(); }
  get wordWrap(): boolean { return this.$wordWrap; }
  set wordWrap(v: boolean) { this.$wordWrap = asBool(v); this.$changed(); }
  get embedFonts(): boolean { return this.$embed; }
  set embedFonts(v: boolean) { this.$embed = asBool(v); this.$fontCache.clear(); this.$changed(); }
  get password(): boolean { return this.$password; }
  set password(v: boolean) { this.$password = asBool(v); this.$changed(); }
  get border(): boolean { return this.$border; }
  set border(v: boolean) { this.$border = asBool(v); this.$inv(); }
  get borderColor(): number { return this.$borderColor; }
  set borderColor(v: number) { this.$borderColor = (toNumber(v) >>> 0) & 0xffffff; this.$inv(); }
  get background(): boolean { return this.$background; }
  set background(v: boolean) { this.$background = asBool(v); this.$inv(); }
  get backgroundColor(): number { return this.$backgroundColor; }
  set backgroundColor(v: number) { this.$backgroundColor = (toNumber(v) >>> 0) & 0xffffff; this.$inv(); }
  get textWidth(): number { return this.$getLayout().textWidth; }
  get textHeight(): number { return this.$getLayout().textHeight; }
  get scroll(): number { return 1; }
  set scroll(_v: number) { /* single page */ }
  get maxscroll(): number { return 1; }
  get bottomScroll(): number { return this.$getLayout().lines.length; }
  get hscroll(): number { return 0; }
  set hscroll(_v: number) { /* no horizontal scroll */ }
  get maxhscroll(): number { return 0; }
  override get _width(): number { const b = this.$boundsWith(this.$m); return b ? twips(b.xMax - b.xMin) : 0; }
  override set _width(v: number) {
    const n = finite(v); if (n === undefined) return;
    this.$rect = { ...this.$rect, w: Math.max(0, n) };
    this.$changed();
  }
  override get _height(): number { const b = this.$boundsWith(this.$m); return b ? twips(b.yMax - b.yMin) : 0; }
  override set _height(v: number) {
    const n = finite(v); if (n === undefined) return;
    this.$rect = { ...this.$rect, h: Math.max(0, n) };
    this.$changed();
  }

  setTextFormat(a?: number | TextFormat, b?: number | TextFormat, c?: TextFormat): void {
    let begin = 0, end = this.text.length, tf: TextFormat | undefined;
    if (a instanceof TextFormat || (a && typeof a === 'object')) tf = a as TextFormat;
    else if (b instanceof TextFormat || (b && typeof b === 'object')) { begin = toNumber(a); end = begin + 1; tf = b as TextFormat; }
    else if (c && typeof c === 'object') { begin = toNumber(a); end = toNumber(b); tf = c; }
    if (!tf || !Number.isFinite(begin) || !Number.isFinite(end)) return;
    this.$spans = applyFormat(this.$spans, begin, end, fmtFromTextFormat(tf));
    this.$changed();
  }
  getTextFormat(beginIndex?: number, endIndex?: number): TextFormat {
    const len = this.text.length;
    let begin = 0, end = len;
    if (beginIndex !== undefined) {
      begin = toNumber(beginIndex);
      end = endIndex !== undefined ? toNumber(endIndex) : begin + 1;
    }
    return textFormatFrom(commonFormat(this.$spans, begin, end, this.$fmt));
  }
  setNewTextFormat(tf: TextFormat): void {
    if (!tf || typeof tf !== 'object') return;
    Object.assign(this.$fmt, fmtFromTextFormat(tf));
    this.$fontCache.clear();
  }
  getNewTextFormat(): TextFormat { return textFormatFrom(this.$fmt); }
  replaceSel(s: string): void {
    if (engine.focus !== this) return;
    this.$insert(String(s));
  }
  replaceText(begin: number, end: number, s: string): void {
    this.$spans = replaceRange(this.$spans, toNumber(begin), toNumber(end), String(s));
    this.$changed();
  }
  get length(): number { return this.text.length; }

  // ------------------------------------------------------------------ engine internals

  override $selfBounds(): Bounds | null {
    if (this.$autoSize !== 'none') this.$getLayout();
    const r = this.$rect;
    return { xMin: r.x, yMin: r.y, xMax: r.x + r.w, yMax: r.y + r.h };
  }
  $changed(): void {
    this.$layoutCache = null;
    if (engine.focus === this) engine.caretIndex = Math.min(engine.caretIndex, this.text.length);
    this.$inv();
  }
  /** Font used for a format: embedded glyphs (when embedFonts and available) or a CSS device font. */
  $font(fmt: TextFmt): FontRes {
    const key = `${fmt.font}|${fmt.bold ? 1 : 0}|${fmt.italic ? 1 : 0}`;
    let r = this.$fontCache.get(key);
    if (!r) {
      let font: FontDef | undefined;
      if (this.$embed && engine.library) {
        font = engine.library.findFont(fmt.font, fmt.bold, fmt.italic);
        if (!font && this.$tagFont && this.$tagFont.ascent !== undefined) font = this.$tagFont;
      }
      const fam = fmt.font.replace(/"/g, '');
      const css = `${fmt.italic ? 'italic ' : ''}${fmt.bold ? 'bold ' : ''}SIZEpx "${fam}", "Trebuchet MS", Arial, sans-serif`;
      r = { font, css };
      this.$fontCache.set(key, r);
    }
    return r;
  }
  $env(): TextEnv {
    const L = engine.library;
    return {
      advance: (fmt, code) => {
        const r = this.$font(fmt);
        if (r.font && L) {
          const i = L.fontCodeMap(r.font).get(code);
          return i === undefined ? 0 : (r.font.glyphs[i]!.adv * fmt.size) / 1024;
        }
        return measureDevice(r.css, fmt.size, code);
      },
      kern: (fmt, c1, c2) => {
        const r = this.$font(fmt);
        return r.font && L ? (L.kerning(r.font, c1, c2) * fmt.size) / 1024 : 0;
      },
      metrics: (fmt) => {
        const r = this.$font(fmt);
        if (r.font && r.font.ascent !== undefined) {
          return { ascent: (r.font.ascent * fmt.size) / 1024, descent: ((r.font.descent ?? 0) * fmt.size) / 1024 };
        }
        return { ascent: fmt.size * 0.9, descent: fmt.size * 0.22 };
      },
    };
  }
  /** Spans as displayed (password masking). */
  $displaySpans(): Span[] {
    if (!this.$password) return this.$spans;
    return this.$spans.map((s) => ({ text: s.text.replace(/[^\r\n]/g, '*'), fmt: s.fmt }));
  }
  $getLayout(): TextLayout {
    if (this.$layoutCache) return this.$layoutCache;
    const opt = { width: this.$rect.w, wordWrap: this.$wordWrap, multiline: this.$multiline };
    let lay = layoutText(this.$displaySpans(), this.$env(), opt);
    if (this.$autoSize !== 'none') {
      const r = this.$rect;
      const nh = lay.textHeight + 4;
      if (!this.$wordWrap) {
        const nw = lay.textWidth + 4;
        let nx = r.x;
        if (this.$autoSize === 'center') nx = r.x + (r.w - nw) / 2;
        else if (this.$autoSize === 'right') nx = r.x + r.w - nw;
        this.$rect = { x: nx, y: r.y, w: nw, h: nh };
        lay = layoutText(this.$displaySpans(), this.$env(), { ...opt, width: nw });
      } else {
        this.$rect = { x: r.x, y: r.y, w: r.w, h: nh };
      }
    }
    this.$layoutCache = lay;
    return lay;
  }
  /** Caret index for a local point. */
  $indexAt(x: number, y: number): number {
    const lay = this.$getLayout();
    const lx = x - this.$rect.x - 2, ly = y - this.$rect.y - 2;
    if (lay.lines.length === 0) return 0;
    let line = lay.lines[lay.lines.length - 1]!;
    for (const l of lay.lines) if (ly < l.top + l.ascent + l.descent + l.leading) { line = l; break; }
    return caretIndexAt(line, lx);
  }
  /** Insert typed text at the caret (respects maxChars / restrict). */
  $insert(s: string): void {
    let txt = '';
    for (const ch of s) if (restrictAllows(this.$restrict, ch)) txt += ch;
    if (!this.$multiline) txt = txt.replace(/[\r\n]/g, '');
    const cur = this.text;
    if (this.$maxChars !== null) txt = txt.slice(0, Math.max(0, this.$maxChars - cur.length));
    if (!txt) return;
    const at = Math.min(engine.caretIndex, cur.length);
    const fmt = at > 0 ? (commonFormat(this.$spans, at - 1, at, this.$fmt) as TextFmt) : (cur.length ? (commonFormat(this.$spans, 0, 1, this.$fmt) as TextFmt) : { ...this.$fmt });
    this.$spans = replaceRange(this.$spans, at, at, txt, { ...this.$fmt, ...fmt });
    engine.caretIndex = at + txt.length;
    this.$changed();
  }
  $deleteRange(begin: number, end: number): void {
    if (end <= begin) return;
    this.$spans = replaceRange(this.$spans, begin, end, '', this.$spans[0]?.fmt);
    engine.caretIndex = begin;
    this.$changed();
  }
  override $hitLocal(x: number, y: number): boolean {
    const r = this.$rect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }
}

/** AS2 Button instance (DefineButton2). Exposes the same mouse handlers as MovieClip. */
export class Button extends DisplayObject {
  declare enabled: boolean;
  declare useHandCursor: boolean;
  declare $def: ButtonDef;
  declare $state: 'up' | 'over' | 'down';
  declare $stateKids: Map<ButtonRecord, DisplayObject>;
  declare $current: DisplayObject[];
  declare $hitKids: DisplayObject[] | null;

  override $kids(): readonly DisplayObject[] { return this.$current; }
  override $hitLocal(x: number, y: number): boolean {
    if (!this.$hitKids) {
      this.$hitKids = [];
      for (const r of this.$def.records) {
        if (!r.hit) continue;
        const o = buttonRecordInstance(this, r);
        if (o) this.$hitKids.push(o);
      }
    }
    return hitChildren(this.$hitKids, x, y, false);
  }
  /** Switch the displayed state ('up' | 'over' | 'down'). */
  $setState(s: 'up' | 'over' | 'down'): void {
    if (s === this.$state && this.$current.length) return;
    this.$state = s;
    const list: DisplayObject[] = [];
    for (const r of this.$def.records) {
      if (!r[s]) continue;
      const o = buttonRecordInstance(this, r);
      if (o) list.push(o);
    }
    list.sort((a, b) => a.$depth - b.$depth);
    this.$current = list;
    this.$inv();
  }
}
Button.prototype.enabled = true;
Button.prototype.useHandCursor = true;

// ==================================================================================================== leaf objects

/** DefineShape instance. */
export class Shape extends DisplayObject {
  declare $def: ShapeDef;
  override $selfBounds(): Bounds | null { return { ...this.$def.bounds }; }
  override $hitLocal(x: number, y: number): boolean {
    const b = this.$def.bounds;
    if (x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax) return false;
    const L = lib();
    for (const layer of this.$def.layers) {
      for (const f of layer.fills) {
        const st = layer.fillStyles[f.s];
        if (st && st.t === 'bitmap' && !L.bitmap(st.bitmapId) && st.bitmapId === 65535) continue;
        if (hitConfig.pointInFill(L.polys(f), x, y, true)) return true;
      }
      for (const s of layer.strokes) {
        const ls = layer.lineStyles[s.s];
        const r = Math.max(0.5, (ls?.w ?? 0) / 2);
        if (hitConfig.pointOnStroke(L.polys(s), x, y, r)) return true;
      }
    }
    return false;
  }
}

/** DefineMorphShape instance (ratio from PlaceObject). */
export class MorphShape extends DisplayObject {
  declare $def: MorphDef;
  override $selfBounds(): Bounds | null {
    const t = this.$ratio / 65535, a = this.$def.startBounds, b = this.$def.endBounds;
    return {
      xMin: a.xMin + (b.xMin - a.xMin) * t, yMin: a.yMin + (b.yMin - a.yMin) * t,
      xMax: a.xMax + (b.xMax - a.xMax) * t, yMax: a.yMax + (b.yMax - a.yMax) * t,
    };
  }
  override $hitLocal(x: number, y: number): boolean {
    const b = this.$selfBounds()!;
    if (x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax) return false;
    const fr = lib().morphFrame(this.$def, this.$ratio);
    if (!fr.polys) fr.polys = fr.layers.map((l) => l.fills.map((c) => flatten(c)));
    for (const layer of fr.polys) for (const p of layer) if (hitConfig.pointInFill(p, x, y, true)) return true;
    return false;
  }
}

/** DefineText instance. */
export class StaticText extends DisplayObject {
  declare $def: StaticTextDef;
  override $selfBounds(): Bounds | null { return { ...this.$def.bounds }; }
}

/** attachBitmap() child. */
export class Bitmap extends DisplayObject {
  declare $bmd: BitmapData;
  declare $snap: 'auto' | 'always' | 'never';
  declare $smooth: boolean;
  override $selfBounds(): Bounds | null {
    const w = this.$bmd.width, h = this.$bmd.height;
    return w > 0 && h > 0 ? { xMin: 0, yMin: 0, xMax: w, yMax: h } : null;
  }
}

// ==================================================================================================== construction

function initBase(o: DisplayObject, kind: DOKind): void {
  o.$kind = kind;
  o.$m = new Matrix();
  o.$srOk = true;
  o.$xs = 1;
  o.$ys = 1;
  o.$rot = 0;
  o.$skew = 0;
  o.$cx = null;
  o.$visible = true;
  o.$filters = null;
  o.$fkey = '';
  o.$cab = false;
  o.$blend = 'normal';
  o.$depth = 0;
  o.$charId = -1;
  o.$clipDepth = 0;
  o.$ratio = 0;
  o.$placeFrame = 0;
  o.$timeline = false;
  o.$scriptXf = false;
  o.$ver = 0;
  o.$removed = false;
  o.$fcache = null;
  o.$maskedBy = null;
  o.$maskOf = null;
  o.$owner = null;
  o._name = '';
  o._parent = undefined;
}

/** Allocate (not construct) a MovieClip for a sprite (or an empty clip when def is null). */
export function allocMovieClip(def: SpriteDef | null, charId: number, cls: { prototype: MovieClip } | undefined): MovieClip {
  const mc = Object.create((cls ?? MovieClip).prototype) as MovieClip;
  initBase(mc, 'mc');
  mc.$charId = charId;
  mc.$def = def;
  mc.$spriteId = def ? charId : -1;
  mc.$list = [];
  mc.$frame = 1;
  mc.$total = def ? Math.max(1, def.frameCount) : 1;
  mc.$playing = true;
  mc.$tl = new Map();
  mc.$g = null;
  mc.$gcalls = null;
  return mc;
}

function allocTextField(def: EditTextDef | null): TextField {
  const tf = Object.create(TextField.prototype) as TextField;
  initBase(tf, 'edit');
  tf.$def = def;
  tf.$fontCache = new Map();
  tf.$layoutCache = null;
  tf.variable = '';
  const fmt = defaultFmt();
  if (def) {
    const L = engine.library;
    const font = def.fontId !== undefined && L ? L.font(def.fontId) : undefined;
    tf.$tagFont = font;
    if (font) { fmt.font = font.name; fmt.bold = font.bold; fmt.italic = font.italic; }
    else if (def.fontClass) fmt.font = def.fontClass;
    if (def.height !== undefined) fmt.size = def.height;
    if (def.color) fmt.color = (def.color[0] << 16) | (def.color[1] << 8) | def.color[2];
    const aligns: Align[] = ['left', 'right', 'center', 'justify'];
    fmt.align = aligns[def.align ?? 0] ?? 'left';
    fmt.leftMargin = def.leftMargin ?? 0;
    fmt.rightMargin = def.rightMargin ?? 0;
    fmt.indent = def.indent ?? 0;
    fmt.leading = def.leading ?? 0;
    tf.$rect = { x: def.bounds.xMin, y: def.bounds.yMin, w: def.bounds.xMax - def.bounds.xMin, h: def.bounds.yMax - def.bounds.yMin };
    tf.$html = def.html;
    tf.$multiline = def.multiline;
    tf.$wordWrap = def.wordWrap;
    tf.$embed = def.useOutlines;
    tf.$password = def.password;
    tf.$border = def.border;
    tf.$autoSize = def.autoSize ? 'left' : 'none';
    tf.$type = def.readOnly ? 'dynamic' : 'input';
    tf.$selectable = !def.noSelect;
    tf.$maxChars = def.maxLength && def.maxLength > 0 ? def.maxLength : null;
    tf.variable = def.varName ?? '';
  } else {
    tf.$tagFont = undefined;
    tf.$rect = { x: 0, y: 0, w: 100, h: 100 };
    tf.$html = false;
    tf.$multiline = false;
    tf.$wordWrap = false;
    tf.$embed = false;
    tf.$password = false;
    tf.$border = false;
    tf.$autoSize = 'none';
    tf.$type = 'dynamic';
    tf.$selectable = true;
    tf.$maxChars = null;
  }
  tf.$borderColor = 0;
  tf.$background = !!def?.border; // DefineEditText HasBorder = black border on a white background
  tf.$backgroundColor = 0xffffff;
  tf.$restrict = null;
  tf.$fmt = fmt;
  const init = def?.initialText ?? '';
  tf.$spans = def?.html ? parseHtml(init, fmt, def.multiline) : [{ text: normalizeNewlines(init), fmt: { ...fmt } }];
  return tf;
}

function allocButton(def: ButtonDef): Button {
  const b = Object.create(Button.prototype) as Button;
  initBase(b, 'button');
  b.$def = def;
  b.$state = 'up';
  b.$stateKids = new Map();
  b.$current = [];
  b.$hitKids = null;
  return b;
}

/** Allocate an instance of a library character (not yet constructed). */
export function createInstance(charId: number): DisplayObject | undefined {
  const L = lib();
  const def = L.char(charId);
  if (!def) return undefined;
  let o: DisplayObject;
  switch (def.t) {
    case 'sprite':
      o = allocMovieClip(def, charId, L.classForChar(charId));
      break;
    case 'shape': {
      const s = Object.create(Shape.prototype) as Shape;
      initBase(s, 'shape');
      s.$def = def;
      o = s;
      break;
    }
    case 'morph': {
      const s = Object.create(MorphShape.prototype) as MorphShape;
      initBase(s, 'morph');
      s.$def = def;
      o = s;
      break;
    }
    case 'text': {
      const s = Object.create(StaticText.prototype) as StaticText;
      initBase(s, 'text');
      s.$def = def;
      o = s;
      break;
    }
    case 'edit':
      o = allocTextField(def);
      break;
    case 'button':
      o = allocButton(def);
      break;
    default:
      return undefined;
  }
  o.$charId = charId;
  return o;
}

function applyPlacement(o: DisplayObject, p: PlacementState, isNew: boolean): void {
  const t = isNew ? 0xffff : p.touched;
  const xf = isNew || !o.$scriptXf;
  if (p.m && (t & T_MATRIX) && xf) {
    o.$m = new Matrix(p.m.a, p.m.b, p.m.c, p.m.d, p.m.tx, p.m.ty);
    o.$srOk = false;
  }
  if (p.cx && (t & T_CX) && xf) o.$cx = cxFromRecord(p.cx);
  if (p.ratio !== undefined && (t & T_RATIO) && o.$ratio !== p.ratio) { o.$ratio = p.ratio; o.$inv(); }
  if (p.filters && (t & T_FILTERS)) o.$setFilters(filtersFromRecords(p.filters));
  if (isNew && p.clipDepth) o.$clipDepth = p.clipDepth;
  if (p.blend !== undefined && (t & T_BLEND)) o.$blend = BLEND_NAMES[p.blend] ?? 'normal';
  if (p.cacheAsBitmap !== undefined && (t & T_CACHE)) o.$cab = p.cacheAsBitmap;
  o.$invXf();
}

/**
 * Construct an allocated object as a child of `parent` at `depth` (attachMovie, duplicateMovieClip,
 * createEmptyMovieClip, createTextField): insert (replacing the occupant) -> build the tree (buildTree) -> the
 * object's own ctor() NOW (parent first) -> the constructors of everything its timeline placed are deferred per the
 * calling context (frame script / no script: before this returns; constructor: after it; event handler: after the
 * handler) [ORACLE P11]. The whole construction counts as one script (queue drained at the end when called from
 * outside any script).
 */
export function constructObject(parent: MovieClip, o: DisplayObject, name: string, depth: number,
  place: PlacementState | null, init: Record<string, any> | undefined): void {
  engine.scriptDepth++;
  try {
    o._name = name;
    insertChild(parent, o, depth);
    const jobs: DisplayObject[] = [];
    buildTree(o, place, init, jobs);
    // jobs[0] === o. The descendants were queued at build time, before the attached clip's own constructor runs.
    for (let i = 1; i < jobs.length; i++) engine.pendingCtors.push(jobs[i]!);
    constructOne(o);
    if (canConstructNow()) flushConstructors();
  } finally {
    engine.scriptDepth--;
  }
  if (engine.scriptDepth === 0) drainActions();
}

/** Queue constructors (jobs[from..]) and run them now when the calling context allows it [ORACLE P11]. */
function deferConstruction(jobs: readonly DisplayObject[], from: number): void {
  if (jobs.length <= from) return;
  for (let i = from; i < jobs.length; i++) engine.pendingCtors.push(jobs[i]!);
  if (canConstructNow()) flushConstructors();
}

/**
 * Build an allocated (already inserted / owned) object: placement props -> initObject (AS2 for..in order) -> frame 1
 * (children built recursively; their frame-1 DoActions are queued before this clip's) -> instance hook. NO constructor
 * runs here: `jobs` receives the objects whose construction is due, in Flash's order — pre-order: this object, then
 * its new children by ascending depth, each followed by its own subtree [ORACLE P11 / P8 mInitList].
 */
function buildTree(o: DisplayObject, place: PlacementState | null, init: Record<string, any> | undefined,
  jobs: DisplayObject[]): void {
  if (o instanceof MovieClip) engine.execList.push(o);
  if (place) applyPlacement(o, place, true);
  if (init && typeof init === 'object') {
    for (const k of forIn(init)) {
      try { o[k] = init[k]; } catch (e) { reportScriptError(e, `initObject.${k}`); }
    }
  }
  jobs.push(o);
  if (o instanceof MovieClip) {
    if (o.$def) {
      const st = replayFrames(o.$def, new Map(), 1, 1);
      o.$frame = 1;
      reconcile(o, st, 1, false, jobs);
      frameEntered(o, 1);
    }
  } else if (o instanceof Button) {
    o.$setState('up');
  }
  if (o.$charId >= 0) {
    const hook = getInstanceHook();
    if (hook) {
      try { hook(o as MovieClip, o.$charId); } catch (e) { reportScriptError(e, `instanceHook(${o.$charId})`); }
    }
  }
}

/** Construct one built object: its ctor() (MovieClips), then queue its onLoad. Removed objects are skipped. */
function constructOne(o: DisplayObject): void {
  if (!(o instanceof MovieClip) || o.$removed) return;
  if (typeof o.ctor === 'function') {
    engine.scriptDepth++;
    engine.ctx.push('ctor');
    try { o.ctor(); } catch (e) { reportScriptError(e, `ctor of ${o.$charId >= 0 ? engine.library?.linkageForChar(o.$charId) ?? o.$charId : 'clip'}`); } finally {
      engine.ctx.pop();
      engine.scriptDepth--;
    }
  }
  if (!o.$removed) queueLoad(o);
}
engine.ctorRunner = constructOne;

/** Build an object outside the display list (button state children, detached instances) and construct it at once. */
function buildAndConstructNow(o: DisplayObject): void {
  engine.scriptDepth++;
  try {
    const jobs: DisplayObject[] = [];
    buildTree(o, null, undefined, jobs);
    for (const j of jobs) constructOne(j);
  } finally {
    engine.scriptDepth--;
  }
}

/** Instance for a button record (state or hit child), created lazily and kept. */
function buttonRecordInstance(b: Button, r: ButtonRecord): DisplayObject | undefined {
  let o = b.$stateKids.get(r);
  if (o) return o;
  o = createInstance(r.id);
  if (!o) return undefined;
  o.$owner = b;
  o.$depth = r.depth;
  o._name = '';
  o.$m = new Matrix(r.m.a, r.m.b, r.m.c, r.m.d, r.m.tx, r.m.ty);
  o.$srOk = false;
  if (r.cx) o.$cx = cxFromRecord(r.cx);
  if (r.filters) o.$setFilters(filtersFromRecords(r.filters));
  b.$stateKids.set(r, o);
  buildAndConstructNow(o);
  return o;
}

// ==================================================================================================== child list

function findIndex(list: readonly DisplayObject[], depth: number): number {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.$depth < depth) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export function childAtDepth(p: MovieClip, depth: number): DisplayObject | undefined {
  const i = findIndex(p.$list, depth);
  const c = p.$list[i];
  return c && c.$depth === depth ? c : undefined;
}

const RESERVED = new Set<string>();
for (let pr: object | null = MovieClip.prototype; pr && pr !== Object.prototype; pr = Object.getPrototypeOf(pr)) {
  for (const k of Object.getOwnPropertyNames(pr)) RESERVED.add(k);
}

function linkName(p: MovieClip, c: DisplayObject): void {
  const n = c._name;
  if (!n || RESERVED.has(n)) return;
  const d = Object.getOwnPropertyDescriptor(p, n);
  if (d && 'value' in d) {
    const v = d.value;
    // keep game-assigned values; children with the same name: lowest depth wins (Flash lookup order)
    if (!(v instanceof DisplayObject)) return;
    if (v._parent === p && !v.$removed && v !== c && v.$depth < c.$depth) return;
  }
  Object.defineProperty(p, n, { value: c, writable: true, enumerable: true, configurable: true });
}

function unlinkName(p: MovieClip, c: DisplayObject): void {
  const n = c._name;
  if (!n) return;
  const d = Object.getOwnPropertyDescriptor(p, n);
  if (d && 'value' in d && d.value === c) {
    delete p[n];
    // another child with the same name becomes visible
    for (const o of p.$list) if (o !== c && o._name === n) { linkName(p, o); break; }
  }
}

export function insertChild(p: MovieClip, c: DisplayObject, depth: number): void {
  const old = childAtDepth(p, depth);
  if (old) removeChildObj(p, old);
  c.$depth = depth;
  c._parent = p;
  p.$list.splice(findIndex(p.$list, depth), 0, c);
  linkName(p, c);
  p.$inv();
}

function markRemoved(o: DisplayObject): void {
  o.$removed = true;
  if (engine.focus === o) engine.focus = null;
  if (o instanceof MovieClip) {
    for (const c of o.$list) markRemoved(c);
    engine.execDirty = true;
    // Flash: onUnload fires on every clip removed from the display list that carries a handler (the screen
    // system removes replaced screens with removeMovieClip - CScreen.Dispose is NEVER called by it, so DOM
    // side objects of a screen must be cleaned up from here).
    const u = (o as any).onUnload;
    if (typeof u === 'function') {
      try { u.call(o); } catch (err) { console.error('[swf] onUnload', err); }
    }
  }
  else if (o instanceof Button) for (const c of o.$stateKids.values()) markRemoved(c);
}

export function removeChildObj(p: MovieClip, c: DisplayObject): void {
  const i = p.$list.indexOf(c);
  if (i < 0) return;
  p.$list.splice(i, 1);
  unlinkName(p, c);
  markRemoved(c);
  if (c.$maskOf) { c.$maskOf.$maskedBy = null; c.$maskOf = null; }
  p.$inv();
}

function swapChildDepth(p: MovieClip, c: DisplayObject, depth: number): void {
  if (c.$depth === depth) return;
  const other = childAtDepth(p, depth);
  const list = p.$list;
  list.splice(list.indexOf(c), 1);
  if (other) {
    list.splice(list.indexOf(other), 1);
    other.$depth = c.$depth;
    list.splice(findIndex(list, other.$depth), 0, other);
    other.$timeline = false;
  }
  c.$depth = depth;
  list.splice(findIndex(list, depth), 0, c);
  c.$timeline = false;
  p.$inv();
}

// ==================================================================================================== timeline

/**
 * Reconcile a clip's timeline children with a replayed state (see timeline.ts). New instances are BUILT (not
 * constructed); their construction jobs are appended to `jobs` in Flash's order: by ascending depth, each new child
 * followed by its own subtree (pre-order) [ORACLE P11 / P8].
 */
function reconcile(mc: MovieClip, st: TimelineState, target: number, rewind: boolean, jobs: DisplayObject[]): void {
  for (const c of mc.$list.slice()) {
    if (!c.$timeline) continue;
    const p = st.get(c.$depth);
    let keep = false;
    if (p) {
      if (rewind) keep = p.inst === undefined && p.charId === c.$charId && c.$placeFrame <= target;
      else keep = p.inst === c;
    }
    if (keep) p!.inst = c;
    else removeChildObj(mc, c);
  }
  const entries = [...st.values()].sort((a, b) => a.order - b.order);
  const groups: { depth: number; jobs: DisplayObject[] }[] = [];
  for (const p of entries) {
    const cur = p.inst as DisplayObject | undefined;
    if (cur && !cur.$removed && cur._parent === mc) {
      if (p.touched & T_CHAR) replaceCharacter(cur, p.charId);
      if (p.touched) applyPlacement(cur, p, false);
      cur.$placeFrame = p.placeFrame;
      continue;
    }
    const o = createInstance(p.charId);
    if (!o) { p.inst = undefined; continue; }
    o.$timeline = true;
    o.$placeFrame = p.placeFrame;
    o._name = p.name ?? `instance${engine.instanceCounter++}`;
    engine.scriptDepth++;
    try {
      insertChild(mc, o, p.depth);
      const sub: DisplayObject[] = [];
      buildTree(o, p, undefined, sub);
      groups.push({ depth: p.depth, jobs: sub });
    } finally {
      engine.scriptDepth--;
    }
    p.inst = o;
  }
  if (groups.length > 1) groups.sort((a, b) => a.depth - b.depth);
  for (const g of groups) for (const j of g.jobs) jobs.push(j);
  for (const p of st.values()) p.touched = 0;
  mc.$tl = st;
}

function replaceCharacter(o: DisplayObject, id: number): void {
  const def = engine.library?.char(id);
  if (!def) return;
  if (o instanceof Shape && def.t === 'shape') o.$def = def;
  else if (o instanceof MorphShape && def.t === 'morph') o.$def = def;
  else if (o instanceof StaticText && def.t === 'text') o.$def = def;
  else return;
  o.$charId = id;
  o.$inv();
}

const silent = (info: SoundInfo): boolean =>
  !!info.envelope && info.envelope.length > 0 && info.envelope.every((e) => e.left === 0 && e.right === 0);

/** A frame became current: start its sounds, queue its DoAction script. */
function frameEntered(mc: MovieClip, frame: number): void {
  const fdef = mc.$def?.frames[frame - 1];
  if (!fdef) return;
  if (fdef.sounds && fdef.sounds.length) {
    const h = getTimelineSoundHandler();
    if (h) {
      for (const s of fdef.sounds) {
        if (silent(s.info)) continue;
        try { h(s.id, s.info, mc); } catch (e) { reportScriptError(e, `sound ${s.id}`); }
      }
    }
  }
  if (fdef.actions && fdef.actions.length) {
    const fn = getFrameScript(mc.$spriteId, frame);
    if (fn) queueAction(mc, () => fn.call(mc), `frame script ${mc.$spriteId}:${frame}`);
    else warnOnce(`fs:${mc.$spriteId}:${frame}`, `no frame script registered for sprite ${mc.$spriteId} frame ${frame} (DoAction ignored)`);
  }
}

// ==================================================================================================== hit testing

/** The sibling mask (PlaceObject clipDepth) covering list[i], if any. `anyMask` short-circuits mask-free lists. */
export function siblingMaskOf(list: readonly DisplayObject[], i: number, anyMask: boolean): DisplayObject | undefined {
  if (!anyMask) return undefined;
  const c = list[i]!;
  for (let j = i - 1; j >= 0; j--) {
    const m = list[j]!;
    if (m.$clipDepth > 0 && m.$depth < c.$depth && c.$depth <= m.$clipDepth) return m;
  }
  return undefined;
}

export const listHasMask = (list: readonly DisplayObject[]): boolean => {
  for (const c of list) if (c.$clipDepth > 0) return true;
  return false;
};

function hitChildren(list: readonly DisplayObject[], x: number, y: number, mouse: boolean): boolean {
  const anyMask = listHasMask(list);
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]!;
    if (c.$clipDepth > 0) continue;
    if (mouse && !c.$visible) continue;
    if (c.$maskOf) continue;
    const [lx, ly] = apply(invert(c.$m), x, y);
    const mask = siblingMaskOf(list, i, anyMask);
    if (mask) {
      const [mx, my] = apply(invert(mask.$m), x, y);
      if (!mask.$hitLocal(mx, my, false)) continue;
    }
    if (c.$hitLocal(lx, ly, mouse)) return true;
  }
  return false;
}

// ==================================================================================================== text helpers

function sameFmt(a: TextFmt, b: TextFmt): boolean {
  for (const k in a) if ((a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return false;
  return true;
}

function normalizeNewlines(s: string): string { return s.replace(/\r\n|\n/g, '\r'); }

function fmtFromTextFormat(tf: TextFormat): Partial<TextFmt> {
  const f: Partial<TextFmt> = {};
  const t = tf as unknown as Record<string, unknown>;
  const num = (k: string): number | undefined => (t[k] === undefined || t[k] === null ? undefined : finite(t[k]));
  if (t.font !== undefined && t.font !== null) f.font = String(t.font);
  const size = num('size'); if (size !== undefined) f.size = size;
  const color = num('color'); if (color !== undefined) f.color = (color >>> 0) & 0xffffff;
  if (t.bold !== undefined && t.bold !== null) f.bold = asBool(t.bold);
  if (t.italic !== undefined && t.italic !== null) f.italic = asBool(t.italic);
  if (t.underline !== undefined && t.underline !== null) f.underline = asBool(t.underline);
  if (t.url !== undefined && t.url !== null) f.url = String(t.url);
  if (t.target !== undefined && t.target !== null) f.target = String(t.target);
  if (t.align !== undefined && t.align !== null) {
    const a = String(t.align).toLowerCase();
    if (a === 'left' || a === 'right' || a === 'center' || a === 'justify') f.align = a;
  }
  const lm = num('leftMargin'); if (lm !== undefined) f.leftMargin = lm;
  const rm = num('rightMargin'); if (rm !== undefined) f.rightMargin = rm;
  const ind = num('indent'); if (ind !== undefined) f.indent = ind;
  const lead = num('leading'); if (lead !== undefined) f.leading = lead;
  const ls = num('letterSpacing'); if (ls !== undefined) f.letterSpacing = ls;
  if (t.kerning !== undefined && t.kerning !== null) f.kerning = asBool(t.kerning);
  return f;
}

function textFormatFrom(f: Partial<TextFmt>): TextFormat {
  const tf = new TextFormat(f.font, f.size, f.color, f.bold, f.italic, f.underline, f.url, f.target, f.align,
    f.leftMargin, f.rightMargin, f.indent, f.leading);
  tf.letterSpacing = f.letterSpacing;
  tf.kerning = f.kerning;
  return tf;
}

let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();
function measureDevice(cssTemplate: string, size: number, code: number): number {
  const css = cssTemplate.replace('SIZE', String(size));
  const key = `${css}|${code}`;
  let w = measureCache.get(key);
  if (w !== undefined) return w;
  if (measureCtx === undefined) {
    measureCtx = null;
    try {
      if (typeof OffscreenCanvas !== 'undefined') measureCtx = new OffscreenCanvas(1, 1).getContext('2d');
      else if (typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
    } catch { measureCtx = null; }
  }
  if (measureCtx) {
    measureCtx.font = css;
    w = measureCtx.measureText(String.fromCharCode(code)).width;
  } else w = code === 32 ? size * 0.28 : size * 0.55;
  measureCache.set(key, w);
  return w;
}

// ==================================================================================================== player helpers

/** Engine: create the root MovieClip for the main timeline (frame 1 not yet built). */
export function createRootClip(def: SpriteDef): MovieClip {
  const root = allocMovieClip(def, 0, undefined);
  root.$spriteId = 0;
  root._name = '';
  engine.execList.push(root);
  return root;
}

/** Engine: build frame 1 of a clip created with createRootClip (runs sounds, queues frame-1 scripts). */
export function buildFirstFrame(mc: MovieClip): void {
  if (!mc.$def) return;
  engine.scriptDepth++;
  try {
    const st = replayFrames(mc.$def, new Map(), 1, 1);
    mc.$frame = 1;
    const jobs: DisplayObject[] = [];
    reconcile(mc, st, 1, false, jobs);
    frameEntered(mc, 1);
    deferConstruction(jobs, 0);
  } finally {
    engine.scriptDepth--;
  }
}

/** Engine: mark a detached instance (and its subtree) as removed (drops it from the exec list). */
export function destroyDetached(o: DisplayObject): void { markRemoved(o); }

/** Engine: instantiate a library character detached from any parent (gallery / tests). */
export function instantiateDetached(charId: number, name = 'gallery'): DisplayObject | undefined {
  const o = createInstance(charId);
  if (!o) return undefined;
  o._name = name;
  buildAndConstructNow(o);
  return o;
}
