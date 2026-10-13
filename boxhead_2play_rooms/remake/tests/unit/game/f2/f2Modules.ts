// Test helper (lane F2): side-effect imports of the lane F2 Thing modules plus the lane F1 modules they run against
// (scidd, Thing/Math, World/Map), and small FAKES for everything that needs assets or another lane's runtime
// (DrawPrimitive renderers, CMain, CInput, CSound, World.CWorld). Fakes are registered only when the real class is not
// (vitest isolates every test file, so nothing leaks between files).
import '../../../../src/game/scidd/CProfiler.ts';
import '../../../../src/game/scidd/Draw/CColor.ts';
import '../../../../src/game/scidd/Math/CLine.ts';
import '../../../../src/game/scidd/Math/CMath.ts';
import '../../../../src/game/scidd/Math/CRandom.ts';
import '../../../../src/game/scidd/Math/CVector3.ts';
import '../../../../src/game/Thing/Math/CThing_Angle.ts';
import '../../../../src/game/Thing/Math/CThing_Navigation.ts';
import '../../../../src/game/Thing/Math/CThing_Position.ts';
import '../../../../src/game/World/Map/CMap.ts';
import '../../../../src/game/World/Map/CMap_Affect.ts';
import '../../../../src/game/World/Map/CMap_Cell.ts';
import '../../../../src/game/World/Map/CMap_Collide.ts';
import '../../../../src/game/World/Map/CMap_Decal.ts';
import '../../../../src/game/World/Map/CMap_Mapwho.ts';
import '../../../../src/game/World/Map/CMap_Math.ts';
import '../../../../src/game/World/Map/CMap_Navigation.ts';
// ---- lane F2 ----
import '../../../../src/game/Thing/CThing.ts';
import '../../../../src/game/Thing/CThing_Collection.ts';
import '../../../../src/game/Thing/Affect/CThing_Affect.ts';
import '../../../../src/game/Thing/Affect/CThing_Affect_Bullet.ts';
import '../../../../src/game/Thing/Affect/CThing_Affect_DevilAttack.ts';
import '../../../../src/game/Thing/Affect/CThing_Affect_Explosion.ts';
import '../../../../src/game/Thing/Affect/CThing_Affect_FireBall.ts';
import '../../../../src/game/Thing/Affect/CThing_Affect_ZombieAttack.ts';
import '../../../../src/game/Thing/Creature/CThing_Creature.ts';
import '../../../../src/game/Thing/Creature/CThing_Creature_Devil.ts';
import '../../../../src/game/Thing/Creature/CThing_Creature_Player.ts';
import '../../../../src/game/Thing/Creature/CThing_Creature_Zombie.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_BloodPool.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_BloodSplat.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_BulletHit.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_Explosion.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_FireBall_Held.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_MuzzleFlash.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_RocketSmoke.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_SmartBomb.ts';
import '../../../../src/game/Thing/Effect/CThing_Effect_SmokeCloud.ts';
import '../../../../src/game/Thing/Object/CThing_Object.ts';
import '../../../../src/game/Thing/Object/CThing_Object_Barrel.ts';
import '../../../../src/game/Thing/Object/CThing_Object_ChargePack.ts';
import '../../../../src/game/Thing/Object/CThing_Object_LaserNode.ts';
import '../../../../src/game/Thing/Object/CThing_Object_Mine.ts';
import '../../../../src/game/Thing/Object/CThing_Object_Pickup.ts';
import '../../../../src/game/Thing/Object/CThing_Object_Wall.ts';
import '../../../../src/game/Thing/Object/CThing_Object_WallMovable.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_Bullet.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_ClusterShell.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_DLaser.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_Devastator.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_FireBall.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_Grenade.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_HomingMissile.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_Laser.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_Railgun.ts';
import '../../../../src/game/Thing/Shot/CThing_Shot_Rocket.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Barrel.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_ChargePack.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Devastator.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_FakeWall.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Grenade.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Mine.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Pistol.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Railgun.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Rocket.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_Shotgun.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_SmartBomb.ts';
import '../../../../src/game/Thing/Weapon/CThing_Weapon_UZI.ts';
import { CInput, CMain, CSaveData, CSound, DrawPrimitive, Thing, World, registerGameClass } from '../../../../src/game/packages.ts';
import { BitmapData } from '../../../../src/engine/flash/BitmapData.ts';
import { Point, Rectangle } from '../../../../src/engine/flash/geom.ts';
import { setRoot } from '../../../../src/engine/swf/Player.ts';

/** Every CSound sample played (sample key), in order. */
export const playedSounds: string[] = [];

/** Fake keyboard key with the CInput key interface used by the Thing code. */
export class FakeKey {
  down = false;
  pressed = false;
  released = false;
  mTimeDown = 0;
  mTimePressed = 0;
  renews = 0;
  IsDown(): boolean { return this.down; }
  /** Latched like CInput: true once per press. */
  IsPressed(): boolean { const r = this.pressed; this.pressed = false; return r; }
  IsReleased(): boolean { const r = this.released; this.released = false; return r; }
  Renew(): void { this.renews++; this.pressed = false; this.released = false; }
}

/** Fake CDrawPrimitive_MovieClip_* (Static / Animation / Directional / OmniDirectional). */
export class FakeMovieClipPrimitive {
  static created: string[] = [];
  linkage: string;
  frames = 10;
  pos = 0;
  constructor(linkage?: string, _n?: number) {
    this.linkage = linkage ?? '';
    FakeMovieClipPrimitive.created.push(this.linkage);
  }
  Clone(): FakeMovieClipPrimitive { const c = Object.create(FakeMovieClipPrimitive.prototype); c.linkage = this.linkage; c.frames = this.frames; c.pos = 0; return c; }
  Animate(s: number): boolean { this.pos += s; if (this.pos >= this.frames) { this.pos = this.frames; return true; } return false; }
  Animate_Cycle(s: number): void { this.pos = (this.pos + s) % this.frames; }
  Animate_Random(): void { this.pos = 0; }
  GotoToFrame(f: number): void { this.pos = f; }
  __get__mFrameAmount(): number { return this.frames; }
  Render(): void { /* headless */ }
}

/** Fake XSI animation object (CDrawPrimitive_XSI_Animation.CreateAnimationObject result). */
export class FakeXSIAnimation {
  anim: any = undefined;
  frame = 0;
  /** Animate() returns true when this many frames were played (dying / attack animations end). */
  length = 3;
  SetAnimation(name: any, frame?: any): void { this.anim = name; this.frame = frame ?? 0; }
  Animate(s: number): boolean { this.frame += s; return this.frame >= this.length; }
  QAnimate(s: number): void { this.frame += s; }
  Animate_RetObj(s: number): any {
    const before = Math.floor(this.frame);
    this.frame += s;
    const now = Math.floor(this.frame);
    return { mNewFrame: now != before, mFrameIndex: now, mAnimEnd: this.frame >= this.length };
  }
  Update_CurrentFrame(): void {}
  /** Like the real data: every frame has the hand nodes; only the gun animations have XSI_Model_GunPosition_Right. */
  __get__XSI_Info(): any {
    return {
      XSI_Model_Hand_Right: { nPosition: new Thing.Math.CThing_Position(0.25, 0.1, -0.8) },
      XSI_Model_Hand_Left: { nPosition: new Thing.Math.CThing_Position(0.25, -0.1, -0.8) },
    };
  }
  Render(): void {}
}

let installed = false;

/** Install fakes for the classes these tests do not load (idempotent). */
export function installFakes(): void {
  BitmapData.headless = true;
  setRoot({ _quality: 'HIGH' } as any);
  if (installed) return;
  installed = true;
  for (const n of ['CDrawPrimitive_MovieClip_Static', 'CDrawPrimitive_MovieClip_Animation', 'CDrawPrimitive_MovieClip_Directional', 'CDrawPrimitive_MovieClip_OmniDirectional']) {
    if (!(DrawPrimitive.MovieClip as any)[n]) registerGameClass('DrawPrimitive.MovieClip.' + n, FakeMovieClipPrimitive);
  }
  if (!DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation) {
    registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation', {
      CreateAnimationObject: (_c: any) => new FakeXSIAnimation(),
      Load: (linkID: any, id: any) => ({ linkID, id }),
    });
  }
  if (!DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection) {
    registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection', class {
      items: any[] = [];
      mimic: any[] = [];
      AddItem(i: any): void { this.items.push(i); }
      MimicItem(a: any, b: any): void { this.mimic.push([a, b]); }
    });
  }
  if (!DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet) {
    const noop = (): void => {};
    registerGameClass('DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet', { SS_SWAT: noop, SS_BOND: noop, SS_GIJOE: noop, SS_BAMBO: noop, SS_ZOMBIE: noop, SS_DEVIL: noop });
  }
  if (!DrawPrimitive.CDrawPrimitive_Line) registerGameClass('DrawPrimitive.CDrawPrimitive_Line', { Draw: () => {} });
  if (!CSound) {
    registerGameClass('CSound', {
      mSamples: new Proxy({}, { get: (_t, k) => ({ PlaySound: () => { playedSounds.push(String(k)); } }) }),
    });
  }
  if (!CInput) registerGameClass('CInput', { ToAscii: (c: string) => c.toUpperCase().charCodeAt(0) });
  if (!CSaveData) registerGameClass('CSaveData', { mDefaultQuality: 'HIGH' });
  if (!CMain) {
    const input: any = { AddAdditionKeyCode: () => {} };
    for (const post of ['', '2']) {
      for (const k of ['LEFT', 'RIGHT', 'UP', 'DOWN', 'FIRE', 'NEXT_WEAPON', 'PREV_WEAPON']) input['KEY_' + k + post] = new FakeKey();
      for (let i = 0; i < 10; i++) input['KEY_SELECT' + i + post] = new FakeKey();
    }
    registerGameClass('CMain', {
      mFPS: 25,
      mInput: input,
      mSaveData: { mPlayer1_CharacterIndex: 0, mPlayer2_CharacterIndex: 1, mCollisionsActive: true },
    });
  }
  if (!World.CWorld) registerGameClass('World.CWorld', { mGameMode: 'Single' });
}

/** Records of the world callbacks the Thing code makes. */
export interface FakeWorld {
  [k: string]: any;
}

/** A fake CWorld around a REAL CMap (lane F1) + CThing_Collection for a W x H cell room. */
export function makeWorld(w: number, h: number, opts: { players?: number } = {}): FakeWorld {
  installFakes();
  const messages: any[] = [];
  const world: FakeWorld = {
    mArea: new Rectangle(0, 0, w * 32, h * 32),
    mDrawPosition: new Point(0, 0),
    mBrightness: 0,
    messages,
    kills: [] as any[],
    shakes: 0,
    mZombie_DrawCount: 0,
    mZombie_AvgPosition: new Point(0, 0),
    mUpgrades: {
      registered: [] as any[],
      Register_Weapon(t: any) { this.registered.push(t); },
      Register_Object(t: any) { this.registered.push(t); },
      Register_Creature_Zombie(t: any) { this.registered.push(t); },
      Register_Creature_Player(t: any) { this.registered.push(t); },
      ApplyUpgrade_Weapon() {},
      ApplyUpgrade_Object() {},
      __get__mTotalPlayerCount: () => opts.players ?? 1,
      mPlayerCount: 1,
      __get__mPlayerCount() { return this.mPlayerCount; },
      __set__mPlayerCount(v: any) { this.mPlayerCount = v; },
    },
    mHud: {
      AddMessage_Info: (m: any, i?: any) => messages.push(['info', m, i]),
      AddMessage_Critical: (m: any) => messages.push(['critical', m]),
      AddPlayer() {},
      DeletePlayer() {},
    },
    TrackThing() {},
    LogKill(t: any) { world.kills.push(t); },
    PlayerDead() {},
    Spawn_Player_PositionObject: () => undefined,
    Shake() { world.shakes++; },
    GetScreenPosition: (p: any) => new Point(p.mX * 32, p.mY * 32),
    bmCurrentDraw: {},
    mcScratch: {},
  };
  world.mMap = new World.Map.CMap(world);
  world.decals = [] as any[];
  world.mMap.mDecal = {
    Draw_BloodSplat: (p: any, n?: any) => world.decals.push(['blood', p.mX, p.mY, n]),
    Draw_ScorchMark: (p: any) => world.decals.push(['scorch', p.mX, p.mY]),
  };
  world.mThing_Collection = new Thing.CThing_Collection(world);
  return world;
}

export const P = (x: number, y: number, z = 0): any => new Thing.Math.CThing_Position(x, y, z);
export const A = (rads = 0): any => new Thing.Math.CThing_Angle(rads);
export { CMain, CSound, DrawPrimitive, Thing, World };
