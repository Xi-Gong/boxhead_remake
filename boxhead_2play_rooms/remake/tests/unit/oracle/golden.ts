// Oracle goldens loader (tests/goldens/flash/*.json, written by tools/oracle/runProbe.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GOLDEN_DIR = fileURLToPath(new URL('../../goldens/flash/', import.meta.url));

export interface Golden {
  probe: string;
  title: string;
  player: string;
  swfVersion: number;
  generatedBy: string;
  notes?: string[];
  results: Record<string, string>;
  derived?: unknown;
  log?: string[];
}

const cache = new Map<string, Golden>();

export function hasGolden(id: string): boolean { return existsSync(`${GOLDEN_DIR}${id}.json`); }

export function golden(id: string): Golden {
  let g = cache.get(id);
  if (!g) { g = JSON.parse(readFileSync(`${GOLDEN_DIR}${id}.json`, 'utf8')) as Golden; cache.set(id, g); }
  return g;
}

export function goldenIds(): string[] {
  return readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

/** Merge the results of several goldens (chunked cross-player probes). */
export function mergedResults(prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of goldenIds().filter((i) => i.startsWith(prefix))) Object.assign(out, golden(id).results);
  delete out.flush;
  return out;
}

/** Re-assemble an ARGB pixel grid dumped as <key>.nz + <key>.r<y> rows (P3/P5 format) into a w*h array. */
export function pixelGrid(r: Record<string, string>, key: string, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h);
  const nz = r[`${key}.nz`];
  if (nz === undefined) throw new Error(`no ${key}.nz in golden`);
  if (nz === 'empty') return out;
  const [x0, y0, cw, ch] = nz.split(',').map(Number) as [number, number, number, number];
  for (let y = y0; y < y0 + ch; y++) {
    const row = r[`${key}.r${y}`]!.split(' ');
    for (let x = 0; x < cw; x++) out[y * w + x0 + x] = parseInt(row[x]!, 16) >>> 0;
  }
  return out;
}

/** Parsed CWorld mInitList of a room as measured in Flash (order = order of AddInitObject calls). */
export interface InitEntry { code: string; depthPath: number[]; x: number; y: number; x2?: number; y2?: number; rotation?: number }
export const ROOM_PART: Record<number, string> = {};
for (let r = 1; r <= 18; r++) ROOM_PART[r] = r <= 9 ? 'p8b_init_1_9' : r <= 14 ? 'p8c_init_10_14' : 'p8e_init_15_18';

/** CWorld mInitList of room 1..18 as measured in Flash (P8b/c/e), in AddInitObject order. */
export function initList(room: number): InitEntry[] {
  const res = golden(ROOM_PART[room]!).results;
  const out: InitEntry[] = [];
  for (let i = 0; res[`room${room}.l${i}`] !== undefined; i++) {
    for (const e of res[`room${room}.l${i}`]!.split(';')) {
      // codes are single characters (Z D 1 2 B W K C S); the depth path follows immediately
      if (!/^[ZD12BWKCS][\d/]+:[-\d.,]+(\|r[-\d.e]+)?$/.test(e)) throw new Error(`bad init entry ${e}`);
      const code = e[0]!;
      const rest = e.slice(1);
      const [path, coords] = rest.split(':') as [string, string];
      const [c, rot] = coords.split('|r');
      const nums = c!.split(',').map(Number);
      out.push({
        code, depthPath: path.split('/').map(Number), x: nums[0]!, y: nums[1]!,
        ...(nums.length > 2 ? { x2: nums[2], y2: nums[3] } : {}), ...(rot !== undefined ? { rotation: Number(rot) } : {}),
      });
    }
  }
  return out;
}
