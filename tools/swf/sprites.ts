/**
 * Timelines: DefineSprite control tags and the root timeline -> SpriteDef.
 *
 * Handled: PlaceObject / PlaceObject2 / PlaceObject3, RemoveObject / RemoveObject2, FrameLabel, StartSound, DoAction
 * (recorded as ActionRef kind 'frame'), ShowFrame. Ignored on purpose: SoundStreamHead/2 (no SoundStreamBlocks in this
 * SWF), obfuscator junk tags 253/255, Protect, CSMTextSettings, DefineFontAlignZones and the other dictionary /
 * file-level tags (handled by their own modules). Anything else is reported in `ctx.warnings`.
 */
import type { ActionRef, FrameDef, PlaceOp, SpriteDef } from '../../src/shared/assetSchema.ts';
import type { ByteReader } from './ByteReader.ts';
import { TAG, TAG_NAMES, type RawTag, type SwfFile } from './SwfFile.ts';
import { readClipActions, readCxform, readFilterList, readMatrix, readSoundInfo } from './records.ts';

export interface TimelineCtx {
  swfVersion: number;
  /** LibraryJson.actions (appended to). */
  actions: ActionRef[];
  warnings: string[];
  /** Counters for the inventory report. */
  counts: Record<string, number>;
}

/** Tags that may legitimately appear in a timeline but carry nothing for the display list. */
const IGNORED = new Set<number>([
  TAG.SoundStreamHead, TAG.SoundStreamHead2, TAG.Protect, TAG.CSMTextSettings, TAG.DefineFontAlignZones,
  TAG.FileAttributes, TAG.SetBackgroundColor, TAG.ExportAssets, TAG.ImportAssets, TAG.ImportAssets2, TAG.EnableDebugger,
  TAG.EnableDebugger2, TAG.ScriptLimits, TAG.Metadata, TAG.DoInitAction, TAG.End, 253, 255,
]);

/** Dictionary (definition) tags: skipped by the root timeline parser. */
export const DEFINITION_TAGS = new Set<number>([
  TAG.DefineShape, TAG.DefineShape2, TAG.DefineShape3, TAG.DefineShape4, TAG.DefineMorphShape, TAG.DefineMorphShape2,
  TAG.DefineBits, TAG.JPEGTables, TAG.DefineBitsJPEG2, TAG.DefineBitsJPEG3, TAG.DefineBitsJPEG4, TAG.DefineBitsLossless,
  TAG.DefineBitsLossless2, TAG.DefineButton, TAG.DefineButton2, TAG.DefineButtonCxform, TAG.DefineButtonSound,
  TAG.DefineFont, TAG.DefineFont2, TAG.DefineFont3, TAG.DefineFont4, TAG.DefineFontInfo, TAG.DefineFontInfo2,
  TAG.DefineFontName, TAG.DefineText, TAG.DefineText2, TAG.DefineEditText, TAG.DefineSound, TAG.DefineSprite,
  TAG.DefineVideoStream, TAG.DefineScalingGrid, TAG.DefineBinaryData,
]);

const bump = (ctx: TimelineCtx, k: string, n = 1) => { ctx.counts[k] = (ctx.counts[k] ?? 0) + n; };

/** PlaceObject (v1). */
function placeObject1(r: ByteReader): PlaceOp {
  const id = r.u16(), depth = r.u16();
  const op: PlaceOp = { op: 'place', depth, move: false, id, m: readMatrix(r) };
  if (r.remaining > 0) op.cx = readCxform(r, false);
  return op;
}

/** PlaceObject2 / PlaceObject3. Clip actions are located (ActionRef kind 'clip') but not decoded. */
function placeObject23(r: ByteReader, v3: boolean, ctx: TimelineCtx, spriteId: number, frame: number): PlaceOp {
  const f1 = r.u8();
  const f2 = v3 ? r.u8() : 0;
  const hasClipActions = !!(f1 & 0x80), hasClipDepth = !!(f1 & 0x40), hasName = !!(f1 & 0x20), hasRatio = !!(f1 & 0x10);
  const hasCx = !!(f1 & 0x08), hasMatrix = !!(f1 & 0x04), hasChar = !!(f1 & 0x02), move = !!(f1 & 0x01);
  const hasOpaqueBg = !!(f2 & 0x40), hasVisible = !!(f2 & 0x20), hasImage = !!(f2 & 0x10), hasClassName = !!(f2 & 0x08);
  const hasCache = !!(f2 & 0x04), hasBlend = !!(f2 & 0x02), hasFilters = !!(f2 & 0x01);
  const op: PlaceOp = { op: 'place', depth: r.u16(), move };
  if (hasClassName || (hasImage && hasChar)) op.className = r.string();
  if (hasChar) op.id = r.u16();
  if (hasMatrix) op.m = readMatrix(r);
  if (hasCx) op.cx = readCxform(r, true);
  if (hasRatio) op.ratio = r.u16();
  if (hasName) op.name = r.string();
  if (hasClipDepth) op.clipDepth = r.u16();
  if (hasFilters) { op.filters = readFilterList(r); bump(ctx, 'placeFilters'); for (const f of op.filters) bump(ctx, `filter.${f.t}`); }
  if (hasBlend) { op.blend = r.u8(); bump(ctx, `blend.${op.blend}`); }
  if (hasCache) { op.cacheAsBitmap = r.u8() !== 0; bump(ctx, 'cacheAsBitmap'); }
  if (hasVisible) { r.u8(); ctx.warnings.push(`sprite ${spriteId} frame ${frame}: PlaceObject3 visible flag (SWF11) ignored`); }
  if (hasOpaqueBg) { r.bytes(4); ctx.warnings.push(`sprite ${spriteId} frame ${frame}: PlaceObject3 opaqueBackground (SWF11) ignored`); }
  if (hasClipActions) {
    op.hasClipActions = true;
    for (const ca of readClipActions(r, ctx.swfVersion)) {
      ctx.actions.push({ kind: 'clip', spriteId, offset: ca.offset, length: ca.length });
      bump(ctx, 'clipActionRecords');
    }
  }
  if (r.remaining) ctx.warnings.push(`sprite ${spriteId} frame ${frame}: PlaceObject${v3 ? 3 : 2} has ${r.remaining} trailing bytes`);
  return op;
}

/**
 * Parse a timeline. `tags` are the control tags (for the root: all top-level tags; definition tags are skipped).
 * `spriteId` 0 = root.
 */
export function parseTimeline(swf: SwfFile, tags: Iterable<RawTag>, spriteId: number, frameCount: number, ctx: TimelineCtx): SpriteDef {
  const frames: FrameDef[] = [];
  const labels: Record<string, number> = {};
  let cur: FrameDef = { ops: [] };
  let trailing = 0;
  for (const tag of tags) {
    const frame = frames.length + 1;
    const r = swf.reader(tag);
    switch (tag.code) {
      case TAG.ShowFrame:
        frames.push(cur);
        cur = { ops: [] };
        trailing = 0;
        break;
      case TAG.PlaceObject:
        cur.ops.push(placeObject1(r)); bump(ctx, 'PlaceObject'); trailing++;
        break;
      case TAG.PlaceObject2:
      case TAG.PlaceObject3:
        cur.ops.push(placeObject23(r, tag.code === TAG.PlaceObject3, ctx, spriteId, frame)); trailing++;
        bump(ctx, tag.code === TAG.PlaceObject3 ? 'PlaceObject3' : 'PlaceObject2');
        break;
      case TAG.RemoveObject:
        r.u16(); cur.ops.push({ op: 'remove', depth: r.u16() }); trailing++;
        break;
      case TAG.RemoveObject2:
        cur.ops.push({ op: 'remove', depth: r.u16() }); trailing++;
        break;
      case TAG.FrameLabel: {
        const name = r.string();
        if (name in labels) ctx.warnings.push(`sprite ${spriteId}: duplicate frame label "${name}" (frames ${labels[name]} and ${frame}); first kept`);
        else labels[name] = frame;
        break;
      }
      case TAG.StartSound: {
        const id = r.u16();
        (cur.sounds ??= []).push({ id, info: readSoundInfo(r) });
        trailing++;
        break;
      }
      case TAG.DoAction: {
        const idx = ctx.actions.length;
        ctx.actions.push({ kind: 'frame', spriteId, frame, offset: tag.offset, length: tag.length });
        (cur.actions ??= []).push(idx);
        trailing++;
        break;
      }
      default:
        if (IGNORED.has(tag.code)) { bump(ctx, `ignored.${TAG_NAMES[tag.code] ?? 'tag' + tag.code}`); break; }
        if (spriteId === 0 && DEFINITION_TAGS.has(tag.code)) break;
        ctx.warnings.push(`sprite ${spriteId} frame ${frame}: unexpected tag ${TAG_NAMES[tag.code] ?? tag.code}`);
    }
  }
  if (trailing) ctx.warnings.push(`sprite ${spriteId}: ${trailing} control tags after the last ShowFrame (ignored)`);
  if (frames.length !== frameCount) {
    ctx.warnings.push(`sprite ${spriteId}: header frameCount ${frameCount} but ${frames.length} ShowFrames`);
    while (frames.length < frameCount) frames.push({ ops: [] });
  }
  return { t: 'sprite', id: spriteId, frameCount, frames, labels };
}

/** DefineSprite tag -> SpriteDef. */
export function parseDefineSprite(swf: SwfFile, tag: RawTag, ctx: TimelineCtx): SpriteDef {
  const r = swf.reader(tag);
  const id = r.u16(), frameCount = r.u16();
  return parseTimeline(swf, swf.spriteTags(tag), id, frameCount, ctx);
}
