import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AsValue, XsiJson } from '../../../src/shared/assetSchema.ts';
import { SWF_PATH } from '../../../tools/paths.ts';
import { SwfFile } from '../../../tools/swf/SwfFile.ts';
import { extractXsi } from '../../../tools/xsi/extractXsi.ts';
import { evaluateXsi } from '../../../tools/xsi/xsiScript.ts';
import type { XsiEvaluation } from '../../../tools/xsi/xsiScript.ts';
import {
  asArray, asGet, asKeys, computeXsiStats, frameModels, isAsObject, isEmptyModel, itemView,
} from '../../../tools/xsi/xsiModel.ts';
import type { XsiItemView } from '../../../tools/xsi/xsiModel.ts';

const WALK_SEQ = [0, 1, 2, 3, 4, 3, 2, 1];
const LIGHT = { mX: 0.17609018126512477, mY: 0.4402254531628119, mZ: -0.8804509063256238 };

describe('XSI data (sprite 755 DoAction → xsi.json)', () => {
  let swf: SwfFile;
  let ev: XsiEvaluation;
  let views: XsiItemView[];
  const byId = (id: string) => {
    const v = views.find((x) => x.id === id);
    if (!v) throw new Error(`no item ${id}`);
    return v;
  };
  const dims = (v: XsiItemView) => {
    const frames = new Set(v.rotations.map((d) => d.length));
    expect(frames.size).toBe(1); // every direction has the same frame count
    return `${v.rotations.length}x${v.rotations[0].length}`;
  };

  beforeAll(() => {
    swf = SwfFile.fromPath(SWF_PATH);
    ev = evaluateXsi(swf);
    views = ev.items.map((it, i) => itemView(it, i));
  });

  it('evaluates the expected script', () => {
    expect(ev.script.spriteId).toBe(755);
    expect(ev.script.length).toBe(4_643_890);
    expect(ev.vm.actions).toBe(236_323);
    expect(ev.vm.traces).toEqual(['IMPORTED XSI DATA! No. Items = 40']);
    expect(ev.vm.warnings).toEqual([]);
    expect(ev.vm.timeline.get('mLoaded')).toBe(true);
    expect(ev.sharedRefs).toBe(0);
    expect(Object.keys(ev.vm.opcodeCounts).sort()).toEqual([
      'Add2', 'CallMethod', 'ConstantPool', 'DefineLocal', 'GetMember', 'GetVariable', 'InitArray', 'InitObject',
      'NewObject', 'Pop', 'Push', 'SetMember', 'SetVariable', 'Trace',
    ]);
  });

  it('has the verified totals', () => {
    // polygons = Shape_vList entries of non-Empty models; vertices = Σ vList.length / 2 (see xsiModel.ts)
    expect(computeXsiStats(ev.items)).toEqual({ items: 40, directionFrames: 936, polygons: 18_479, vertices: 78_465 });
  });

  it('has the expected groups', () => {
    const counts: Record<string, number> = {};
    for (const v of views) counts[v.groupID] = (counts[v.groupID] ?? 0) + 1;
    expect(counts).toEqual({
      Player: 10, Player_Alternate1: 6, Player_Handgun: 2, Player_Railgun: 2, Player_Shotgun: 2, Player_Rocket: 2,
      Player_UZI: 2, Devil: 7, Zombie: 7,
    });
    expect(views.filter((v) => v.groupID === 'Player').every((v) => v.renderPartner === undefined)).toBe(true);
    expect(views.filter((v) => v.groupID !== 'Player').every((v) => v.renderPartner === 'Player')).toBe(true);
  });

  it('has the expected animation shapes (directions x frames, frame sequences)', () => {
    const expected: Record<string, string> = {
      Stand: '16x1', Zombie_Stand: '16x1', Walk: '8x5', Zombie_Walk: '8x5', HitFront: '8x2', HitRear: '8x2',
      Zombie_Attack: '8x4', Devil_Attack: '8x4', Dying: '4x5', Dead: '4x1',
    };
    for (const v of views) {
      // the one exception: Player_Zombie_Walk stores 8 frames per direction (frames 5..7 are never referenced)
      const want = v.id === 'Player_Zombie_Walk' ? '8x8' : expected[v.animID];
      expect(dims(v), v.id).toBe(want);
      if (v.animID === 'Walk' || v.animID === 'Zombie_Walk') expect(v.frameSequence, v.id).toEqual(WALK_SEQ);
      else expect(v.frameSequence, v.id).toBeUndefined();
    }
  });

  it('has the expected materials and XSI info', () => {
    const union = new Map<string, string>();
    for (const v of views) {
      const info = asGet(v.xsi, 'mXSIInfo');
      expect(asGet(info, 'mTilt')).toBe(45);
      const light = asGet(info, 'mLight');
      expect({ mX: asGet(light, 'mX'), mY: asGet(light, 'mY'), mZ: asGet(light, 'mZ') }).toEqual(LIGHT);
      const mats = asGet(v.xsi, 'mMaterials');
      for (const name of asKeys(mats)) {
        const def = JSON.stringify(asGet(mats, name));
        expect(union.get(name) ?? def, name).toBe(def); // same definition in every item
        union.set(name, def);
      }
    }
    expect(Math.hypot(LIGHT.mX, LIGHT.mY, LIGHT.mZ)).toBeCloseTo(1, 12);
    expect(asKeys(asGet(byId('Player_Stand').xsi, 'mMaterials')).sort()).toEqual([
      'Bandana', 'Body_Back', 'Body_Front', 'Body_Side', 'Body_Top', 'Edge', 'Foot', 'Hair', 'Hand', 'Head_Back',
      'Head_Front', 'Head_Side', 'LowerArm', 'PEdge', 'Shadow', 'UpperArm',
    ]);
    expect(union.size).toBe(23);
    const textured = [...union].filter(([, d]) => d.includes('mcLinkID')).map(([n]) => n).sort();
    expect(textured).toEqual(['Body_Back', 'Body_Front', 'Body_Side', 'Body_Top', 'Head_Back', 'Head_Front', 'Head_Side']);
    for (const n of textured) {
      expect(JSON.parse(union.get(n)!)).toEqual({ $: [['mSize', { $: [['y', 64], ['x', 64]] }], ['mcLinkID', `${n}_MC`]] });
    }
    expect(JSON.parse(union.get('PEdge')!)).toEqual({ $: [['mAlpha', 100], ['mColor', 0], ['mThickness', 2]] });
  });

  it('keeps InitObject creation order (paint-order evidence) and InitArray element order', () => {
    // Player_Walk direction 0 frame 0: stored order is back-to-front (head last)
    const m = frameModels(byId('Player_Walk').rotations[0][0]);
    expect(asKeys(m)).toEqual([
      'Foot_Left', 'Hand_Left', 'LowerArm_Left', 'Foot_Right', 'UpperArm_Left', 'Body', 'Hand_Right', 'Body_Back',
      'Body_Front', 'LowerArm_Right', 'UpperArm_Right', 'Head',
    ]);
    expect(asKeys(asGet(m, 'Head'))).toEqual([
      'Empty', 'XSIInfo', 'Edge', 'PEdge', 'Shadow', 'Shape_Brightness', 'Shape_vList', 'Shape_Matrix', 'Shape_Material',
    ]);
    expect(asGet(m, 'Body_Back')).toEqual({ $: [['Empty', true]] });
    // array order: Player_Stand dir 4 (facing the viewer), Head polygons
    const head = asGet(frameModels(byId('Player_Stand').rotations[4][0]), 'Head');
    expect(asGet(head, 'Shape_Material')).toEqual(['Hair', 'Hair', 'Bandana', 'Hair', 'Bandana', 'Head_Front', 'Head_Side']);
    expect(asGet(head, 'Shape_Brightness')).toEqual([-0.94, 0.31, -0.94, 0.16, 0.16, -0.94, 0.16]);
    expect(asGet(asGet(head, 'XSIInfo'), 'vPosition')).toEqual({ $: [['mZ', -120.3872], ['mY', -0.9159], ['mX', 0.084]] });
    // item key order (last written first)
    expect(asKeys(ev.items[byId('Player_Alternate1_Walk').index]))
      .toEqual(['mRenderPartner', 'mFrameSquence', 'mXSI', 'mAnimID', 'mGroupID']);
  });

  it('satisfies the structural invariants the renderer relies on', () => {
    let models = 0;
    for (const v of views) {
      for (const dir of v.rotations) {
        for (const frame of dir) {
          expect(asKeys(frame)).toEqual(['Models']);
          for (const [, model] of frameModels(frame).$) {
            if (isEmptyModel(model)) { expect(model).toEqual({ $: [['Empty', true]] }); continue; }
            models++;
            const vl = asArray(asGet(model, 'Shape_vList'));
            const mats = asArray(asGet(model, 'Shape_Material'));
            const mxs = asArray(asGet(model, 'Shape_Matrix'));
            const bri = asArray(asGet(model, 'Shape_Brightness'));
            expect(mats.length).toBe(vl.length);
            expect(mxs.length).toBe(vl.length);
            expect(bri.length).toBe(vl.length);
            expect(asGet(model, 'Edge')).toEqual([]);
            for (const poly of [...vl, ...asArray(asGet(model, 'Shadow')), ...asArray(asGet(model, 'PEdge'))]) {
              const a = asArray(poly) as number[];
              expect(a.length % 2).toBe(0);
              expect(a.length).toBeGreaterThanOrEqual(4);
              expect(a.every((x) => Number.isInteger(x))).toBe(true);
            }
            mxs.forEach((mx, i) => {
              const textured = ['Body_Back', 'Body_Front', 'Body_Side', 'Body_Top', 'Head_Back', 'Head_Front', 'Head_Side']
                .includes(mats[i] as string);
              if (textured) expect(asKeys(mx)).toEqual(['ty', 'tx', 'd', 'c', 'b', 'a']);
              else expect(mx).toBe(0);
            });
            expect(isAsObject(asGet(asGet(model, 'XSIInfo'), 'vPosition'))).toBe(true);
          }
        }
      }
    }
    expect(models).toBe(4584);
  });

  describe('extractXsi() output file', () => {
    let dir: string;
    beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'xsi-test-')); });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('writes xsi.json that round-trips the evaluated data', () => {
      const stats = extractXsi(swf, dir);
      expect(stats).toEqual({ items: 40, directionFrames: 936, polygons: 18_479, vertices: 78_465 });
      const text = readFileSync(join(dir, 'xsi.json'), 'utf8');
      expect(text.length).toBeLessThan(5_000_000);
      const json = JSON.parse(text) as XsiJson;
      expect(json.v).toBe(1);
      expect(json.stats).toEqual(stats);
      expect(computeXsiStats(json.items)).toEqual(stats);
      expect(json.items).toEqual(ev.items as AsValue[]);
    });
  });
});
