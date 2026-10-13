// Lane F1: XSI character pipeline (xsi.json -> CDrawPrimitive_XSI_DI -> style sheet -> animations -> render stack),
// headless (BitmapData NullBacking) on lane E's display list with the real library.json.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import './f1Modules.ts';
import { installStubs } from './f1Modules.ts';
import { DrawPrimitive, Thing } from '../../../../src/game/packages.ts';
import { buildXsiItems, installXsiData, xsiForIn } from '../../../../src/game/DrawPrimitive/XSI/xsiData.ts';
import type { LibraryJson, XsiJson } from '../../../../src/shared/assetSchema.ts';
import { BitmapData } from '../../../../src/engine/flash/BitmapData.ts';
import { Player, clearFrameScripts, clearRegisteredClasses, setScriptErrorHandler } from '../../../../src/engine/swf/Player.ts';
import { _global } from '../../../../src/engine/flash/as2.ts';
import { engine } from '../../../../src/engine/swf/state.ts';
import { getTimer } from '../../../../src/engine/flash/clock.ts';

const xsiFile = resolve(__dirname, '../../../../public/assets/xsi.json');
const libFile = resolve(__dirname, '../../../../public/assets/library.json');
const have = existsSync(xsiFile) && existsSync(libFile);

describe.skipIf(!have)('XSI data + renderer (headless)', () => {
  let json: XsiJson;
  let di: any;
  const warn = console.warn;

  beforeAll(() => {
    BitmapData.headless = true;
    console.warn = () => {};
    installStubs();
    json = JSON.parse(readFileSync(xsiFile, 'utf8')) as XsiJson;
    const lib = JSON.parse(readFileSync(libFile, 'utf8')) as LibraryJson;
    clearRegisteredClasses();
    clearFrameScripts();
    setScriptErrorHandler((e) => { throw e; });
    engine.warned.add('*');
    const p = Player.fromJson(lib);
    p.enterFrame();
  });
  afterAll(() => {
    BitmapData.headless = false;
    console.warn = warn;
  });

  it('xsiData rebuilds _global.mXSI_Data.mItems with the stored $ key order', () => {
    const data = installXsiData(json);
    expect(_global.mXSI_Data).toBe(data);
    const items = data.mItems;
    expect(items.length).toBe(40);
    expect([items[0].mGroupID, items[0].mAnimID]).toEqual(['Player', 'Stand']);
    expect(items[1].mFrameSquence).toEqual([0, 1, 2, 3, 4, 3, 2, 1]);
    expect(Object.keys(items[1])).toEqual(['mFrameSquence', 'mXSI', 'mAnimID', 'mGroupID']); // creation order
    const models = items[1].mXSI.mRotations[0][0].Models; // Player_Walk d0 f0 (xsi-summary.md §6)
    expect(Object.keys(models)).toEqual(['Foot_Left', 'Hand_Left', 'LowerArm_Left', 'Foot_Right', 'UpperArm_Left', 'Body',
      'Hand_Right', 'Body_Back', 'Body_Front', 'LowerArm_Right', 'UpperArm_Right', 'Head']);
    // paint order: newest first -> Head gets plane 0 (front), Foot_Left the last plane (back)
    expect(xsiForIn(models)[0]).toBe('Head');
    expect(xsiForIn(models).at(-1)).toBe('Foot_Left');
    expect(xsiForIn(models.Head.Shape_vList)).toEqual(['5', '4', '3', '2', '1', '0']);
    let frames = 0;
    for (const it of items) for (const dir of it.mXSI.mRotations) frames += dir.length;
    expect(frames).toBe(json.stats.directionFrames);
  });

  it('CDrawPrimitive_XSI_DI compiles 40 animation sets, merges materials and builds the hidden container', () => {
    const items = buildXsiItems(json);
    di = new DrawPrimitive.XSI.CDrawPrimitive_XSI_DI(items);
    const DI = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
    expect(DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet.mXSI_DI).toBe(di);
    expect(Object.keys(DI.mAnimationSets).length).toBe(40);
    expect(di.mTotalFrames).toBe(936);
    expect(Object.keys(DI.mGroups).sort()).toEqual(['Devil', 'Player', 'Player_Alternate1', 'Player_Handgun', 'Player_Railgun',
      'Player_Rocket', 'Player_Shotgun', 'Player_UZI', 'Zombie']);
    const walk = DI.mAnimationSets.Player_Walk;
    expect(walk.mDirections.length).toBe(8);
    expect(walk.mDirections[3][2].mDirection).toBe(3);
    expect(walk.mDirections[3][2].mFrameIndex).toBe(2);
    expect(walk.mTilt).toBeCloseTo(Math.PI / 4, 12);
    expect(DI.mAnimationSets.Player_Handgun_Walk.mDirections[0][0].rPartner).toBe('Player');
    expect(Object.keys(di.mMasterMaterials).length).toBe(23);
    expect(di.mMaterials).toBe(di.mMasterMaterials);
    expect(di.mMasterMaterials.Head_Front.sBMD).toBeInstanceOf(BitmapData);
    expect([di.mMasterMaterials.Head_Front.sBMD.width, di.mMasterMaterials.Head_Front.sBMD.height]).toEqual([64, 64]);
    expect(di.mcContainer._visible).toBe(false);
    expect(di.mcShadow.filters.length).toBe(1);
    expect(di.mRenderFlags).toBe(1 | 4 | 16 | 32);
  });

  it('SS_BAMBO + Load(): 16-direction stand and 8x[0,1,2,3,4,3,2,1] walk; frames queued then rendered', () => {
    const DI = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
    const SS = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet;
    DI.mRenderStack = new Array();
    const col = new DrawPrimitive.XSI.CDrawPrimitive_XSI_Collection();
    SS.SS_BAMBO();
    const sheet = di.mStyleSheet;
    expect(sheet.mID).toBe('SS_BAMBO');
    expect(sheet.mScale).toBe(0.35);
    expect(sheet.mModels.GunPosition_Right.mVisible).toBe(false);
    expect(sheet.mModels.Head.mVisible).toBe(true);
    expect(sheet.mMaterials.Head_Front.mcLinkID).toBe('Bambo_Head_Front');
    expect(sheet.mMaterials.Bandana.mColor).toBe(0xff0000);
    expect(sheet.mScalarMatrix.a).toBe(0.35);
    const XA = DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation;
    const stand = XA.Load('Player_Stand', 'stand');
    const walk = XA.Load('Player_Walk', 'walk');
    col.AddItem(stand);
    col.AddItem(walk);
    col.MimicItem('pistolstand', 'stand');
    expect(col.mItems.pistolstand).toBe(stand);
    expect(stand.mAnimationObject.mDirections.length).toBe(16);
    expect(stand.mAnimationObject.mFrameCount).toBe(1);
    expect(stand.mAnimationObject.mLookup256).toBe(Thing.Math.CThing_Angle.mLookup256[16]);
    const wo = walk.mAnimationObject;
    expect(wo.mDirections.length).toBe(8);
    expect(wo.mFrameCount).toBe(8);
    for (const d of wo.mDirections) {
      expect(d.mFrames.length).toBe(8);
      expect([d.mFrames[5], d.mFrames[6], d.mFrames[7]]).toEqual([d.mFrames[3], d.mFrames[2], d.mFrames[1]]);
      expect(new Set(d.mFrames).size).toBe(5);
    }
    expect(DI.mRenderStack.length).toBe(16 + 8 * 5);
    expect(DI.RenderStack_Finished()).toBe(false);
    const f0 = wo.mDirections[0].mFrames[0];
    expect(f0.sBMD).toBeUndefined();
    expect(f0.renderInfo.mStyleSheet).toBe(sheet);
    // FillXSIInfo: hand anchors present, GunPosition_Right absent in Player_Walk -> NaN (AS2 undefined reads)
    expect(Number.isFinite(f0.XSI_Info.XSI_Model_Hand_Right.vPosition.mX)).toBe(true);
    expect(Number.isNaN(f0.XSI_Info.XSI_Model_GunPosition_Right.vPosition.mX)).toBe(true);
    expect(Thing.Math.CThing_Position.mPFactor).toBeCloseTo(-Math.sin(Math.PI / 4), 12);

    expect(DI.RenderStack_Process(getTimer(), 1e9)).toBe(false);
    expect(DI.RenderStack_Finished()).toBe(true);
    for (const d of wo.mDirections) {
      for (const fr of d.mFrames) {
        expect(fr.sBMD).toBeInstanceOf(BitmapData);
        expect(fr.sBMD.width).toBeGreaterThan(10);
        expect(fr.sBMD.height).toBeGreaterThan(10);
        expect(Number.isFinite(fr.mDisp.x) && Number.isFinite(fr.mDisp.y)).toBe(true);
      }
    }
    // playback state
    const anim = XA.CreateAnimationObject(col);
    anim.SetAnimation('walk');
    expect(anim.mFrameCount).toBe(8);
    expect(anim.Animate(7.5)).toBe(false);
    expect(anim.Animate(1)).toBe(true); // wrapped past the end
    anim.Update_CurrentFrame(new Thing.Math.CThing_Angle(Math.PI / 2));
    expect(anim.mCurrentDirection).toBe(wo.mDirections[2]);
    expect(anim.XSI_Info).toBe(anim.mCurrentFrame.XSI_Info);
  });

  it('Render() draws the models into per-model planes (plane i at depth 10000 - i) with non-empty bounds', () => {
    const DI = DrawPrimitive.XSI.CDrawPrimitive_XSI_DI;
    const oFrame = DI.mAnimationSets.Player_Walk.mDirections[0][0];
    di.Render(oFrame);
    const names = xsiForIn(oFrame.Models);
    expect(di.mcPlanes.length).toBeGreaterThanOrEqual(names.length);
    expect(di.mcPlanes[0].getDepth()).toBe(10000);
    expect(di.mcPlanes[3].getDepth()).toBe(9997);
    const b = di.mcContainer.getBounds(di.mcContainer);
    expect(b.xMin).toBeLessThan(b.xMax);
    expect(b.yMin).toBeLessThan(b.yMax);
    expect(b.xMax - b.xMin).toBeLessThan(400);
    // the Head (plane 0) is drawn above the feet (last plane): its bounds are higher on screen
    const head = di.mcPlanes[0].getBounds(di.mcContainer);
    const foot = di.mcPlanes[names.length - 1].getBounds(di.mcContainer);
    expect(head.yMin).toBeLessThan(foot.yMin);
    const shadow = di.mcShadow.getBounds(di.mcShadow);
    expect(shadow.xMin).toBeLessThan(shadow.xMax);
    // RenderToBitmap: scaled bounds + inflate(2, 2), offset mDisp
    const anim = new DrawPrimitive.XSI.CDrawPrimitive_XSI_Animation();
    const bmo = di.RenderToBitmap(anim);
    const s = DrawPrimitive.XSI.CDrawPrimitive_XSI.mGlobalScale;
    expect(s).toBe(0.35);
    const w = Math.ceil((Math.ceil(b.xMax) - Math.floor(b.xMin)) * s + 4);
    expect(bmo.sBMD.width).toBe(w);
    expect(bmo.mDisp.x).toBe(Math.floor((Math.floor(b.xMin) - 2) * s));
  });

  it('other skins: SS_BOND / SS_ZOMBIE / SS_DEVIL apply (missing "Cloth" material is a silent no-op)', () => {
    const SS = DrawPrimitive.XSI.CDrawPrimitive_XSI_StyleSheet;
    expect(() => SS.SS_BOND()).not.toThrow();
    expect(di.mStyleSheet.mMaterials.Cloth).toBeUndefined();
    SS.SS_ZOMBIE();
    expect(di.mStyleSheet.mGroup_Remap).toBe('Zombie');
    expect(di.mStyleSheet.mModels.Weapon_Right.mVisible).toBe(false);
    SS.SS_DEVIL();
    expect(di.mStyleSheet.mScale).toBe(0.44);
    SS.SS_DEVIL(0.42);
    expect(di.mStyleSheet.mScale).toBe(0.42);
    SS.SS_DEFAULT();
    expect(di.mStyleSheet).toBeUndefined();
    expect(di.mMaterials).toBe(di.mMasterMaterials);
  });
});
