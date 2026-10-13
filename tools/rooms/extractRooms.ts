/**
 * Independent room oracle: derives every ROOM_Single_00NN map purely from the SWF timelines (library.json data),
 * not from the game code. Used as a test fixture for the ported CWorld.InitThings.
 *
 * What the game does at room init (World/CWorld.as Init/InitThings, World/Init/CWorld_Init.as):
 *   - map size  = round(mcRoomData._Size._width / 32) x round(_height / 32)   (_Size bounds in room space)
 *   - every CWorld_Init_* instance anywhere under the room (frame 1, nested clips included) registers itself;
 *     mPosition  = registration point in room/world space (room clip is attached at the World origin),
 *     mPosition2 = mPosition + (_width, _height) where _width/_height are in the instance's PARENT space;
 *   - CollisionSolid -> MarkArea_PP(round(p1/32), round(p2/32)); Barrel/Wall/Zombie/Devil/Player* -> cell
 *     floor(p/32) (+0.5 centre); Pickup -> p/32 unrounded; Piece -> drawn into the floor by translation only.
 * Both the exact composed world rect and the game formula are reported for collision blocks.
 *
 * CLI: node tools/rooms/extractRooms.ts [library.json] [outDir]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LibraryJson, Mat, Rect } from '../../src/shared/assetSchema.ts';
import { apply, charBounds, displayListAt, IDENT, mul, rotationDeg, transformRect } from '../swf/bounds.ts';
import { ASSETS_OUT, GENERATED, isMain } from '../paths.ts';

export const CELL = 32;

export type MarkerType = 'Zombie' | 'Devil' | 'Player1' | 'Player2' | 'Barrel' | 'Wall' | 'Pickup' | 'CollisionSolid' | 'Piece';

/** Linkage name -> CWorld_Init type (by linkage naming; cross-checked against registerClass when available). */
export function markerType(linkage: string | undefined): MarkerType | null {
  if (!linkage) return null;
  const m = /^World_Init_(Zombie|Devil|Player1|Player2|Barrel|Wall|Pickup|CollisionSolid)$/.exec(linkage);
  if (m) return m[1] as MarkerType;
  if (linkage.startsWith('Piece.')) return 'Piece';
  return null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const rectR = (r: Rect): Rect => ({ xMin: r3(r.xMin), yMin: r3(r.yMin), xMax: r3(r.xMax), yMax: r3(r.yMax) });
const matR = (m: Mat): Mat => ({ a: r3(m.a), b: r3(m.b), c: r3(m.c), d: r3(m.d), tx: r3(m.tx), ty: r3(m.ty) });

export interface RoomInstance {
  /** Path of instance names / depths from the room clip, e.g. "_Wall12/_Collision" or "@5". */
  path: string;
  depth: number;
  id: number;
  linkage?: string;
  name?: string;
  type: MarkerType | null;
  /** Local matrix (parent space). */
  m: Mat;
  /** Composed room-space matrix. */
  world: Mat;
}

export interface RoomMarker extends RoomInstance {
  /** mPosition (px, room space). */
  pos: { x: number; y: number };
  /** mPosition / 32 (unrounded) and floor() of it (the cell CellCentre() uses). */
  cell: { x: number; y: number };
  cellFloor: { x: number; y: number };
  /** Flash _rotation of the instance (degrees, own matrix only, as used by mAngle). */
  angleDeg: number;
}

export interface CollisionBlock extends RoomMarker {
  /** Index into `pieces` of the enclosing piece, if nested. */
  piece?: number;
  /** Exact composed bounds in room space (px) and rounded cells. */
  worldRect: Rect;
  worldCells: Rect;
  /** Game formula: p1 = mPosition, p2 = mPosition + (_width, _height) (parent-space size), px and round(/32). */
  gameRect: Rect;
  gameCells: Rect;
}

export interface RoomReport {
  room: number;
  linkage: string;
  spriteId: number;
  frameCount: number;
  size: { px: { w: number; h: number }; cells: { w: number; h: number }; instance?: { id: number; m: Mat; bounds: Rect } };
  counts: Record<MarkerType, number>;
  markers: RoomMarker[];
  collision: CollisionBlock[];
  pieces: (RoomMarker & { cover?: { id: number; m: Mat; pos: { x: number; y: number } }; translationOnly: boolean })[];
  /** Instances whose linkage maps to a class other than expected (only when registerClass data exists). */
  classMismatches: string[];
  /** All top-level instances on frame 1 of the room clip. */
  instances: RoomInstance[];
}

export function extractRoom(lib: LibraryJson, room: number): RoomReport {
  const linkage = `ROOM_Single_${String(room).padStart(4, '0')}`;
  const spriteId = lib.exports[linkage];
  const sprite = lib.chars[spriteId];
  if (!sprite || sprite.t !== 'sprite') throw new Error(`${linkage}: not a sprite (${spriteId})`);
  const names: Record<number, string> = {};
  for (const [n, id] of Object.entries(lib.exports)) if (!(id in names)) names[id] = n;

  const counts = { Zombie: 0, Devil: 0, Player1: 0, Player2: 0, Barrel: 0, Wall: 0, Pickup: 0, CollisionSolid: 0, Piece: 0 } as Record<MarkerType, number>;
  const markers: RoomMarker[] = [];
  const collision: CollisionBlock[] = [];
  const pieces: RoomReport['pieces'] = [];
  const classMismatches: string[] = [];
  const instances: RoomInstance[] = [];

  /** `world` = exact (unrounded) composed matrix. */
  const toMarker = (inst: RoomInstance, world: Mat): RoomMarker => {
    const [x, y] = apply(world, 0, 0);
    return {
      ...inst,
      pos: { x: r3(x), y: r3(y) },
      cell: { x: r3(x / CELL), y: r3(y / CELL) },
      cellFloor: { x: Math.floor(x / CELL), y: Math.floor(y / CELL) },
      angleDeg: r3(rotationDeg(inst.m)),
    };
  };

  const walk = (spriteDefId: number, parentWorld: Mat, path: string, pieceIdx: number | undefined, level: number) => {
    const s = lib.chars[spriteDefId];
    if (!s || s.t !== 'sprite' || level > 32) return;
    for (const e of displayListAt(s, 1)) {
      const link = names[e.id];
      const type = markerType(link);
      const world = mul(parentWorld, e.m);
      const p = `${path}${path ? '/' : ''}${e.name ?? '@' + e.depth}`;
      const inst: RoomInstance = { path: p, depth: e.depth, id: e.id, linkage: link, name: e.name, type, m: matR(e.m), world: matR(world) };
      if (level === 0) instances.push(inst);
      let myPiece = pieceIdx;
      if (type) {
        counts[type]++;
        const cls = link ? lib.classes[link] : undefined;
        const expected = type === 'Piece' ? 'CWorld_Init_Piece' : `CWorld_Init_${type}`;
        if (cls && !cls.endsWith(expected)) classMismatches.push(`${p}: ${link} -> ${cls} (expected ${expected})`);
        const mk = toMarker(inst, world);
        if (type === 'Piece') {
          const pc = lib.chars[e.id];
          const cover = pc?.t === 'sprite' ? displayListAt(pc, 1).find((c) => c.name === '_Cover') : undefined;
          const piece: RoomReport['pieces'][number] = { ...mk, translationOnly: e.m.a === 1 && e.m.b === 0 && e.m.c === 0 && e.m.d === 1 };
          if (cover) {
            const [cx, cy] = apply(mul(world, cover.m), 0, 0);
            piece.cover = { id: cover.id, m: matR(cover.m), pos: { x: r3(cx), y: r3(cy) } };
          }
          myPiece = pieces.length;
          pieces.push(piece);
        } else if (type === 'CollisionSolid') {
          const local = charBounds(lib, e.id, e.ratio ?? 0) ?? { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
          const worldRect = transformRect(world, local);
          const parentSize = transformRect(e.m, local); // _width/_height live in the parent's space
          const w = parentSize.xMax - parentSize.xMin, h = parentSize.yMax - parentSize.yMin;
          const [px, py] = apply(world, 0, 0);
          const gameRect = { xMin: px, yMin: py, xMax: px + w, yMax: py + h };
          const cells = (r: Rect): Rect => ({
            xMin: Math.round(r.xMin / CELL), yMin: Math.round(r.yMin / CELL), xMax: Math.round(r.xMax / CELL), yMax: Math.round(r.yMax / CELL),
          });
          collision.push({ ...mk, piece: pieceIdx, worldRect: rectR(worldRect), worldCells: cells(worldRect), gameRect: rectR(gameRect), gameCells: cells(gameRect) });
        } else {
          markers.push(mk);
        }
      }
      walk(e.id, world, p, myPiece, level + 1);
    }
  };
  walk(spriteId, IDENT, '', undefined, 0);

  // Map size from the _Size child (bounds in room space).
  const sizeEntry = displayListAt(sprite, 1).find((e) => e.name === '_Size');
  let size: RoomReport['size'] = { px: { w: 0, h: 0 }, cells: { w: 0, h: 0 } };
  if (sizeEntry) {
    const local = charBounds(lib, sizeEntry.id, sizeEntry.ratio ?? 0);
    if (local) {
      const b = transformRect(sizeEntry.m, local);
      const w = b.xMax - b.xMin, h = b.yMax - b.yMin;
      size = { px: { w: r3(w), h: r3(h) }, cells: { w: Math.round(w / CELL), h: Math.round(h / CELL) }, instance: { id: sizeEntry.id, m: matR(sizeEntry.m), bounds: rectR(b) } };
    }
  }

  return { room, linkage, spriteId, frameCount: sprite.frameCount, size, counts, markers, collision, pieces, classMismatches, instances };
}

export function extractRooms(lib: LibraryJson): RoomReport[] {
  const out: RoomReport[] = [];
  for (let i = 1; `ROOM_Single_${String(i).padStart(4, '0')}` in lib.exports; i++) out.push(extractRoom(lib, i));
  return out;
}

export function writeRoomReports(reports: RoomReport[], outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const r of reports) writeFileSync(join(outDir, `room${String(r.room).padStart(2, '0')}.json`), JSON.stringify(r, null, 1));
}

if (isMain(import.meta.url)) {
  const libPath = resolve(process.argv[2] ?? join(ASSETS_OUT, 'library.json'));
  const outDir = resolve(process.argv[3] ?? join(GENERATED, 'reports', 'rooms'));
  const lib = JSON.parse(readFileSync(libPath, 'utf8')) as LibraryJson;
  const reports = extractRooms(lib);
  writeRoomReports(reports, outDir);
  for (const r of reports) {
    const c = r.counts;
    console.log(`room ${String(r.room).padStart(2)} ${r.size.cells.w}x${r.size.cells.h}  Z ${c.Zombie} D ${c.Devil} P1 ${c.Player1} P2 ${c.Player2} Barrel ${c.Barrel} Wall ${c.Wall} Pickup ${c.Pickup} Solid ${c.CollisionSolid} Piece ${c.Piece}`);
  }
}
