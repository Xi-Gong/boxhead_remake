// WorldSnap (v0.2.3 rollback §E): exact per-tick snapshots of the FULL world for GGPO-style rollback.
// The wave-level RunSnapshot (Resume.ts) deliberately skips mid-wave creatures/shots/effects - rollback
// cannot. Strategy (hybrid, see the rollback design doc D1-D2):
//   - THINGS (every CThing_* with a sUniqueID incl. weapon things): generic capture of OWN enumerable
//     props (proto() defaults live on prototypes and only shadow on assignment, so restore = re-assign the
//     captured own props + delete post-snapshot extras reproduces values AND proto-fallback). Functions
//     (Process/fState own props) become method-NAME tokens resolved against the prototype chain.
//   - CThing_Affect_* (NOT CThing subclasses - no sUniqueID): own-prop value objects on a retained proto.
//   - Value classes (CThing_Position/Angle, flash Point/Rectangle, draw primitives): typed tokens; one
//     restored instance per captured identity (aliasing memo keeps CThing.mP === mPosition).
//   - Containers (CWorld/CHud/CThing_Collection/map cells/nav statics/NetSlots): explicit field lists.
//   - Cross-refs: things by sUniqueID, cells by (x,y), singletons by name, CSound samples by key, shared
//     static caches (XSI collections, bmList, the players' mControls dicts) by identity via the ring slot.
// Unknown object shapes THROW - the chaos round-trip test (tests/sim/rollback.snapshot.test.ts) is the
// enumeration net; every violation becomes a handler here.
// Restore is in-place (no constructors anywhere): instances captured alive per ring slot are field-rewritten,
// things spawned after the slot become garbage when the dicts are rebuilt, deleted things resurrect.
import { flash } from '../../../engine/runtime.ts';
import { getRandomState, setRandomState } from '../../../engine/flash/rng.ts';
import { CSound, DrawPrimitive, Thing, World } from '../../packages.ts';
import type { NetSlot } from './NetSlot.ts';

// ---------------------------------------------------------------------------------------------------------------- schema

export type SV =
  | number | string | boolean | null
  | ['u']
  | ['pos', number, number, number]
  | ['ang', number]
  | ['pt', number, number]
  | ['rect', number, number, number, number]
  // mAnimationPosition, bmObject index into bmList, sharedIdx(bmList)
  | ['mcanim', number, number, number]
  // mItems index, mCurrentFrameID, mAnimEnd, mPreUpdate, mID, direction idx, frame idx, sharedIdx(mCollection)
  | ['xsi', number, number, number, number, number, number, number, number, string?]
  // class name, own props, sharedIdx(prototype)
  | ['obj', string, [string, SV][], number]
  | ['shared', number]
  | ['sample', string]
  | ['thing', string]
  | ['cell', number, number]
  | ['singleton', 'world' | 'collection' | 'hud' | 'upgrades' | 'map' | 'mapwho' | 'collide']
  | ['fn', string]
  | ['arr', SV[], number]
  | ['dict', [string, SV][]];

interface ThingSnap { cls: string; props: [string, SV][] }

export interface WorldSnap {
  v: 1;
  tAbs: number;
  rng: number;
  allocID: number;
  /** x, y, mCollide, mChildCount, nID, nDist, nVD, mSessionIDCheck, mObjects keys (insertion order). */
  cells: [number, number, number, number, number, number, number, number, string[]][];
  collection: {
    mThings: [string, string][];
    mPlayerThings: [string, string][];
    mDeleteThings: [string, string][];
    mThingCounters: [string, number][];
    mTimeSlice: [number, number, number];
    mRespawnPlayer: [string, SV][];
  };
  things: Record<string, ThingSnap>;
  world: {
    mCompleteState: SV;
    mTrackPosition: SV;
    lTrackPosition: SV;
    /** The camera rect offset. "Render state" for the checksum, but the SIM READS it: mouse aim converts
     *  through it (State_PlayerControl), and a replay has no Draw to refresh it - restore the captured value. */
    mDrawPosition: SV;
    mTrackPositions: [SV, SV];
    /** mAmbienceTicker, mAmbienceTick, mZombieSampleIndex, mZombie_DrawCount. */
    mAmbience: [number, number, number, number];
  };
  hud: {
    nTotalScore: number;
    mTotalScore: number;
    mPlayer1_Deaths: number;
    mPlayer2_Deaths: number;
    mScores: SV;
    mMessages: SV;
  };
  upgrades: [string, SV][];
  /** Per player: slot name -> [mDown, mPressed, mReleased, mTimeDown, mTimePressed, mTimeReleased, pressTick, mKeycode]. */
  slots: [[string, number[]][], [string, number[]][]] | undefined;
  nav: { nState: SV; nSID: SV; nSTimer: number; nSDist: number; nFullScanCount: number; nList: SV; pList: SV; mCurrentSessionID: number };
  /** Floor decal clone (identity-stable: copyPixels back; skipped above the 4 MB byte guard - R4). */
  floor: { sharedIdx: number; w: number; h: number } | undefined;
}

export interface RingSlot {
  tRel: number;
  data: WorldSnap;
  /** sUniqueID -> the live thing instance captured at slot time (strong refs: deleted things resurrect). */
  instances: Map<string, any>;
  /** Identity registry: ['shared', i] and draw-primitive tokens resolve through here. */
  sharedObjs: any[];
}

export interface SnapCtx {
  world: any;
  cells: any[][];
  /** The two players' NetSlot tables (net mode); undefined offline (controls dicts are shared instead). */
  slots: [Record<string, NetSlot>, Record<string, NetSlot>] | undefined;
  samples: Map<any, string>;
  sharedObjs: any[];
  /** Per capture: sUniqueID -> live thing (the ring slot stores it) - reset by captureWorldSnap. */
  instances: Map<string, any>;
  privateMemo: Map<any, SV> | undefined;
  privateSharedIdx: Map<any, number> | undefined;
  privateThings: Record<string, ThingSnap> | undefined;
}

// Package members are only populated after allClasses ran (CONVENTIONS rule 2) - resolve lazily.
let xsiProto: any;
let mcanimProto: any;
const XSI_PROTO = (): any => (xsiProto ??= (DrawPrimitive.XSI as any).CDrawPrimitive_XSI_Animation.prototype);
const MCANIM_PROTO = (): any => (mcanimProto ??= (DrawPrimitive.MovieClip as any).CDrawPrimitive_MovieClip_Animation.prototype);

export function makeSnapCtx(world: any, slots?: [Record<string, NetSlot>, Record<string, NetSlot>]): SnapCtx {
  const samples = new Map<any, string>();
  for (const k of Object.keys(CSound.mSamples ?? {})) samples.set(CSound.mSamples[k], k);
  for (const k of Object.keys(CSound.mAmbience ?? {})) samples.set(CSound.mAmbience[k], 'amb:' + k);
  return {
    world,
    cells: world.mMap.mCells,
    slots,
    samples,
    sharedObjs: [],
    instances: new Map(),
    privateMemo: undefined,
    privateSharedIdx: undefined,
    privateThings: undefined,
  };
}

// ---------------------------------------------------------------------------------------------------------------- capture

function sharedIdx(ctx: SnapCtx, o: any): number {
  let i = ctx.privateSharedIdx!.get(o);
  if (i === undefined) {
    i = ctx.sharedObjs.push(o) - 1;
    ctx.privateSharedIdx!.set(o, i);
  }
  return i;
}

const methodNames = new WeakMap<object, WeakMap<Function, string>>();
function methodNameOf(fn: any, owner: any, path: string): string {
  const prototype = Object.getPrototypeOf(owner);
  let names = methodNames.get(prototype);
  const cached = names?.get(fn);
  // Wrapper installation precedes live worlds. Still invalidate a renamed/replaced method rather
  // than restoring a function that no longer matches the prototype's descriptor lookup.
  if (cached) {
    try { if (resolveFn(cached, owner) === fn) return cached; }
    catch { names!.delete(fn); } // The old method may have been removed and registered under a new name.
  }
  let p = prototype;
  while (p) {
    for (const k of Object.getOwnPropertyNames(p)) {
      if (k !== 'constructor' && (p as any)[k] === fn) {
        if (!names) methodNames.set(prototype, names = new WeakMap());
        names.set(fn, k);
        return k;
      }
    }
    p = Object.getPrototypeOf(p);
  }
  throw new Error(`WorldSnap: unresolvable function value at ${path}`);
}

/**
 * Class dispatch by PROTOTYPE, never by constructor.name: the production bundle minifies class names, so a
 * name-based switch silently misroutes every value in the packaged build (found by the packaged net playtest
 * - the headless vitest build keeps the names, which is why the sim suite never saw it).
 */
let protoHandlers: Map<any, (v: any, ctx: SnapCtx, path: string, memoSet: (t: SV) => SV) => SV> | undefined;
const protos = (): Map<any, (v: any, ctx: SnapCtx, path: string, memoSet: (t: SV) => SV) => SV> => {
  if (protoHandlers) return protoHandlers;
  protoHandlers = new Map<any, any>([
    [(Thing.Math as any).CThing_Position.prototype,
      (v: any, _c: SnapCtx, _p: string, memoSet: any) => memoSet(['pos', v.mX, v.mY, v.mZ])],
    [(Thing.Math as any).CThing_Angle.prototype,
      (v: any, _c: SnapCtx, _p: string, memoSet: any) => memoSet(['ang', v.mRadians])],
    [flash.geom.Point.prototype,
      (v: any, _c: SnapCtx, _p: string, memoSet: any) => memoSet(['pt', v.x, v.y])],
    [flash.geom.Rectangle.prototype,
      (v: any, _c: SnapCtx, _p: string, memoSet: any) => memoSet(['rect', v.x, v.y, v.width, v.height])],
    [(DrawPrimitive.MovieClip as any).CDrawPrimitive_MovieClip_Animation.prototype,
      (v: any, ctx: SnapCtx, _p: string, memoSet: any) => memoSet(['mcanim', v.mAnimationPosition, v.bmList.indexOf(v.bmObject), sharedIdx(ctx, v.bmList)])],
    [(DrawPrimitive.XSI as any).CDrawPrimitive_XSI_Animation.prototype,
      (v: any, ctx: SnapCtx, _p: string, memoSet: any) => {
        // The animation OBJECT (mDirections/mFrames/bitmaps) is immutable data after build - share it by
        // identity (item-backed or the DI-built standalone kind alike); the mutable state lives on THIS
        // instance. A degenerate instance (no animation object yet) stores -1s.
        const animObjIdx = v.mAnimationObject !== undefined ? sharedIdx(ctx, v.mAnimationObject) : -1;
        const dirIdx = v.mCurrentDirection && v.mAnimationObject ? v.mAnimationObject.mDirections.indexOf(v.mCurrentDirection) : -1;
        const frameIdx = v.mCurrentDirection && dirIdx >= 0 ? v.mCurrentDirection.mFrames.indexOf(v.mCurrentFrame) : -1;
        const tri = (x: any): number => (x === undefined ? 2 : x ? 1 : 0);
        const animationKey = Object.keys(v.mCollection?.mItems ?? {}).find(key => v.mCollection.mItems[key].mAnimationObject === v.mAnimationObject);
        return memoSet(['xsi', animObjIdx, v.mCurrentFrameID, tri(v.mAnimEnd), tri(v.mPreUpdate), v.mID ?? 0, dirIdx, frameIdx, v.mCollection !== undefined ? sharedIdx(ctx, v.mCollection) : -1, animationKey]);
      }],
    [(World.Map as any).CMap_Cell.prototype, (v: any) => ['cell', v.mID.x, v.mID.y] as SV],
  ]);
  return protoHandlers;
};

function captureValue(v: any, ctx: SnapCtx, owner: any, path: string): SV {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'undefined') return ['u'];
  if (t === 'number' || t === 'string' || t === 'boolean') return v;
  if (t === 'function') return ['fn', methodNameOf(v, owner, path)];
  const m = ctx.privateMemo!;
  if (m.has(v)) return m.get(v)!;
  if (Array.isArray(v)) {
    const token: any = ['arr', [], v.length];
    m.set(v, token);
    for (let i = 0; i < v.length; i++) token[1][i] = captureValue(v[i], ctx, owner, `${path}[${i}]`);
    return token;
  }
  // Things with identity: full own-prop capture, referenced by id everywhere else. (_CLASSID_ is the
  // REGISTERED dotted name - stable across minification, unlike constructor.name.)
  if (typeof v.sUniqueID === 'string' && typeof v._CLASSID_ === 'string' && v._CLASSID_.startsWith('CThing')) {
    const sid = v.sUniqueID;
    if (!m.has(v)) {
      m.set(v, ['thing', sid]);
      ctx.instances.set(sid, v);
      ctx.privateThings![sid] = { cls: v._CLASSID_, props: captureOwnProps(v, ctx, `${path}(${v._CLASSID_})`) };
    }
    return ['thing', sid];
  }
  const memoSet = (token: SV): SV => { m.set(v, token); return token; };
  const h = protos().get(Object.getPrototypeOf(v));
  if (h) return h(v, ctx, path, memoSet);
  if (v === ctx.world) return ['singleton', 'world'];
  if (v === ctx.world.mThing_Collection) return ['singleton', 'collection'];
  if (v === ctx.world.mHud) return ['singleton', 'hud'];
  if (v === ctx.world.mUpgrades) return ['singleton', 'upgrades'];
  if (v === ctx.world.mMap) return ['singleton', 'map'];
  if (v === ctx.world.mMap?.mMapwho) return ['singleton', 'mapwho'];
  if (v === ctx.world.mMap?.mCollide) return ['singleton', 'collide'];
  if (ctx.samples.has(v)) return ['sample', ctx.samples.get(v)!];
  // CThing_Affect_* value objects (NOT CThing subclasses - no sUniqueID): dispatch on the BASE prototype.
  const AFF = (Thing.Affect as any).CThing_Affect?.prototype;
  if (AFF && AFF.isPrototypeOf(v)) {
    return memoSet(['obj', String(v._CLASSID_ ?? 'CThing_Affect'), captureOwnProps(v, ctx, `${path}(affect)`), sharedIdx(ctx, Object.getPrototypeOf(v))]);
  }
  // Shared static draw caches (the XSI collections load once per creature family and are read-only after).
  // CDrawPrimitive_XSI_Collection does NOT derive from CDrawPrimitive - dispatch both by prototype.
  const DP = (DrawPrimitive as any).CDrawPrimitive?.prototype;
  const XC = (DrawPrimitive.XSI as any).CDrawPrimitive_XSI_Collection?.prototype;
  if ((DP && DP.isPrototypeOf(v)) || (XC && XC.isPrototypeOf(v))) return ['shared', sharedIdx(ctx, v)];
  // BitmapData render caches (e.g. a HUD message's pre-rendered bitmap): immutable pixel backing by
  // identity - never re-created on restore (the message structs around it carry the lifecycle state).
  if (v instanceof flash.display.BitmapData) return ['shared', sharedIdx(ctx, v)];
  // Plain object (dict / literal container).
  if (Object.getPrototypeOf(v) === Object.prototype) {
    return captureDict(v,ctx,owner,path);
  }
  throw new Error(`WorldSnap: unknown value at ${path}: ${v._CLASSID_ ?? v.constructor?.name} (${String(v).slice(0, 60)})`);
}

// Primitive property pairs are immutable snapshot data. Reuse unchanged pairs across boundaries;
// never reuse object tokens, whose references/alias memo and shared indices belong to one slot.
const primitiveProps = new WeakMap<object, Map<string, [string, SV]>>();
function captureOwnProps(o: any, ctx: SnapCtx, path: string): [string, SV][] {
  const out: [string, SV][] = [];
  let primitives = primitiveProps.get(o);
  if (!primitives) primitiveProps.set(o, primitives = new Map());
  for (const k of Object.keys(o)) {
    // The players' mControls dict is identity-stable per player instance (Process_Init swaps entries in
    // place); the NetSlots inside it are captured separately through ctx.slots, the offline CInput slots are
    // engine-live. Capture the DICT by identity, never by contents.
    if (k === 'mControls' && o.mControls && !Array.isArray(o.mControls)) out.push([k, ['shared', sharedIdx(ctx, o.mControls)]]);
    else {
      const value = o[k], type = typeof value;
      if (value === null || type === 'undefined' || type === 'number' || type === 'string' || type === 'boolean') {
        let pair = primitives.get(k);
        if (!pair || !(Object.is(pair[1], value) || value === undefined && Array.isArray(pair[1]) && pair[1][0] === 'u')) {
          pair = [k, value === undefined ? ['u'] : value];
          primitives.set(k, pair);
        }
        out.push(pair);
      } else out.push([k, captureValue(value, ctx, o, `${path}.${k}`)]);
    }
  }
  return out;
}

// Versionless plain-data leaves (not objects with slot-specific references). Validate key order and
// every primitive before reuse; a changed leaf always gets a new token, leaving older slots immutable.
const primitiveDicts=new WeakMap<object,{keys:string[];values:any[];token:SV}>();
function captureDict(o:any,ctx:SnapCtx,owner:any,path:string):SV{
  const keys=Object.keys(o),cached=primitiveDicts.get(o);
  let prefix=0,failedValue:any,failedValueRead=false;
  if(cached&&keys.length===cached.keys.length){
    for(;prefix<keys.length;prefix++){
      if(keys[prefix]!==cached.keys[prefix])break;
      const value=o[keys[prefix]];
      if(!Object.is(value,cached.values[prefix])){failedValue=value;failedValueRead=true;break;}
    }
    if(prefix===keys.length){ctx.privateMemo!.set(o,cached.token);return cached.token;}
  }
  const props:[string,SV][]=[],token:SV=['dict',props];ctx.privateMemo!.set(o,token);
  let values:any[]|undefined=[];
  for(let i=0;i<keys.length;i++){
    const key=keys[i],value=i<prefix?cached!.values[i]:i===prefix&&failedValueRead?failedValue:o[key],type=typeof value;
    if(values){
      if(value===null||type==='undefined'||type==='number'||type==='string'||type==='boolean')values.push(value);
      else values=undefined;
    }
    props.push([key,captureValue(value,ctx,owner,`${path}.${key}`)]);
  }
  if(values)primitiveDicts.set(o,{keys,values,token});else primitiveDicts.delete(o);
  return token;
}

export function captureWorldSnap(world: any, ctx: SnapCtx, copyFloor = true): WorldSnap {
  ctx.instances = new Map();
  // Each ring slot owns its registry. Reusing the growing array retained every expired bitmap/thing.
  ctx.sharedObjs = [];
  ctx.privateMemo = new Map();
  ctx.privateSharedIdx = new Map();
  ctx.privateThings = {};
  const tc = world.mThing_Collection;
  // The thing dicts are the TRAVERSAL ROOTS: running each entry through captureValue registers the thing
  // (and everything it references: weapons via players, affectors, draw primitives) in ctx.instances.
  const dictOf = (d: any, what: string): [string, string][] =>
    Object.keys(d).map((k) => {
      const token = captureValue(d[k], ctx, tc, `${what}.${k}`);
      return [k, (token as ['thing', string])[1]];
    });
  const cells: WorldSnap['cells'] = [];
  const rows = ctx.cells;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      // Empty cells still carry the navigation field. Dropping them changes subsequent AI decisions.
      cells.push([x, y, c.mCollide, c.mChildCount, c.nID, c.nDist, c.nVD, c.mSessionIDCheck, Object.keys(c.mObjects)]);
    }
  }
  const C = World.Map.CMap_Cell as any;
  const slots: WorldSnap['slots'] = ctx.slots
    ? ([0, 1].map((pi) =>
        Object.keys(ctx.slots![pi]!).map((name) => {
          const s2 = ctx.slots![pi]![name]!;
          return [name, [s2.mDown ? 1 : 0, s2.mPressed ? 1 : 0, s2.mReleased ? 1 : 0, s2.mTimeDown, s2.mTimePressed, s2.mTimeReleased, s2.pressTick, s2.mKeycode]] as [string, number[]];
        }),
      ) as WorldSnap['slots'])
    : undefined;
  const s: WorldSnap = {
    v: 1,
    tAbs: world.mTick,
    rng: getRandomState(),
    allocID: Thing.CThing.mAllocate_ID,
    cells,
    collection: {
      mThings: dictOf(tc.mThings, 'mThings'),
      mPlayerThings: dictOf(tc.mPlayerThings, 'mPlayerThings'),
      mDeleteThings: tc.mDeleteThings ? dictOf(tc.mDeleteThings, 'mDeleteThings') : [],
      mThingCounters: Object.keys(tc.mThingCounters).map((k) => [k, tc.mThingCounters[k]]),
      mTimeSlice: [tc.mTimeSlice_25, tc.mTimeSlice_8, tc.mTimeSlice_4],
      mRespawnPlayer: tc.mRespawnPlayer
        ? (Object.keys(tc.mRespawnPlayer).map((k) => [k, captureValue(tc.mRespawnPlayer[k], ctx, tc, `mRespawnPlayer.${k}`)]) as [string, SV][])
        : [],
    },
    things: ctx.privateThings,
    world: {
      mCompleteState: captureValue(world.mCompleteState, ctx, world, 'world.mCompleteState'),
      mTrackPosition: captureValue(world.mTrackPosition, ctx, world, 'world.mTrackPosition'),
      lTrackPosition: captureValue(world.lTrackPosition, ctx, world, 'world.lTrackPosition'),
      mDrawPosition: captureValue(world.mDrawPosition, ctx, world, 'world.mDrawPosition'),
      mTrackPositions: [
        captureValue(world.mTrackPositions?.[0], ctx, world, 'world.mTrackPositions[0]'),
        captureValue(world.mTrackPositions?.[1], ctx, world, 'world.mTrackPositions[1]'),
      ],
      mAmbience: [world.mAmbienceTicker ?? 0, world.mAmbienceTick ?? 0, world.mZombieSampleIndex ?? 0, world.mZombie_DrawCount ?? 0],
    },
    hud: {
      nTotalScore: world.mHud.nTotalScore,
      mTotalScore: world.mHud.mTotalScore,
      mPlayer1_Deaths: world.mHud.mPlayer1_Deaths,
      mPlayer2_Deaths: world.mHud.mPlayer2_Deaths,
      mScores: captureValue(world.mHud.mScores, ctx, world.mHud, 'hud.mScores'),
      mMessages: captureValue(world.mHud.mMessages, ctx, world.mHud, 'hud.mMessages'),
    },
    upgrades: captureOwnProps(world.mUpgrades, ctx, 'upgrades'),
    slots,
    nav: {
      nState: captureValue(C.nState, ctx, C, 'nav.nState'),
      nSID: captureValue(C.nSID, ctx, C, 'nav.nSID'),
      nSTimer: C.nSTimer ?? 0,
      nSDist: C.nSDist ?? 0,
      nFullScanCount: C.nFullScanCount ?? 0,
      nList: captureValue(C.nList, ctx, C, 'nav.nList'),
      pList: captureValue(C.pList, ctx, C, 'nav.pList'),
      mCurrentSessionID: C.mCurrentSessionID ?? 0,
    },
    floor: undefined,
  };
  const bm = world.bmFloor;
  if (copyFloor && bm && bm.width * bm.height * 4 <= 4 * 1024 * 1024) {
    s.floor = { sharedIdx: sharedIdx(ctx, bm.clone()), w: bm.width, h: bm.height };
  }
  ctx.privateMemo = undefined;
  return s;
}

// ---------------------------------------------------------------------------------------------------------------- restore

interface RestoreCtx { slot: RingSlot; world: any; cells: any[][]; memo: Map<any, any> }

function singletonOf(name: string, r: RestoreCtx): any {
  switch (name) {
    case 'world': return r.world;
    case 'collection': return r.world.mThing_Collection;
    case 'hud': return r.world.mHud;
    case 'upgrades': return r.world.mUpgrades;
    case 'map': return r.world.mMap;
    case 'mapwho': return r.world.mMap?.mMapwho;
    case 'collide': return r.world.mMap?.mCollide;
    default: throw new Error(`WorldSnap: unknown singleton ${name}`);
  }
}

function restoreValue(sv: SV, r: RestoreCtx): any {
  if (sv === null || typeof sv !== 'object') return sv;
  const memo = r.memo;
  if (memo.has(sv)) return memo.get(sv);
  const tag = sv[0] as string;
  switch (tag) {
    case 'u': return undefined;
    case 'pos': {
      const p = new (Thing.Math as any).CThing_Position(sv[1], sv[2], sv[3]);
      memo.set(sv, p);
      return p;
    }
    case 'ang': {
      const a = new (Thing.Math as any).CThing_Angle(0);
      a.mRadians = sv[1];
      memo.set(sv, a);
      return a;
    }
    case 'pt': { const p = new flash.geom.Point(sv[1] as number, sv[2] as number); memo.set(sv, p); return p; }
    case 'rect': { const q = new flash.geom.Rectangle(sv[1] as number, sv[2] as number, sv[3] as number, sv[4] as number); memo.set(sv, q); return q; }
    case 'thing': return r.slot.instances.get(sv[1] as string);
    case 'cell': return r.cells[sv[2] as number][sv[1] as number];
    case 'singleton': return singletonOf(sv[1] as string, r);
    case 'shared': return r.slot.sharedObjs[sv[1] as number];
    case 'sample': {
      const key = sv[1] as string;
      return key.startsWith('amb:') ? (CSound.mAmbience as any)[key.slice(4)] : (CSound.mSamples as any)[key];
    }
    case 'fn': throw new Error('WorldSnap: fn tokens must resolve through an owner (restoreOwnProps)');
    case 'arr': {
      const a = new Array(sv[2] as number);
      memo.set(sv, a);
      const items = sv[1] as SV[];
      for (let i = 0; i < items.length; i++) a[i] = restoreValue(items[i], r);
      return a;
    }
    case 'dict': {
      const d: any = {};
      memo.set(sv, d);
      for (const [k, val] of sv[1] as [string, SV][]) d[k] = restoreValue(val, r);
      return d;
    }
    case 'obj': {
      const proto = r.slot.sharedObjs[sv[3] as number];
      const o = Object.create(proto);
      memo.set(sv, o);
      restoreOwnProps(o, sv[2] as [string, SV][], r);
      return o;
    }
    case 'mcanim':
    case 'xsi':
      throw new Error('WorldSnap: draw primitives restore through restoreValueOn (owner-held instances)');
    default: throw new Error(`WorldSnap: bad token ${tag}`);
  }
}

/**
 * Draw primitives keep their live instance when the owner still holds a compatible one (XSI animation
 * instances are REASSIGNED on respawn - identity churns; restoring onto the current instance follows the
 * game's own behaviour), else a bare Object.create(proto) gets the captured fields.
 */
function restoreValueOn(sv: SV, old: any, r: RestoreCtx): any {
  if (!Array.isArray(sv)) return restoreValue(sv, r);
  const tag = sv[0] as string;
  if (tag !== 'xsi' && tag !== 'mcanim') return restoreValue(sv, r);
  const memo = r.memo;
  if (memo.has(sv)) return memo.get(sv);
  const wantProto = tag === 'xsi' ? XSI_PROTO() : MCANIM_PROTO();
  const inst = old && Object.getPrototypeOf(old) === wantProto ? old : Object.create(wantProto);
  memo.set(sv, inst);
  if (tag === 'mcanim') {
    inst.bmList = r.slot.sharedObjs[sv[3] as number];
    inst.mAnimationPosition = sv[1];
    inst.bmObject = inst.bmList[sv[2] as number];
  } else {
    inst.mCollection = (sv[8] as number) >= 0 ? r.slot.sharedObjs[sv[8] as number] : undefined;
    inst.mAnimationObject = (sv[1] as number) >= 0 ? r.slot.sharedObjs[sv[1] as number] : undefined;
    inst.mFrameCount = inst.mAnimationObject?.mFrameCount;
    inst.mCurrentFrameID = sv[2];
    inst.mAnimEnd = (sv[3] as number) === 2 ? undefined : !!sv[3];
    inst.mPreUpdate = (sv[4] as number) === 2 ? undefined : !!sv[4];
    inst.mID = sv[5];
    const dirIdx = sv[6] as number;
    const frameIdx = sv[7] as number;
    inst.mCurrentDirection = dirIdx >= 0 ? inst.mAnimationObject.mDirections[dirIdx] : undefined;
    inst.mCurrentFrame = inst.mCurrentDirection && frameIdx >= 0 ? inst.mCurrentDirection.mFrames[frameIdx] : undefined;
  }
  return inst;
}

function resolveFn(name: string, owner: any): any {
  let p = Object.getPrototypeOf(owner);
  while (p) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d && 'value' in d) return d.value;
    p = Object.getPrototypeOf(p);
  }
  throw new Error(`WorldSnap: cannot resolve method ${name} on ${owner?.constructor?.name}`);
}

function restoreOwnProps(o: any, props: [string, SV][], r: RestoreCtx): void {
  const keys = Object.keys(o);
  const reordered = keys.length !== props.length || keys.some((key, i) => key !== props[i]?.[0]);
  const old = reordered ? new Map(Object.entries(o)) : undefined;
  // Reassignment alone cannot restore insertion order after a predicted delete/re-add.
  // Preserve reusable draw instances, then recreate enumerable properties in snapshot order.
  if (reordered) for (const key of keys) delete o[key];
  for (const [k, sv] of props) {
    (o as any)[k] = Array.isArray(sv) && sv[0] === 'fn'
      ? resolveFn(sv[1] as string, o)
      : restoreValueOn(sv, old ? old.get(k) : o[k], r);
  }
}

export function restoreWorldSnap(world: any, slot: RingSlot, ctx: SnapCtx): void {
  const s = slot.data;
  const r: RestoreCtx = { slot, world, cells: ctx.cells, memo: new Map() };
  // 1. Things: rewrite every captured instance in place (props, then proto-fallback, deletions dropped).
  for (const [sid, t] of Object.entries(s.things)) {
    const inst = slot.instances.get(sid);
    if (!inst) throw new Error(`WorldSnap: ring slot lost instance ${sid} (${t.cls})`);
    restoreOwnProps(inst, t.props, r);
  }
  // 2. Collection dicts, rebuilt in captured insertion order (forIn = reverse insertion = Process order).
  const tc = world.mThing_Collection;
  const rebuild = (d: any, entries: [string, string][]): void => {
    for (const k of Object.keys(d)) delete d[k];
    for (const [k, sid] of entries) {
      const t = slot.instances.get(sid);
      if (!t) throw new Error(`WorldSnap: dict entry ${k} (${sid}) has no retained instance`);
      d[k] = t;
    }
  };
  rebuild(tc.mThings, s.collection.mThings);
  rebuild(tc.mPlayerThings, s.collection.mPlayerThings);
  if (!tc.mDeleteThings) tc.mDeleteThings = new Object();
  rebuild(tc.mDeleteThings, s.collection.mDeleteThings);
  for (const k of Object.keys(tc.mThingCounters)) delete tc.mThingCounters[k];
  for (const [k, v] of s.collection.mThingCounters) tc.mThingCounters[k] = v;
  tc.mTimeSlice_25 = s.collection.mTimeSlice[0];
  tc.mTimeSlice_8 = s.collection.mTimeSlice[1];
  tc.mTimeSlice_4 = s.collection.mTimeSlice[2];
  if (tc.mRespawnPlayer) {
    for (const k of Object.keys(tc.mRespawnPlayer)) delete tc.mRespawnPlayer[k];
    for (const [k, sv] of s.collection.mRespawnPlayer) tc.mRespawnPlayer[k] = restoreValue(sv, r);
  }
  // 3. Cells: mutable state (collide/objects/nID/nDist + the nVD direction cache and the affect-session
  //    stamps - all sim-visible: a stale nVD answers replayed direction queries with future-tick masks) +
  //    the mObjects buckets, keys in captured order.
  for (const row of ctx.cells) {
    for (const c of row) {
      c.mCollide = 0;
      c.mChildCount = 0;
      c.mObjects = new Array();
      c.nID = -1;
      c.nDist = undefined;
      c.nVD = undefined;
      c.mSessionIDCheck = undefined;
    }
  }
  for (const [x, y, collide, childCount, nID, nDist, nVD, sessionIDCheck, keys] of s.cells) {
    const c = ctx.cells[y][x];
    c.mCollide = collide;
    c.mChildCount = childCount;
    c.nID = nID;
    c.nDist = nDist;
    c.nVD = nVD;
    c.mSessionIDCheck = sessionIDCheck;
    for (const sid of keys) {
      const t = slot.instances.get(sid);
      if (!t) throw new Error(`WorldSnap: cell ${x},${y} object ${sid} has no retained instance`);
      c.mObjects[sid] = t;
    }
  }
  // 4. World / HUD / upgrades / slots / RNG / allocator / nav statics / floor.
  world.mCompleteState = restoreValue(s.world.mCompleteState, r);
  world.mTrackPosition = restoreValue(s.world.mTrackPosition, r);
  world.lTrackPosition = restoreValue(s.world.lTrackPosition, r);
  world.mDrawPosition = restoreValue(s.world.mDrawPosition, r);
  if (world.mTrackPositions) {
    world.mTrackPositions[0] = restoreValue(s.world.mTrackPositions[0], r);
    world.mTrackPositions[1] = restoreValue(s.world.mTrackPositions[1], r);
  }
  world.mAmbienceTicker = s.world.mAmbience[0];
  world.mAmbienceTick = s.world.mAmbience[1];
  world.mZombieSampleIndex = s.world.mAmbience[2];
  world.mZombie_DrawCount = s.world.mAmbience[3];
  world.mHud.nTotalScore = s.hud.nTotalScore;
  world.mHud.mTotalScore = s.hud.mTotalScore;
  world.mHud.mPlayer1_Deaths = s.hud.mPlayer1_Deaths;
  world.mHud.mPlayer2_Deaths = s.hud.mPlayer2_Deaths;
  world.mHud.mScores = restoreValue(s.hud.mScores, r);
  world.mHud.mMessages = restoreValue(s.hud.mMessages, r);
  restoreOwnProps(world.mUpgrades, s.upgrades, r);
  if (s.slots && ctx.slots) {
    for (let pi = 0; pi < 2; pi++) {
      for (const [name, f] of s.slots[pi]!) {
        const sl = ctx.slots[pi]![name]!;
        sl.mDown = !!f[0];
        sl.mPressed = !!f[1];
        sl.mReleased = !!f[2];
        sl.mTimeDown = f[3];
        sl.mTimePressed = f[4];
        sl.mTimeReleased = f[5];
        sl.pressTick = f[6];
        sl.mKeycode = f[7];
      }
    }
  }
  const C = World.Map.CMap_Cell as any;
  C.nState = restoreValue(s.nav.nState, r);
  C.nSID = restoreValue(s.nav.nSID, r);
  C.nSTimer = s.nav.nSTimer;
  C.nSDist = s.nav.nSDist;
  C.nFullScanCount = s.nav.nFullScanCount;
  C.nList = restoreValue(s.nav.nList, r);
  C.pList = restoreValue(s.nav.pList, r);
  C.mCurrentSessionID = s.nav.mCurrentSessionID;
  setRandomState(s.rng);
  Thing.CThing.mAllocate_ID = s.allocID;
  world.mTick = s.tAbs;
  if (s.floor) {
    const src = slot.sharedObjs[s.floor.sharedIdx];
    world.bmFloor.copyPixels(src, src.rectangle, new flash.geom.Point(0, 0));
  }
}

/** Debug helper: the snapshot's thing count (tests assert retention). */
export function snapThingCount(s: WorldSnap): number {
  return Object.keys(s.things).length;
}
