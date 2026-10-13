// Lane F1: room markers (World/Init) and MovieClip primitives on lane E's display list with the real library.json
// (headless BitmapData).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './f1Modules.ts';
import { installStubs } from './f1Modules.ts';
import { DrawPrimitive, Thing, World } from '../../../../src/game/packages.ts';
import type { LibraryJson } from '../../../../src/shared/assetSchema.ts';
import { BitmapData } from '../../../../src/engine/flash/BitmapData.ts';
import { Rectangle } from '../../../../src/engine/flash/geom.ts';
import {
  Player, _root, clearFrameScripts, clearRegisteredClasses, registerClass, setScriptErrorHandler,
} from '../../../../src/engine/swf/Player.ts';
import { engine } from '../../../../src/engine/swf/state.ts';

const libFile = resolve(__dirname, '../../../../public/assets/library.json');
const have = existsSync(libFile);

/**
 * TODO(lane C): BitmapData.copyPixels with an alphaBitmap on the headless NullBacking currently throws
 * "ReferenceError: document is not defined" (copyMasked -> ScratchPool.acquire -> createCanvas). The decal-mask
 * stamping checks below run automatically once that path is a no-op headless.
 */
function maskedCopyWorksHeadless(): boolean {
  const keep = BitmapData.headless;
  BitmapData.headless = true;
  try {
    const dst = new BitmapData(4, 4, false, 0);
    const src = new BitmapData(2, 2, true, 0);
    const mask = new BitmapData(4, 4, true, 0, { scale: 1, alphaOnly: true });
    dst.copyPixels(src, src.rectangle, { x: 1, y: 1 } as any, mask, { x: 1, y: 1 } as any, true);
    return true;
  } catch {
    return false;
  } finally {
    BitmapData.headless = keep;
  }
}
const maskedCopyOK = maskedCopyWorksHeadless();

describe.skipIf(!have)('World/Init markers + MovieClip primitives (real library, headless)', () => {
  let lib: LibraryJson;
  const warn = console.warn;

  beforeAll(() => {
    BitmapData.headless = true;
    console.warn = () => {};
    installStubs();
    lib = JSON.parse(readFileSync(libFile, 'utf8')) as LibraryJson;
    clearRegisteredClasses();
    clearFrameScripts();
    setScriptErrorHandler((e) => { throw e; });
    engine.warned.add('*');
    // Object.registerClass(linkage, World.Init.*) as in the DoInitAction scripts (library.json `classes`)
    for (const [linkage, cls] of Object.entries(lib.classes)) {
      if (!cls.startsWith('World.Init.')) continue;
      registerClass(linkage, (World.Init as any)[cls.slice('World.Init.'.length)]);
    }
    Player.fromJson(lib).enterFrame();
  });
  afterAll(() => {
    BitmapData.headless = false;
    console.warn = warn;
  });

  function fakeWorld(): any {
    const w: any = _root.createEmptyMovieClip('FakeWorld', _root.getNextHighestDepth());
    w._CLASSID_ = 'CWorld';
    w.AddInitObject = function (this: any, t: any): void { // World/CWorld.as:345 AddInitObject
      t._visible = false;
      this.mInitList = this.mInitList != undefined ? this.mInitList : new Array();
      this.mInitList.push(t);
    };
    return w;
  }

  it('room 1 (BOXY): markers find the CWorld and register (zombie/devil/P2/barrel/wall/pickup = 4/4/7/12/0/2)', () => {
    const w = fakeWorld();
    const room = w.attachMovie('ROOM_Single_0001', '_RoomData', w.getNextHighestDepth());
    expect(room).toBeDefined();
    const list: any[] = w.mInitList;
    expect(list.length).toBeGreaterThan(0);
    const count = (id: string): number => list.filter((t) => t._CLASSID_ == id).length;
    expect([count('CWorld_Init_Zombie'), count('CWorld_Init_Devil'), count('CWorld_Init_Player2'), count('CWorld_Init_Barrel'),
      count('CWorld_Init_Wall'), count('CWorld_Init_Pickup')]).toEqual([4, 4, 7, 12, 0, 2]);
    expect(count('CWorld_Init_Player1')).toBeGreaterThanOrEqual(1);
    expect(count('CWorld_Init_CollisionSolid')).toBeGreaterThan(0);
    for (const t of list) {
      expect(t.mWorld).toBe(w);
      expect(t._visible).toBe(false);
      expect(t._BASECLASSID_).toBe('CWorld_Init');
      expect(t).toBeInstanceOf(World.Init.CWorld_Init);
    }
    // positions in world space -> cells inside the 22 x 17 map
    const area = new Rectangle(0, 0, room._Size._width, room._Size._height);
    const map = new World.Map.CMap({ mArea: area });
    expect([map.mSize.x, map.mSize.y]).toEqual([22, 17]);
    for (const t of list) {
      const p = t.mPosition.ConvertScreenToCell();
      expect(p.mX).toBeGreaterThanOrEqual(0);
      expect(p.mX).toBeLessThanOrEqual(22);
      expect(p.mY).toBeGreaterThanOrEqual(0);
      expect(p.mY).toBeLessThanOrEqual(17);
      expect(t.mAngle).toBeInstanceOf(Thing.Math.CThing_Angle);
    }
    // CWorld.InitThings: CollisionSolid -> MarkArea_PP(round(p1), round(p2)), solid cells appear inside the map
    const S = World.Map.CMap_Cell.mCollide_Solid;
    const before = map.mCells.flat().filter((c: any) => c.mCollide & S).length;
    for (const t of list) {
      if (t._CLASSID_ != 'CWorld_Init_CollisionSolid') continue;
      map.mCollide.MarkArea_PP(t.mPosition.ConvertScreenToCell().Round(), t.mPosition2.ConvertScreenToCell().Round(), S);
    }
    const after = map.mCells.flat().filter((c: any) => c.mCollide & S).length;
    expect(after).toBeGreaterThan(before); // interior blocks of room 1
    // scenery pieces stamp into the floor / decal mask / cover bitmaps without errors
    w.bmFloor = new BitmapData(area.width, area.height, false, 0xffff0000);
    w.bmDecalMask = new BitmapData(area.width, area.height, true, 0, { scale: 1, alphaOnly: true });
    w.bmCover = new BitmapData(area.width, area.height, true, 0x00ff00);
    for (const t of list) if (t._CLASSID_ == 'CWorld_Init_Piece') t.Draw();
    DrawPrimitive.CDrawPrimitive.InvertAlpha(w.bmDecalMask);
    expect(String(list[0])).toMatch(/^CWorld_Init_\w+,-?\d/);
    w.removeMovieClip();
  });

  it('a marker outside any CWorld does not throw (AS2 call on undefined)', () => {
    const holder: any = _root.createEmptyMovieClip('NoWorld', _root.getNextHighestDepth());
    const room = holder.attachMovie('ROOM_Single_0001', '_RoomData', 1);
    expect(room).toBeDefined();
    holder.removeMovieClip();
  });

  it('CDrawPrimitive_MovieClip_Animation / Directional / OmniDirectional rasterise library symbols once', () => {
    const before = _root.getNextHighestDepth();
    const anim = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Animation('Effect.BulletHit');
    expect(anim.bmList.length).toBeGreaterThan(0);
    for (const o of anim.bmList) {
      expect(o.sBMD).toBeInstanceOf(BitmapData);
      expect(o.sBMD.width).toBeGreaterThanOrEqual(16); // bounds + 2 * mInflateBMD (8)
    }
    const clone = anim.Clone();
    expect(clone.bmList).toBe(anim.bmList);
    expect(clone.Animate(anim.bmList.length + 1)).toBe(true);
    expect(clone.bmObject).toBe(anim.bmList[anim.bmList.length - 1]);
    // temp clip removed again
    expect(_root.getInstanceAtDepth(before)).toBeUndefined();

    DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.y = 0.6;
    const dir = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Directional('Effect.BloodSplat', 3);
    expect(dir.bmList.length).toBe(3);
    expect(dir.mFrameAmount).toBe(dir.bmList[0].length);
    expect([DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.x, DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip.pGlobalScale.y]).toEqual([1, 1]);
    dir.Animate_Random();
    expect(dir.mAnimationPosition).toBeLessThan(dir.mFrameAmount);

    const omni = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_OmniDirectional('Pistol.MuzzleFlash', 8);
    expect(omni.bmList.length).toBe(8);
    const target = new BitmapData(64, 64, true, 0);
    Thing.Math.CThing_Angle.Create_LookupTables();
    expect(omni.Render(target, { x: 32, y: 32 }, new Thing.Math.CThing_Angle(Math.PI / 2), 100)).toBe(true);
    expect(omni.Render(target, { x: 32, y: 32 }, new Thing.Math.CThing_Angle(Math.PI / 2), 50)).toBe(true);

    const stat = new DrawPrimitive.MovieClip.CDrawPrimitive_MovieClip_Static('Effect.BulletHit');
    expect(stat.bmObject.sBMD).toBeInstanceOf(BitmapData);
  });

  it.skipIf(!maskedCopyOK)('CMap_Decal draws blood splats / scorch marks into the world floor through the decal mask', () => {
    const map = new World.Map.CMap({ mArea: new Rectangle(0, 0, 320, 320) });
    map.mWorld.bmFloor = new BitmapData(320, 320, false, 0xff000000);
    map.mWorld.bmDecalMask = new BitmapData(320, 320, true, 0, { scale: 1, alphaOnly: true });
    World.Map.CMap_Decal.bmBloodSplat = undefined;
    expect(() => map.mDecal.Draw_BloodSplat(new Thing.Math.CThing_Position(4.5, 4.5, 0), 2)).not.toThrow();
    expect(World.Map.CMap_Decal.bmBloodSplat.bmList.length).toBe(3);
    expect(() => map.mDecal.Draw_ScorchMark(new Thing.Math.CThing_Position(2.5, 2.5, 0))).not.toThrow();
    expect(World.Map.CMap_Decal.bmScorchMark.bmList.length).toBe(3);
  });
});
