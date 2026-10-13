import { describe, expect, it } from 'vitest';
import { SwfFile } from '../../../tools/swf/SwfFile.ts';
import { SWF_PATH, SWF_SHA256 } from '../../../tools/paths.ts';
import { inventory } from '../../../tools/inventory.ts';
import { getBuild } from './helpers.ts';

describe('SWF container + tag inventory', () => {
  const swf = SwfFile.fromPath(SWF_PATH);
  const inv = inventory(swf);

  it('is the expected original SWF', () => {
    expect(swf.sha256).toBe(SWF_SHA256);
    expect(inv.header).toMatchObject({ signature: 'CWS', version: 8, fileLength: 6477486, frameRate: 50, frameCount: 63 });
    expect(inv.header.frameSize).toEqual({ xMin: 0, xMax: 640, yMin: 0, yMax: 480 });
  });

  it('has the known top-level tag counts', () => {
    expect(inv.top).toMatchObject({
      DefineSprite: 374, DefineShape: 122, DefineShape2: 11, DefineShape3: 44, DefineShape4: 55,
      DefineMorphShape: 32, ExportAssets: 260, DoInitAction: 141, DoAction: 7, DefineSound: 31,
      DefineFont3: 8, DefineText: 124, DefineText2: 1, DefineEditText: 20, DefineButton2: 20,
      DefineBits: 8, JPEGTables: 1, DefineBitsLossless: 12, DefineBitsLossless2: 9, ShowFrame: 63,
      FrameLabel: 6, tag253: 159,
    });
  });

  it('has the known in-sprite tag counts', () => {
    expect(inv.inner).toMatchObject({
      PlaceObject2: 3963, PlaceObject3: 349, RemoveObject2: 60, DoAction: 18, StartSound: 32, ShowFrame: 1071, End: 374,
    });
  });
});

describe('library.json (buildLibrary)', () => {
  const { lib, ctx, raw } = getBuild();
  const chars = Object.values(lib.chars);
  const count = (t: string) => chars.filter((c) => c.t === t).length;

  it('parses every tag without warnings', () => {
    expect(ctx.warnings).toEqual([]);
  });

  it('has the expected character counts', () => {
    expect(Object.keys(lib.exports)).toHaveLength(260);
    expect(raw.exportTags).toBe(260);
    expect(count('shape')).toBe(232);
    expect(count('morph')).toBe(32);
    expect(count('sprite')).toBe(374);
    expect(count('bitmap')).toBe(29);
    expect(count('sound')).toBe(31);
    expect(count('font')).toBe(8);
    expect(chars.filter((c) => c.t === 'text' && c.ver === 1)).toHaveLength(124);
    expect(chars.filter((c) => c.t === 'text' && c.ver === 2)).toHaveLength(1);
    expect(count('edit')).toBe(20);
    expect(count('button')).toBe(20);
  });

  it('has the stage and root timeline', () => {
    expect(lib.stage).toEqual({ w: 640, h: 480, bg: [0, 0, 0, 255], frameRate: 50, frameCount: 63, swfVersion: 8 });
    expect(lib.root.frames).toHaveLength(63);
    expect(lib.root.labels).toEqual({ FLASH8: 1, START_LOAD: 10, LOADING: 20, AS2: 30, DATA: 40, LOADED: 50 });
  });

  it('records every action block', () => {
    const frame = lib.actions.filter((a) => a.kind === 'frame');
    expect(frame.filter((a) => a.spriteId === 0)).toHaveLength(7);
    expect(frame.filter((a) => a.spriteId !== 0)).toHaveLength(18);
    expect(lib.actions.filter((a) => a.kind === 'init')).toHaveLength(141);
    // every frame action is referenced from exactly its frame
    for (const [i, a] of lib.actions.entries()) {
      if (a.kind !== 'frame') continue;
      const s = a.spriteId === 0 ? lib.root : lib.chars[a.spriteId];
      expect(s.t).toBe('sprite');
      if (s.t === 'sprite') expect(s.frames[a.frame! - 1].actions).toContain(i);
    }
    // the XSI data DoAction (sprite 755) is the 4.6 MB block
    expect(frame.find((a) => a.spriteId === 755)?.length).toBe(4643890);
  });

  it('timelines match the in-sprite tag counts', () => {
    let place = 0, remove = 0, frames = 0, sounds = 0;
    for (const c of chars) {
      if (c.t !== 'sprite') continue;
      frames += c.frames.length;
      for (const f of c.frames) {
        for (const op of f.ops) if (op.op === 'place') place++; else remove++;
        sounds += f.sounds?.length ?? 0;
      }
    }
    expect(place).toBe(3963 + 349);
    expect(remove).toBe(60);
    expect(sounds).toBe(32);
    expect(frames).toBe(1071);
  });

  it('every placed character / export exists', () => {
    for (const id of Object.values(lib.exports)) expect(lib.chars[id], `export ${id}`).toBeDefined();
    for (const c of [...chars, lib.root]) {
      if (c.t !== 'sprite') continue;
      for (const f of c.frames) for (const op of f.ops) if (op.op === 'place' && op.id !== undefined) expect(lib.chars[op.id], `${c.id} -> ${op.id}`).toBeDefined();
    }
  });
});
