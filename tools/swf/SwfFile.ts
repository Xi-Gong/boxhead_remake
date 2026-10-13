/**
 * SWF container: header parsing, decompression and raw tag iteration.
 * Tag-specific parsing lives in the other tools/swf/*.ts modules.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { ByteReader } from './ByteReader.ts';

export const TAG = {
  End: 0, ShowFrame: 1, DefineShape: 2, PlaceObject: 4, RemoveObject: 5, DefineBits: 6, DefineButton: 7,
  JPEGTables: 8, SetBackgroundColor: 9, DefineFont: 10, DefineText: 11, DoAction: 12, DefineFontInfo: 13,
  DefineSound: 14, StartSound: 15, DefineButtonSound: 17, SoundStreamHead: 18, SoundStreamBlock: 19,
  DefineBitsLossless: 20, DefineBitsJPEG2: 21, DefineShape2: 22, DefineButtonCxform: 23, Protect: 24,
  PlaceObject2: 26, RemoveObject2: 28, DefineShape3: 32, DefineText2: 33, DefineButton2: 34,
  DefineBitsJPEG3: 35, DefineBitsLossless2: 36, DefineEditText: 37, DefineSprite: 39, FrameLabel: 43,
  SoundStreamHead2: 45, DefineMorphShape: 46, DefineFont2: 48, ExportAssets: 56, ImportAssets: 57,
  EnableDebugger: 58, DoInitAction: 59, DefineVideoStream: 60, VideoFrame: 61, DefineFontInfo2: 62,
  EnableDebugger2: 64, ScriptLimits: 65, SetTabIndex: 66, FileAttributes: 69, PlaceObject3: 70,
  ImportAssets2: 71, DefineFontAlignZones: 73, CSMTextSettings: 74, DefineFont3: 75, SymbolClass: 76,
  Metadata: 77, DefineScalingGrid: 78, DoABC: 82, DefineShape4: 83, DefineMorphShape2: 84,
  DefineSceneAndFrameLabelData: 86, DefineBinaryData: 87, DefineFontName: 88, StartSound2: 89,
  DefineBitsJPEG4: 90, DefineFont4: 91,
} as const;

export const TAG_NAMES: Record<number, string> = Object.fromEntries(Object.entries(TAG).map(([k, v]) => [v, k]));

export interface RawTag {
  code: number;
  /** Offset of the tag BODY in the decompressed file buffer. */
  offset: number;
  length: number;
  /** Offset of the tag header. */
  headerOffset: number;
  body: Uint8Array;
}

export interface SwfHeader {
  signature: 'FWS' | 'CWS' | 'ZWS';
  version: number;
  fileLength: number;
  frameSize: { xMin: number; xMax: number; yMin: number; yMax: number }; // px
  frameRate: number;
  frameCount: number;
}

export class SwfFile {
  /** Full decompressed file (header bytes 0..7 included, uncompressed signature). */
  readonly data: Uint8Array;
  readonly header: SwfHeader;
  /** Offset of the first top-level tag. */
  readonly tagsOffset: number;
  readonly sha256: string;

  constructor(fileBytes: Uint8Array) {
    this.sha256 = createHash('sha256').update(fileBytes).digest('hex');
    const sig = String.fromCharCode(fileBytes[0], fileBytes[1], fileBytes[2]) as SwfHeader['signature'];
    const version = fileBytes[3];
    const fileLength = new DataView(fileBytes.buffer, fileBytes.byteOffset).getUint32(4, true);
    let data: Uint8Array;
    if (sig === 'FWS') data = fileBytes;
    else if (sig === 'CWS') {
      const body = inflateSync(fileBytes.subarray(8));
      data = new Uint8Array(8 + body.length);
      data.set(fileBytes.subarray(0, 8), 0);
      data[0] = 0x46; // 'F'
      data.set(body, 8);
    } else throw new Error(`Unsupported SWF signature ${sig}`);
    this.data = data;
    const r = new ByteReader(data, 8);
    const nbits = r.ub(5);
    const xMin = r.sb(nbits), xMax = r.sb(nbits), yMin = r.sb(nbits), yMax = r.sb(nbits);
    r.align();
    const frameRate = r.u16() / 256; // UFIXED8
    const frameCount = r.u16();
    this.tagsOffset = r.pos;
    this.header = {
      signature: sig, version, fileLength,
      frameSize: { xMin: xMin / 20, xMax: xMax / 20, yMin: yMin / 20, yMax: yMax / 20 },
      frameRate, frameCount,
    };
  }

  static fromPath(path: string): SwfFile {
    return new SwfFile(new Uint8Array(readFileSync(path)));
  }

  /** Iterate tags in [start, end) of the decompressed buffer (default: top-level tags). Stops after End (0). */
  *tags(start = this.tagsOffset, end = this.data.length): Generator<RawTag> {
    const r = new ByteReader(this.data, start, end);
    while (!r.eof) {
      const headerOffset = r.pos;
      const codeAndLength = r.u16();
      const code = codeAndLength >> 6;
      let length = codeAndLength & 0x3f;
      if (length === 0x3f) length = r.u32();
      const offset = r.pos;
      if (offset + length > end) throw new RangeError(`Tag ${code} at ${headerOffset} overruns (${length})`);
      const body = this.data.subarray(offset, offset + length);
      r.pos += length;
      yield { code, offset, length, headerOffset, body };
      if (code === TAG.End) break;
    }
  }

  /** Iterate the control tags inside a DefineSprite tag (skips the 4-byte sprite header). */
  *spriteTags(defineSprite: RawTag): Generator<RawTag> {
    yield* this.tags(defineSprite.offset + 4, defineSprite.offset + defineSprite.length);
  }

  /** Character id of a DefineSprite tag. */
  static spriteId(tag: RawTag): number { return tag.body[0] | (tag.body[1] << 8); }

  /** Reader over a tag body. */
  reader(tag: RawTag): ByteReader { return new ByteReader(this.data, tag.offset, tag.offset + tag.length); }
}
