/**
 * Enumerate every AVM1 action list in a SWF: DoInitAction, root / sprite DoAction frame scripts, button condition
 * actions (DefineButton / DefineButton2) and clip event actions (PlaceObject2/3 ClipActions).
 */
import { SwfFile, TAG, type RawTag } from '../swf/SwfFile.ts';
import { ByteReader } from '../swf/ByteReader.ts';

export type ActionSourceKind = 'initaction' | 'frame' | 'button' | 'clipaction';

export interface ActionSource {
  kind: ActionSourceKind;
  /** Absolute offset of the first action. */
  start: number;
  /** End of the containing record (actions may jump outside; this is only the nominal bound). */
  end: number;
  /** Sprite id for DoInitAction / sprite frames / clip actions inside a sprite (0 = root timeline). */
  spriteId: number;
  /** 1-based frame number for frame scripts and clip actions. */
  frame?: number;
  /** Button character id (button actions). */
  buttonId?: number;
  /** Button condition flags / clip event flags. */
  conditions?: number;
  /** PlaceObject depth and instance name (clip actions). */
  depth?: number;
  instanceName?: string;
  characterId?: number;
  /** Index of the record among siblings (several DoActions per frame, several handlers…). */
  index: number;
  /** Offset of the containing tag header. */
  tagOffset: number;
}

/** ExportAssets: character id -> exported names. */
export function exportNames(swf: SwfFile): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const t of swf.tags()) {
    if (t.code !== TAG.ExportAssets) continue;
    const r = swf.reader(t);
    const n = r.u16();
    for (let i = 0; i < n; i++) {
      const id = r.u16();
      const name = r.string();
      if (!out.has(id)) out.set(id, []);
      out.get(id)!.push(name);
    }
  }
  return out;
}

const CLIP_EVENT_NAMES = [
  // bit order of the 32-bit SWF6+ ClipEventFlags as read little-endian
  'keyUp', 'keyDown', 'mouseUp', 'mouseDown', 'mouseMove', 'unload', 'enterFrame', 'load',
  'dragOver', 'rollOut', 'rollOver', 'releaseOutside', 'release', 'press', 'initialize', 'data',
  'construct', 'keyPress', 'dragOut',
];

export function clipEventNames(flags: number): string {
  const b0 = flags & 0xff, b1 = (flags >> 8) & 0xff, b2 = (flags >> 16) & 0xff;
  const out: string[] = [];
  // byte0: KeyUp(7) KeyDown(6) MouseUp(5) MouseDown(4) MouseMove(3) Unload(2) EnterFrame(1) Load(0)
  const byte0 = ['load', 'enterFrame', 'unload', 'mouseMove', 'mouseDown', 'mouseUp', 'keyDown', 'keyUp'];
  const byte1 = ['data', 'initialize', 'press', 'release', 'releaseOutside', 'rollOver', 'rollOut', 'dragOver'];
  const byte2 = ['dragOut', 'keyPress', 'construct'];
  byte0.forEach((n, i) => { if (b0 & (1 << i)) out.push(n); });
  byte1.forEach((n, i) => { if (b1 & (1 << i)) out.push(n); });
  byte2.forEach((n, i) => { if (b2 & (1 << i)) out.push(n); });
  void CLIP_EVENT_NAMES;
  return out.join('+') || `0x${flags.toString(16)}`;
}

function skipMatrix(r: ByteReader): void {
  if (r.bit()) { const n = r.ub(5); r.sb(n); r.sb(n); }
  if (r.bit()) { const n = r.ub(5); r.sb(n); r.sb(n); }
  const n = r.ub(5); r.sb(n); r.sb(n);
  r.align();
}

function skipCxformWithAlpha(r: ByteReader): void {
  const hasAdd = r.bit(), hasMult = r.bit();
  const n = r.ub(4);
  if (hasMult) for (let i = 0; i < 4; i++) r.sb(n);
  if (hasAdd) for (let i = 0; i < 4; i++) r.sb(n);
  r.align();
}

function skipFilters(r: ByteReader): void {
  const count = r.u8();
  for (let i = 0; i < count; i++) {
    const id = r.u8();
    switch (id) {
      case 0: r.bytes(23); break; // DropShadow
      case 1: r.bytes(9); break; // Blur
      case 2: r.bytes(15); break; // Glow
      case 3: r.bytes(27); break; // Bevel
      case 4: case 7: { const nc = r.u8(); r.bytes(nc * 5 + 19); break; } // GradientGlow / GradientBevel
      case 5: { const cols = r.u8(), rows = r.u8(); r.bytes(4 * 2 + 4 * cols * rows + 4 + 1); break; } // Convolution
      case 6: r.bytes(80); break; // ColorMatrix
      default: throw new Error(`unknown filter ${id}`);
    }
  }
}

/** Parse PlaceObject2/3 clip actions. Returns [] when the tag has none. */
function placeObjectClipActions(swf: SwfFile, t: RawTag): Array<{ flags: number; start: number; end: number; depth: number; name?: string; charId?: number }> {
  const r = swf.reader(t);
  const f = r.u8();
  let f2 = 0;
  if (t.code === TAG.PlaceObject3) f2 = r.u8();
  if (!(f & 0x80)) return [];
  const depth = r.u16();
  if (t.code === TAG.PlaceObject3 && ((f2 & 0x08) || ((f2 & 0x10) && (f & 0x02)))) r.string(); // class name
  let charId: number | undefined;
  if (f & 0x02) charId = r.u16();
  if (f & 0x04) skipMatrix(r);
  if (f & 0x08) skipCxformWithAlpha(r);
  if (f & 0x10) r.u16();
  let name: string | undefined;
  if (f & 0x20) name = r.string();
  if (f & 0x40) r.u16();
  if (t.code === TAG.PlaceObject3) {
    if (f2 & 0x01) skipFilters(r);
    if (f2 & 0x02) r.u8();
    if (f2 & 0x04) r.u8();
  }
  r.u16(); // reserved
  const v6 = swf.header.version >= 6;
  v6 ? r.u32() : r.u16(); // all event flags
  const out: Array<{ flags: number; start: number; end: number; depth: number; name?: string; charId?: number }> = [];
  for (;;) {
    const flags = v6 ? r.u32() : r.u16();
    if (!flags) break;
    const size = r.u32();
    const recStart = r.pos;
    let start = recStart;
    if (flags & (1 << 17)) start += 1; // ClipEventKeyPress: key code byte
    out.push({ flags, start, end: recStart + size, depth, name, charId });
    r.pos = recStart + size;
  }
  return out;
}

function buttonActions(swf: SwfFile, t: RawTag): Array<{ cond: number; start: number; end: number }> {
  const r = swf.reader(t);
  if (t.code === TAG.DefineButton) {
    r.u16();
    while (r.u8() !== 0) { r.pos -= 1; r.u8(); r.u16(); r.u16(); skipMatrix(r); }
    return [{ cond: 0x08, start: r.pos, end: t.offset + t.length }];
  }
  r.u16(); // id
  r.u8(); // flags
  const actionOffsetPos = r.pos;
  const actionOffset = r.u16();
  if (!actionOffset) return [];
  let p = actionOffsetPos + actionOffset;
  const out: Array<{ cond: number; start: number; end: number }> = [];
  const end = t.offset + t.length;
  for (;;) {
    const rr = new ByteReader(swf.data, p, end);
    const size = rr.u16();
    const cond = rr.u16();
    const recEnd = size ? p + size : end;
    out.push({ cond, start: p + 4, end: recEnd });
    if (!size) break;
    p += size;
  }
  return out;
}

export function enumerateActions(swf: SwfFile): ActionSource[] {
  const out: ActionSource[] = [];
  const walk = (tags: Iterable<RawTag>, spriteId: number) => {
    let frame = 1;
    let perFrame = 0;
    let clipIdx = 0;
    for (const t of tags) {
      switch (t.code) {
        case TAG.ShowFrame: frame++; perFrame = 0; break;
        case TAG.DoAction:
          out.push({ kind: 'frame', start: t.offset, end: t.offset + t.length, spriteId, frame, index: perFrame++, tagOffset: t.headerOffset });
          break;
        case TAG.DoInitAction: {
          const id = t.body[0] | (t.body[1] << 8);
          out.push({ kind: 'initaction', start: t.offset + 2, end: t.offset + t.length, spriteId: id, index: 0, tagOffset: t.headerOffset });
          break;
        }
        case TAG.PlaceObject2: case TAG.PlaceObject3: {
          let recs: ReturnType<typeof placeObjectClipActions> = [];
          try { recs = placeObjectClipActions(swf, t); } catch { recs = []; }
          for (const rec of recs) {
            out.push({
              kind: 'clipaction', start: rec.start, end: rec.end, spriteId, frame, conditions: rec.flags, depth: rec.depth,
              instanceName: rec.name, characterId: rec.charId, index: clipIdx++, tagOffset: t.headerOffset,
            });
          }
          break;
        }
        case TAG.DefineButton: case TAG.DefineButton2: {
          const id = t.body[0] | (t.body[1] << 8);
          buttonActions(swf, t).forEach((b, i) => {
            out.push({ kind: 'button', start: b.start, end: b.end, spriteId: 0, buttonId: id, conditions: b.cond, index: i, tagOffset: t.headerOffset });
          });
          break;
        }
        case TAG.DefineSprite:
          if (spriteId === 0) walk(swf.spriteTags(t), SwfFile.spriteId(t));
          break;
        default: break;
      }
    }
  };
  walk(swf.tags(), 0);
  return out;
}

/** Button condition flags → readable event list. */
export function buttonCondNames(cond: number): string {
  const names: string[] = [];
  const bits: Array<[number, string]> = [
    [0x0001, 'idleToOverUp'], [0x0002, 'overUpToIdle'], [0x0004, 'overUpToOverDown(press)'],
    [0x0008, 'overDownToOverUp(release)'], [0x0010, 'overDownToOutDown(dragOut)'], [0x0020, 'outDownToOverDown(dragOver)'],
    [0x0040, 'outDownToIdle(releaseOutside)'], [0x0080, 'idleToOverDown'], [0x0100, 'overDownToIdle'],
  ];
  for (const [b, n] of bits) if (cond & b) names.push(n);
  const key = cond >> 9;
  if (key) names.push(`keyPress(${key})`);
  return names.join('+') || '0';
}
