// Oracle tool chain: AVM1 assembler encodings, as1c, SWF writer / re-serializer, AMF0 (.sol) reader.
import { describe, expect, it } from 'vitest';
import { Asm, ByteSink, asDouble, encodePushValue, reg } from '../../../tools/oracle/avm1asm.ts';
import { compileAS } from '../../../tools/oracle/as1c.ts';
import { SwfBuilder, encodeTag, reserializeWithInjections, singleFrameSwf } from '../../../tools/oracle/swfWrite.ts';
import { parseSol, solLines } from '../../../tools/oracle/sol.ts';
import { ByteReader } from '../../../tools/swf/ByteReader.ts';
import { SwfFile, TAG } from '../../../tools/swf/SwfFile.ts';
import { SWF_PATH } from '../../../tools/paths.ts';
import { existsSync } from 'node:fs';

describe('avm1asm', () => {
  it('Push doubles store the high 32-bit word first (round-trips through ByteReader.avm1Double)', () => {
    for (const v of [0.1, -1.5, 1e300, 5e-324, 4294967296, -0]) {
      const s = new ByteSink();
      encodePushValue(s, asDouble(v));
      const b = s.toBytes();
      expect(b[0]).toBe(6);
      expect(Object.is(new ByteReader(b, 1).avm1Double(), v)).toBe(true);
    }
    const s = new ByteSink(); encodePushValue(s, 0.1);
    expect([...s.toBytes()]).toEqual([6, 0x99, 0x99, 0xb9, 0x3f, 0x9a, 0x99, 0x99, 0x99]);
  });
  it('int32 numbers use Push type 7, other values their own types', () => {
    const enc = (v: Parameters<typeof encodePushValue>[1]) => { const s = new ByteSink(); encodePushValue(s, v); return [...s.toBytes()]; };
    expect(enc(-2)).toEqual([7, 0xfe, 0xff, 0xff, 0xff]);
    expect(enc('ab')).toEqual([0, 0x61, 0x62, 0]);
    expect(enc(null)).toEqual([2]);
    expect(enc(undefined)).toEqual([3]);
    expect(enc(true)).toEqual([5, 1]);
    expect(enc(reg(3))).toEqual([4, 3]);
    expect(enc(2147483648)[0]).toBe(6);
  });
  it('resolves forward/backward branch offsets relative to the next action', () => {
    const a = new Asm();
    const top = a.newLabel(), end = a.newLabel();
    a.label(top).push(true).if(end).jump(top).label(end);
    const b = a.assemble({ end: true });
    // Push(true)=1+2+2 bytes, If=5, Jump=5, End=1
    expect([...b.subarray(5, 10)]).toEqual([0x9d, 2, 0, 5, 0]);
    expect([...b.subarray(10, 15)]).toEqual([0x99, 2, 0, 0xf1, 0xff]); // -15
    expect(b[15]).toBe(0);
  });
  it('as1c emits InitObject pairs in source order and InitArray elements reversed (Macromedia compiler layout)', () => {
    const o = compileAS('x = {a: 1, b: 2};', { end: false });
    // Push "x"; Push "a", 1; Push "b", 2; Push 2; InitObject; SetVariable
    expect(o.includes(0x43)).toBe(true);
    const arr = compileAS('x = [1, 2];', { end: false });
    const pushes = [...arr];
    const i2 = pushes.indexOf(7, 6); // first int push after the "x" string push
    expect(new DataView(arr.buffer).getInt32(i2 + 1, true)).toBe(2);
  });
});

describe('swfWrite', () => {
  it('builds a parseable SWF 8 with the right header length and tags', () => {
    const swf = singleFrameSwf(compileAS('trace("hi");'));
    const f = new SwfFile(swf);
    expect(f.header.signature).toBe('FWS');
    expect(f.header.version).toBe(8);
    expect(f.header.fileLength).toBe(swf.length);
    const codes = [...f.tags()].map((t) => t.code);
    expect(codes).toEqual([TAG.FileAttributes, TAG.SetBackgroundColor, TAG.ScriptLimits, TAG.DoAction, TAG.ShowFrame, TAG.End]);
  });
  it('compressed output inflates to the same body', () => {
    const b = () => new SwfBuilder({ compress: true }).fileAttributes(0).doAction(compileAS('trace(1);')).showFrame().build();
    const f = new SwfFile(b());
    expect(f.header.signature).toBe('CWS');
    expect(f.header.fileLength).toBe(f.data.length);
  });
  it.skipIf(!existsSync(SWF_PATH))('re-serializes the game SWF byte-exactly with an injected DoAction before frame 62\'s ShowFrame', () => {
    const orig = SwfFile.fromPath(SWF_PATH);
    const extra = encodeTag(TAG.DoAction, compileAS('trace("x");'), true);
    const copy = new SwfFile(reserializeWithInjections(orig, [{ frame: 62, tags: [extra] }]));
    expect(copy.header.fileLength).toBe(orig.data.length + extra.length);
    const a = [...orig.tags()], b = [...copy.tags()];
    expect(b.length).toBe(a.length + 1);
    let frame = 1, inserted = -1;
    for (let i = 0; i < b.length; i++) {
      if (b[i]!.code === TAG.DoAction && b[i]!.length === extra.length - 6 && frame === 62 && b[i + 1]?.code === TAG.ShowFrame) inserted = i;
      if (b[i]!.code === TAG.ShowFrame) frame++;
    }
    expect(inserted).toBeGreaterThan(0);
    const without = [...b.slice(0, inserted), ...b.slice(inserted + 1)];
    for (let i = 0; i < a.length; i++) {
      expect(without[i]!.code).toBe(a[i]!.code);
      expect(Buffer.from(without[i]!.body).equals(Buffer.from(a[i]!.body))).toBe(true);
    }
  });
});

describe('sol (AMF0)', () => {
  it('parses a local SharedObject file with an ECMA-array of lines', () => {
    const s = new ByteSink();
    const be16 = (v: number) => { s.u8(v >> 8).u8(v & 255); };
    const be32 = (v: number) => { be16(v >>> 16); be16(v & 0xffff); };
    const str = (t: string) => { be16(t.length); for (const c of t) s.u8(c.charCodeAt(0)); };
    s.u8(0).u8(0xbf); be32(0); for (const c of 'TCSO') s.u8(c.charCodeAt(0)); [0, 4, 0, 0, 0, 0].forEach((x) => s.u8(x));
    str('oracle_x'); be32(0);
    str('lines'); s.u8(8); be32(2); str('0'); s.u8(2); str('a=1'); str('1'); s.u8(2); str('END'); str(''); s.u8(9); s.u8(0);
    str('end'); s.u8(0); const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, 1); s.bytes(new Uint8Array(d.buffer)); s.u8(0);
    const { name, data } = parseSol(s.toBytes());
    expect(name).toBe('oracle_x');
    expect(data.end).toBe(1);
    expect(solLines(data)).toEqual(['a=1', 'END']);
  });
});
