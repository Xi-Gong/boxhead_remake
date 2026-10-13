/**
 * EFFECT visual-fidelity scenes (lane X2). Same idea and driver semantics as src/dev/sceneList.ts (lane V): the SAME
 * step list drives the original game (AS1 driver injected into a copy of the SWF, tools/oracle/visual/buildFxScene.ts)
 * and the remake (src/dev/fxScenes.ts, dev builds only, `?fxscene=<id>`). Pure data - no imports.
 *
 * Differences to the lane V scenes: the steps can create game things (display-only or live), set / call members of
 * them, raise the multiplier, stamp decals and XSI frames, and seed Math.random with a Park-Miller LCG on both sides.
 * The AVM1 `random(n)` opcode of the original cannot be seeded, so the scenes only use effects whose look does not
 * depend on it (decals of live explosions are switched off with `noDecals`; the decal scene stamps fixed variants).
 *
 * Driver semantics (identical on both sides, see also sceneList.ts):
 *   - driver clip on _root (depth 1048000) created by a root frame-62 script; inactive until CMain._this and
 *     CMain.mInput exist; first active frame: mSingleFrame = true, PROLOGUE save fields (sceneList.ts) are set;
 *   - steps run in order, an action step and the next one in the same frame, a wait step blocks the frame;
 *   - after the last step: CMain's onEnterFrame is deleted, every clip stopped, the stage captured.
 *
 * Values (FxValue): numbers / strings / booleans; {pos:[x,y,z?]} = new Thing.Math.CThing_Position; {angle:r} = new
 * Thing.Math.CThing_Angle(r) (radians); {pt:[x,y]} = new flash.geom.Point; {g:'A.B', call?, args?} = _global.A.B
 * (then .call(...args)); {ref:'name', path?, call?, args?} = a named object (then .path, then .call(...args)).
 * Named objects: 'world' (CMain._this.mcWorld), 'M' (CMain._this), 'player0' / 'player1' (player things by index)
 * and every name given to a `new` / `call` step.
 */
export type FxValue =
  | number | string | boolean
  | { pos: [number, number] | [number, number, number] }
  | { angle: number }
  | { pt: [number, number] }
  | { g: string; call?: string; args?: FxValue[] }
  | { ref: string; path?: string; call?: string; args?: FxValue[] };

export type FxStep =
  /** CMain.mSaveData[field] = value */
  | { op: 'save'; field: string; value: number | boolean }
  /** no random spawns, level selection of `mode`, LoadLevel(room - 1), wait for State_RunWorld and world tick `tick` */
  | { op: 'room'; mode: 'Single' | 'Coop' | 'DeathMatch'; room: number; tick: number }
  /** wait until CMain._this.mcWorld.mTick >= tick */
  | { op: 'waitTick'; tick: number }
  /** block n frames */
  | { op: 'waitFrames'; n: number }
  /** Math.random := Park-Miller LCG (s = s * 16807 % 2147483647; return s / 2147483647) seeded with `seed` */
  | { op: 'seed'; seed: number }
  /** multiplier up to `value` one step at a time with HUD messages silenced; its timers are then held */
  | { op: 'multiplier'; value: number }
  /**
   * new <cls>(...args) (cls = dotted _global path); then obj[path] = value for every `set`; then
   *   add 'live'    -> mThing_Collection.AddThing(obj) (processed like any thing),
   *   add 'show'    -> AddThing, then obj.Process = function () {} and mMap.mMapwho.MoveThing(obj): drawn, frozen,
   *   add 'none'    -> nothing.
   */
  | { op: 'new'; cls: string; args: FxValue[]; name?: string; set?: [string, FxValue][]; add: 'live' | 'show' | 'none' }
  /** <ref>.<path> = value */
  | { op: 'set'; ref: string; path: string; value: FxValue }
  /** <ref>.<path>(...args) (result stored under `name` when given) */
  | { op: 'call'; ref: string; path: string; args?: FxValue[]; name?: string }
  /** World.Map.CMap_Decal.prototype.Draw_BloodSplat / Draw_ScorchMark := no-ops (their variants use random(n)) */
  | { op: 'noDecals' }
  /**
   * Stamp one decal variant into the floor exactly like CMap_Decal does (cache built on first use with pGlobalScale
   * (1, 0.6), 3 rotations): cache.mAnimationPosition = frame; cache.QRender_Mask(bmFloor, (x*32, y*32), dir, mask).
   */
  | { op: 'decal'; kind: 'blood' | 'scorch'; x: number; y: number; dir: number; frame: number }
  /**
   * Render one XSI frame into the FLOOR at cell (x, y): CDrawPrimitive_XSI.bmDraw = bmFloor; a =
   * CDrawPrimitive_XSI_Animation.CreateAnimationObject(collection); a.SetAnimation(anim, frame); a.Render(point,
   * new CThing_Angle(angle), 100); bmDraw restored. coll: player0 / player1 (their mXSI_Collection), zombie, devil.
   */
  | { op: 'xsi'; coll: 'player0' | 'player1' | 'zombie' | 'devil'; anim: string; frame: number; angle: number; x: number; y: number };

export interface FxSceneDef {
  id: string;
  title: string;
  steps: FxStep[];
  /** what the scene checks (shown in the report) */
  checks: string;
  /** Stage rectangles holding EXPECTED differences (excluded from `masked` in compareFx.ts). */
  masks?: { x: number; y: number; w: number; h: number; why: string }[];
}

const PI = 3.141592653589793;
const room1 = (tick = 11): FxStep[] => [{ op: 'room', mode: 'Single', room: 1, tick }];
/** the player out of the way (bottom-left corner of BOXY) so nothing covers the effects */
const parkPlayer: FxStep = { op: 'call', ref: 'player0', path: 'Move', args: [{ pos: [1.5, 15.5, 0] }] };
const show = (cls: string, x: number, y: number, args: FxValue[] = [], set: [string, FxValue][] = [], name?: string, angle = 0): FxStep =>
  ({ op: 'new', cls, args: [{ pos: [x, y, 0] }, { angle }, ...args], set, add: 'show', name });
/** a display-only animated effect showing frame `f` of its (cloned) cache */
const frameOf = (cls: string, cache: string, x: number, y: number, f: number, args: FxValue[] = []): FxStep[] => {
  const name = `${cls.split('.').pop()}_${x}_${y}`;
  return [
    show(cls, x, y, args, [['mcDrawObject', { g: `${cls}.${cache}`, call: 'Clone' }]], name),
    { op: 'call', ref: name, path: 'mcDrawObject.GotoToFrame', args: [f] },
  ];
};

/** 8 directions (0 = east, clockwise) */
const DIRS = [0, 1, 2, 3, 4, 5, 6, 7];

export const FX_SCENES: FxSceneDef[] = [
  {
    id: 'fx-objects',
    title: 'Objects: fake wall damage frames + fading, mine / charge pack / pickup, grenade, cluster shell, rocket, fireball',
    checks: 'CDrawPrimitive_MovieClip_Static / _Animation rasterisation and copyPixels / draw(alpha) of every object type',
    steps: [
      ...room1(),
      parkPlayer,
      // fake walls: frames 0, 3, 6, 9 of Object.Wall, and two half-faded ones (draw with alphaMultiplier)
      ...[0, 3, 6, 9].flatMap((f, i) => frameOf('Thing.Object.CThing_Object_Wall', 'mcDrawObject_Cache', 2.5 + i, 7.5, f)),
      ...frameOf('Thing.Object.CThing_Object_Wall', 'mcDrawObject_Cache', 6.5, 7.5, 0),
      { op: 'set', ref: 'CThing_Object_Wall_6.5_7.5', path: 'mAlpha', value: 60 },
      ...frameOf('Thing.Object.CThing_Object_Wall', 'mcDrawObject_Cache', 7.5, 7.5, 5),
      { op: 'set', ref: 'CThing_Object_Wall_7.5_7.5', path: 'mAlpha', value: 20 },
      // claymore / charge pack both frames, pickup
      ...frameOf('Thing.Object.CThing_Object_Mine', 'mcDrawObject_Cache', 2.5, 10.5, 0),
      ...frameOf('Thing.Object.CThing_Object_Mine', 'mcDrawObject_Cache', 3.5, 10.5, 1),
      ...frameOf('Thing.Object.CThing_Object_ChargePack', 'mcDrawObject_Cache', 4.5, 10.5, 0),
      ...frameOf('Thing.Object.CThing_Object_ChargePack', 'mcDrawObject_Cache', 5.5, 10.5, 1),
      ...frameOf('Thing.Object.CThing_Object_Pickup', 'mcDrawObject_Cache', 6.5, 10.5, 0),
      ...frameOf('Thing.Object.CThing_Object_Pickup', 'mcDrawObject_Cache', 7.5, 10.5, 0),
      { op: 'set', ref: 'CThing_Object_Pickup_7.5_10.5', path: 'mAlpha', value: 48 },
      // a barrel (static), a grenade and a cluster shell on the floor and in the air (z)
      show('Thing.Object.CThing_Object_Barrel', 15.5, 7.5),
      show('Thing.Shot.CThing_Shot_Grenade', 16.5, 7.5, [{ ref: 'player0' }, 150, 0.5]),
      { op: 'new', cls: 'Thing.Shot.CThing_Shot_Grenade', args: [{ pos: [17.5, 7.5, 1] }, { angle: 0 }, { ref: 'player0' }, 150, 0.5], add: 'show' },
      show('Thing.Shot.CThing_Shot_ClusterShell', 18.5, 7.5, [{ ref: 'player0' }, 150]),
      // rocket frames (Shot.Rocket has a GradientGlow), fireball frames
      ...[0, 1, 2].flatMap((f, i) => frameOf('Thing.Shot.CThing_Shot_Rocket', 'mcDrawObject_Cache', 15.5 + i, 10.5, f, [{ ref: 'player0' }, 250])),
      ...[0, 4, 8, 12].flatMap((f, i) => frameOf('Thing.Shot.CThing_Shot_FireBall', 'mcDrawObject_Cache', 15.5 + i, 13.5, f, [{ ref: 'player0' }, 50, false])),
      { op: 'waitTick', tick: 13 },
    ],
  },
  {
    id: 'fx-explosion-frames',
    title: 'Effect.Explosion frames 0..17, smoke cloud, bullet hit spark and rocket smoke frames',
    checks: 'the explosion / smoke / spark / rocket smoke animations (CDrawPrimitive_MovieClip_Animation, 8 px inflate)',
    steps: [
      ...room1(),
      parkPlayer,
      ...Array.from({ length: 18 }, (_, f) => frameOf('Thing.Effect.CThing_Effect_Explosion', 'mcDrawObject_Cache', 2.5 + (f % 6) * 3, 3 + Math.floor(f / 6) * 3, f, [{ ref: 'player0' }, 100])).flat(),
      ...[0, 3, 6, 9, 12, 14].flatMap((f, i) => frameOf('Thing.Effect.CThing_Effect_SmokeCloud', 'mcDrawObject_Cache', 2.5 + i * 3, 11.5, f)),
      ...[0, 2, 4, 6, 8, 12].flatMap((f, i) => frameOf('Thing.Effect.CThing_Effect_BulletHit', 'mcDrawObject_Cache', 2.5 + i * 3, 13.5, f)),
      ...[0, 1, 2, 3, 4, 5].flatMap((f, i) => frameOf('Thing.Effect.CThing_Effect_RocketSmoke', 'mcDrawObject_Cache', 3.5 + i * 3, 14.5, f)),
      { op: 'waitTick', tick: 13 },
    ],
  },
  ...[[12, 'first frame: shake (0, -15) and brightness flash 0.8'], [14, 'tick 3: shake (0, -3.75), brightness 0.4']].map(([tick, what]): FxSceneDef => ({
    id: `fx-explosion-live-${tick}`,
    title: `Live explosions (100 + 400 damage) at tick 11, ${what}`,
    checks: 'CThing_Effect_Explosion.Process_Delay: World.Shake, mBrightness -> ColorMatrix brightness on the frame, Animate(2.5)',
    steps: [
      ...room1(),
      parkPlayer,
      { op: 'noDecals' },
      { op: 'new', cls: 'Thing.Effect.CThing_Effect_Explosion', args: [{ pos: [4.5, 9.5, 0] }, { angle: 0 }, { ref: 'player0' }, 100], add: 'live' },
      { op: 'new', cls: 'Thing.Effect.CThing_Effect_Explosion', args: [{ pos: [16.5, 9.5, 0] }, { angle: 0 }, { ref: 'player0' }, 400], add: 'live' },
      { op: 'waitTick', tick: tick as number },
    ],
  })),
  {
    id: 'fx-muzzle',
    title: 'Muzzle flashes of pistol / UZI / shotgun / railgun in 8 directions (+ pistol at half directions)',
    checks: 'CDrawPrimitive_MovieClip_OmniDirectional: _Top squashed + _Front skewed per direction, mLookup256 pick',
    steps: [
      ...room1(),
      parkPlayer,
      { op: 'multiplier', value: 70 },
      ...['Pistol', 'UZI', 'Shotgun', 'Railgun'].flatMap((w, row) => DIRS.map((d): FxStep =>
        ({ op: 'new', cls: 'Thing.Effect.CThing_Effect_MuzzleFlash', args: [{ pos: [2.5 + d * 2, 3.5 + row * 3, 0] }, { angle: (d * PI) / 4 }, { g: `Thing.Weapon.CThing_Weapon_${w}.mcMuzzleFlash` }], add: 'show' }))),
      ...DIRS.map((d): FxStep =>
        ({ op: 'new', cls: 'Thing.Effect.CThing_Effect_MuzzleFlash', args: [{ pos: [2.5 + d * 2, 15, 0] }, { angle: (d * PI) / 4 + PI / 8 }, { g: 'Thing.Weapon.CThing_Weapon_Pistol.mcMuzzleFlash' }], add: 'show' })),
      { op: 'waitTick', tick: 13 },
    ],
  },
  {
    id: 'fx-tracers',
    title: 'Bullet tracers (0.5 px #CCCCCC, alpha 75) and railgun beams (2 px #9966FF, alpha 56.25) in 16 directions',
    checks: 'CDrawPrimitive_Line into mcScratch, World.RenderMCToDraw (draw with clipRect, smoothing)',
    steps: [
      ...room1(),
      parkPlayer,
      ...Array.from({ length: 16 }, (_, k): FxStep[] => {
        const a = (k * PI) / 8;
        const name = `bullet${k}`;
        return [
          { op: 'new', cls: 'Thing.Shot.CThing_Shot_Bullet', args: [{ pos: [5.5, 6.5, 0] }, { angle: a }, { ref: 'player0' }, 26, 8], name, add: 'show' },
          { op: 'set', ref: name, path: 'mDestination', value: { pos: [5.5 + Math.cos(a) * (2 + (k % 4) * 0.37), 6.5 + Math.sin(a) * (2 + (k % 4) * 0.37), 0] } },
        ];
      }).flat(),
      ...Array.from({ length: 16 }, (_, k): FxStep[] => {
        const a = (k * PI) / 8 + 0.1;
        const name = `rail${k}`;
        return [
          { op: 'new', cls: 'Thing.Shot.CThing_Shot_Railgun', args: [{ pos: [15.5, 8.5, 0] }, { angle: a }, { ref: 'player0' }, 100, 10], name, add: 'show' },
          { op: 'set', ref: name, path: 'mDestination', value: { pos: [15.5 + Math.cos(a) * 4.2, 8.5 + Math.sin(a) * 4.2, 0] } },
        ];
      }).flat(),
      // tracers at a height (z): the screen y uses (y + z * PFactor)
      { op: 'new', cls: 'Thing.Shot.CThing_Shot_Bullet', args: [{ pos: [3.5, 12.5, 1] }, { angle: 0 }, { ref: 'player0' }, 26, 8], name: 'bz', add: 'show' },
      { op: 'set', ref: 'bz', path: 'mDestination', value: { pos: [9.75, 13.1, 0.5] } },
      { op: 'waitTick', tick: 13 },
    ],
  },
  {
    id: 'fx-decals',
    title: 'Blood splat (4 frames x 3 rotations) and scorch mark (3 rotations) decals, y-scale 0.6, masked to bare floor',
    checks: 'CDrawPrimitive_MovieClip_Directional (rotation + pGlobalScale 0.6), copyPixels with alphaBitmap = decal mask',
    steps: [
      ...room1(),
      parkPlayer,
      ...[0, 1, 2].flatMap((dir) => [0, 1, 2, 3].map((frame): FxStep => ({ op: 'decal', kind: 'blood', x: 2.5 + frame * 2.5, y: 3.5 + dir * 3, dir, frame }))),
      ...[0, 1, 2].map((dir): FxStep => ({ op: 'decal', kind: 'scorch', x: 15.5, y: 3.5 + dir * 4, dir, frame: 0 })),
      // against the wall and a floor piece edge: the mask cuts them
      { op: 'decal', kind: 'blood', x: 5.5, y: 1.2, dir: 1, frame: 2 },
      { op: 'decal', kind: 'scorch', x: 20.8, y: 8.5, dir: 0, frame: 0 },
      { op: 'decal', kind: 'scorch', x: 10.9, y: 1.4, dir: 2, frame: 0 },
      { op: 'waitTick', tick: 13 },
    ],
  },
  ...([[3, 0], [1, 2]] as const).map(([c1, c2]): FxSceneDef => ({
    id: `fx-xsi-${c1}${c2}`,
    title: `Player skins ${c1} / ${c2} (Coop): stand 16 directions, walk 8 x frame 2, weapon stances, hit, dying, dead`,
    checks: 'CDrawPrimitive_XSI_DI rendering of every animation / direction of the 2 player collections',
    steps: [
      { op: 'save', field: 'mPlayer1_CharacterIndex', value: c1 },
      { op: 'save', field: 'mPlayer2_CharacterIndex', value: c2 },
      { op: 'room', mode: 'Coop', room: 1, tick: 11 },
      { op: 'call', ref: 'player0', path: 'Move', args: [{ pos: [1.5, 15.5, 0] }] },
      { op: 'call', ref: 'player1', path: 'Move', args: [{ pos: [2.5, 15.5, 0] }] },
      ...xsiSheet('player0', 1.5, 2.2),
      ...xsiSheet('player1', 11, 2.2),
      { op: 'waitTick', tick: 13 },
    ],
  })),
  {
    id: 'fx-xsi-monsters',
    title: 'Zombie and devil: stand, walk, attack, hit, dying, dead in every direction',
    checks: 'CDrawPrimitive_XSI_DI rendering of the zombie / devil collections (devil scale 0.42)',
    steps: [
      ...room1(),
      parkPlayer,
      ...monsterSheet('zombie', 1.5, 2.2),
      ...monsterSheet('devil', 11, 2.2),
      { op: 'waitTick', tick: 13 },
    ],
  },
];

/** A sheet of XSI frames of a player collection, 9 columns x ~7 rows from (x0, y0) (cells). */
function xsiSheet(coll: 'player0' | 'player1', x0: number, y0: number): FxStep[] {
  const out: FxStep[] = [];
  const put = (anim: string, frame: number, angle: number, i: number): void => {
    out.push({ op: 'xsi', coll, anim, frame, angle, x: x0 + (i % 9) * 1.05, y: y0 + Math.floor(i / 9) * 1.95 });
  };
  let i = 0;
  for (let d = 0; d < 16; d++) put('stand', 0, (d * PI) / 8, i++);
  for (let d = 0; d < 8; d++) put('walk', 2, (d * PI) / 4, i++);
  i = 27;
  for (const anim of ['pistolstand', 'uzistand', 'shotgunstand']) for (let d = 0; d < 8; d += 3) put(anim, 0, (d * PI) / 4, i++);
  for (const anim of ['rocketstand', 'railgunstand', 'pistolwalk']) for (let d = 1; d < 8; d += 3) put(anim, anim.endsWith('walk') ? 3 : 0, (d * PI) / 4, i++);
  i = 45;
  for (const anim of ['shothit_1', 'shothit_2']) for (let d = 0; d < 8; d += 2) put(anim, 1, (d * PI) / 4, i++);
  put('dead', 0, 0, i++);
  for (let f = 0; f < 5; f++) put('dying', f, PI / 2, i++);
  for (let d = 0; d < 8; d += 2) put('dead', 0, (d * PI) / 4, i++);
  return out;
}

function monsterSheet(coll: 'zombie' | 'devil', x0: number, y0: number): FxStep[] {
  const out: FxStep[] = [];
  const put = (anim: string, frame: number, angle: number, i: number): void => {
    out.push({ op: 'xsi', coll, anim, frame, angle, x: x0 + (i % 9) * 1.05, y: y0 + Math.floor(i / 9) * 1.95 });
  };
  let i = 0;
  for (let d = 0; d < 16; d += 2) put('stand', 0, (d * PI) / 8, i++);
  i = 9;
  for (let d = 0; d < 8; d++) put('walk', (d % 5), (d * PI) / 4, i++);
  i = 18;
  for (let d = 0; d < 8; d++) put('attack', d % 4, (d * PI) / 4, i++);
  i = 27;
  for (const anim of ['shothit_1', 'shothit_2']) for (let d = 0; d < 8; d += 2) put(anim, 1, (d * PI) / 4, i++);
  i = 36;
  for (let f = 0; f < 5; f++) put('dying', f, 0, i++);
  for (let d = 0; d < 8; d += 2) put('dead', 0, (d * PI) / 4, i++);
  return out;
}

export function getFxScene(id: string): FxSceneDef | undefined {
  return FX_SCENES.find((s) => s.id === id);
}
