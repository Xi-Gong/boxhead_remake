// Lane V (visual fidelity): the scene list drives BOTH the original game (AS1 driver injected into a SWF copy by
// tools/oracle/visual/buildScene.ts) and the remake (src/dev/scenes.ts). These checks keep the two in step without a
// browser or a Flash Player: every scene compiles to AVM1 bytecode, uses only ops both drivers implement, and the
// expected-difference masks stay on the stage.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENES, getScene } from '../../../src/dev/sceneList.ts';
import { buildSceneSwf, sceneSoName, sceneSource } from '../../../tools/oracle/visual/buildScene.ts';
import { compileAS } from '../../../tools/oracle/as1c.ts';

const ROOT = resolve(__dirname, '../../..');
const OPS = ['state', 'screenCall', 'save', 'noSpawn', 'pause', 'complete', 'waitScreen', 'waitState', 'waitTick', 'waitFrames', 'call', 'set', 'key', 'waitAtLeast'];

describe('visual scenes (src/dev/sceneList.ts)', () => {
  it('ids are unique and resolvable', () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getScene(id)?.id).toBe(id);
  });

  it('every scene compiles to an AS1 driver (as1c) with its own SharedObject channel', () => {
    for (const s of SCENES) {
      const src = sceneSource(s);
      expect(src).toContain(`"${sceneSoName(s)}"`);
      expect(() => compileAS(src)).not.toThrow();
    }
  });

  it('every op used by a scene is implemented by both drivers', () => {
    const remake = readFileSync(resolve(ROOT, 'src/dev/scenes.ts'), 'utf8');
    const original = readFileSync(resolve(ROOT, 'tools/oracle/visual/buildScene.ts'), 'utf8');
    for (const op of OPS) {
      expect(remake, `src/dev/scenes.ts handles ${op}`).toContain(`case '${op}':`);
      expect(original, `buildScene.ts handles ${op}`).toContain(`case '${op}':`);
    }
    for (const s of SCENES) for (const st of s.steps) expect(OPS).toContain(st.op);
  });

  it('room scenes stop random spawns and the AS driver ignores real key presses', () => {
    for (const s of SCENES.filter((x) => x.steps.some((st) => st.op === 'waitTick'))) {
      expect(s.steps[0]).toEqual({ op: 'noSpawn' });
    }
    expect(sceneSource(SCENES[0]!)).toContain('Key.isDown = function (k) { return false; };');
  });

  it('masks lie on the 640x480 stage', () => {
    for (const s of SCENES) for (const m of s.masks ?? []) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.x + m.w).toBeLessThanOrEqual(640);
      expect(m.y + m.h).toBeLessThanOrEqual(480);
    }
  });

  it('the injected SWF is a valid compressed SWF 8 copy of the game', () => {
    const swf = buildSceneSwf(getScene('main')!);
    expect(String.fromCharCode(swf[0]!, swf[1]!, swf[2]!)).toBe('CWS');
    expect(swf[3]).toBe(8);
  });
});
