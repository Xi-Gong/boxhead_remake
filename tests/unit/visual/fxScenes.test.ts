// Lane X2: the EFFECT scene list (src/dev/fxSceneList.ts) drives both the original (AS1 driver injected by
// tools/oracle/visual/buildFxScene.ts) and the remake (src/dev/fxScenes.ts). Keep the two drivers in step without a
// browser or a Flash Player: every scene compiles to AVM1, every op is implemented on both sides, values are plain data.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_SCENES, getFxScene } from '../../../src/dev/fxSceneList.ts';
import { buildFxSceneSwf, fxSceneSource, fxSoName, valAS } from '../../../tools/oracle/visual/buildFxScene.ts';
import { compileAS } from '../../../tools/oracle/as1c.ts';

const ROOT = resolve(__dirname, '../../..');
const OPS = ['save', 'room', 'waitTick', 'waitFrames', 'seed', 'multiplier', 'new', 'set', 'call', 'noDecals', 'decal', 'xsi'];

describe('fx scenes (src/dev/fxSceneList.ts)', () => {
  it('ids are unique, start with fx- and are resolvable', () => {
    const ids = FX_SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith('fx-')).toBe(true);
      expect(getFxScene(id)?.id).toBe(id);
    }
  });

  it('every scene is plain JSON data and compiles to an AS1 driver with its own oracle_fx_ SharedObject', () => {
    for (const s of FX_SCENES) {
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      const src = fxSceneSource(s);
      expect(src).toContain(`"${fxSoName(s)}"`);
      expect(fxSoName(s).startsWith('oracle_fx_')).toBe(true);
      expect(() => compileAS(src), s.id).not.toThrow();
    }
  });

  it('every op is implemented by both drivers', () => {
    const remake = readFileSync(resolve(ROOT, 'src/dev/fxScenes.ts'), 'utf8');
    const original = readFileSync(resolve(ROOT, 'tools/oracle/visual/buildFxScene.ts'), 'utf8');
    for (const op of OPS) {
      expect(remake, `fxScenes.ts handles ${op}`).toContain(`case '${op}':`);
      expect(original, `buildFxScene.ts handles ${op}`).toContain(`case '${op}':`);
    }
    for (const s of FX_SCENES) for (const st of s.steps) expect(OPS).toContain(st.op);
  });

  it('values compile to the expected AS1 expressions', () => {
    expect(valAS(-1.5)).toBe('(-1.5)');
    expect(valAS({ pos: [1, 2] })).toBe('__pos(1, 2, 0)');
    expect(valAS({ angle: 0.5 })).toBe('__ang(0.5)');
    expect(valAS({ g: 'Thing.Shot.CThing_Shot_Rocket.mcDrawObject_Cache', call: 'Clone' })).toBe('_global.Thing.Shot.CThing_Shot_Rocket.mcDrawObject_Cache.Clone()');
    expect(valAS({ ref: 'player0', path: 'mPosition', call: 'Clone' })).toBe('__ref("player0").mPosition.Clone()');
  });

  it('the injected SWF is a valid compressed SWF 8 copy of the game', () => {
    const swf = buildFxSceneSwf(FX_SCENES[0]!);
    expect(String.fromCharCode(swf[0]!, swf[1]!, swf[2]!)).toBe('CWS');
    expect(swf[3]).toBe(8);
  });
});
