// LOCAL highscores (scope decision, deviation LOCAL_HIGHSCORES): replaces the CrazyMonkeyGames online tables.
//   - one top-10 table per room x mode (Single / Coop; Death Match has no score), id "ROOM_<mode>_<0001..0018>" -
//     the same id CScreen_SelectWorld.LoadHighScore builds;
//   - stored in the game's own save (SharedObject "BXHD_2PLAY_6", member mLocalHighscores), flushed with SaveData();
//   - eligibility = the original rule of CScreen_Debrief: devils, collisions and damage all on;
//   - the name is the Debrief's mUsername field (also saved as CSaveData.mUsername, as in the original).
// The table overlay is the "Local_Highscores" symbol (original options-window parts, see localSymbols.ts) with text
// in the game's embedded fonts (Arial Rounded MT Bold / Calibri).
import { TextFormat, flash, toAS2String } from '../../engine/runtime.ts';
import { CSaveData, CSound } from '../packages.ts';
import { LOCAL_HIGHSCORES_LINKAGE } from './localSymbols.ts';

export interface HighscoreEntry { mName: string; mScore: number }

export const TOP_N = 10;
export const SAVE_MEMBER = 'mLocalHighscores';
export const MAX_NAME_LENGTH = 20;

/** Room names as shown on LevelIcons_Single (frames 1..18). */
export const ROOM_NAMES: readonly string[] = [
  'BOXY', 'BUTTONS', 'MAZEY', 'GLADIATOR', 'STRIP', 'TIGHT', 'COLUMNS', 'CASTLE', 'BIG BOXY', 'RECTY', 'PATCHY',
  'FOREST BOX', 'TIGHT 2', 'MASSIVE', 'THIN LINE', '4 CASTLES', 'THE STRIPS', 'BIG ONE',
];

const MODE_TITLES: Readonly<Record<string, string>> = { Single: 'SINGLE PLAY', Coop: 'COOPERATIVE', DeathMatch: 'DEATH MATCH' };

export function pad4(n: number): string {
  let s = String(n);
  while (s.length < 4) s = '0' + s;
  return s;
}

/** Table id for a mode and a 0-based room index (CScreen_SelectWorld.LoadHighScore naming). */
export function tableId(mode: string, roomIndex: number): string {
  return 'ROOM_' + mode + '_' + pad4(roomIndex + 1);
}

/** 0-based room index of a world linkage "ROOM_Single_0007" (-1 if unknown). */
export function roomIndexOfLibLink(libLink: unknown): number {
  const m = /_(\d{4})$/.exec(String(libLink ?? ''));
  return m ? Number(m[1]) - 1 : -1;
}

/** The original submission rule (CScreen_Debrief ctor): devils, collisions and damage all on. */
export function isEligible(save: { mDevilsActive: any; mCollisionsActive: any; mDamageActive: any }): boolean {
  return save.mDevilsActive == 1 && save.mCollisionsActive == 1 && save.mDamageActive == 1;
}

/** Only these modes have tables. */
export function hasTable(mode: string): boolean {
  return mode === 'Single' || mode === 'Coop';
}

/** Clean a typed name (the debrief field is free text). */
export function cleanName(name: unknown): string {
  const s = String(name ?? '').replace(/[\r\n\t]/g, ' ').trim();
  return (s === '' || s === '<Enter name>' ? 'PLAYER' : s).slice(0, MAX_NAME_LENGTH);
}

/**
 * Pure: insert `entry` into a table sorted by score (descending). Equal scores keep the older entry first. Returns the
 * new top-N table and the 1-based rank of the entry (0 when it did not make the table).
 */
export function insertScore(table: readonly HighscoreEntry[], entry: HighscoreEntry, topN = TOP_N): { table: HighscoreEntry[]; rank: number } {
  const out = table.filter((e) => e && Number.isFinite(e.mScore)).map((e) => ({ mName: String(e.mName), mScore: e.mScore }));
  let at = out.length;
  for (let i = 0; i < out.length; i++) {
    if (entry.mScore > out[i]!.mScore) { at = i; break; }
  }
  out.splice(at, 0, { mName: entry.mName, mScore: entry.mScore });
  out.length = Math.min(out.length, topN);
  return { table: out, rank: at < topN ? at + 1 : 0 };
}

function store(data: Record<string, any>): Record<string, HighscoreEntry[]> {
  const v = data[SAVE_MEMBER];
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, HighscoreEntry[]>;
  const fresh: Record<string, HighscoreEntry[]> = {};
  data[SAVE_MEMBER] = fresh;
  return fresh;
}

/** The table for (mode, room) from the save (empty when none). */
export function getTable(mode: string, roomIndex: number): HighscoreEntry[] {
  const data = CSaveData.mSharedObject?.data;
  if (!data) return [];
  const t = data[SAVE_MEMBER]?.[tableId(mode, roomIndex)];
  return Array.isArray(t) ? t.filter((e: any) => e && Number.isFinite(e.mScore)) : [];
}

/**
 * Submit a score to the local table. Returns the rank (1..10), 0 if it did not make the table, -1 if not allowed
 * (mode without a table, unknown room, rule not met).
 */
export function submitLocalScore(mode: string, roomIndex: number, name: unknown, score: number): number {
  const save = CSaveData._this;
  if (!hasTable(mode) || roomIndex < 0 || !save || !isEligible(save) || !Number.isFinite(score)) return -1;
  const data = CSaveData.mSharedObject.data;
  const tables = store(data);
  const id = tableId(mode, roomIndex);
  const r = insertScore(Array.isArray(tables[id]) ? tables[id]! : [], { mName: cleanName(name), mScore: Math.floor(score) });
  tables[id] = r.table;
  save.SaveData();
  return r.rank;
}

// ------------------------------------------------------------------------------------------------ overlay

function addText(mc: any, name: string, depth: number, x: number, y: number, w: number, h: number,
  font: string, size: number, color: number, bold: boolean, align: 'left' | 'right' | 'center', text: string): any {
  const tf = mc.createTextField(name, depth, x, y, w, h);
  tf.embedFonts = true;
  tf.selectable = false;
  tf.setNewTextFormat(new TextFormat(font, size, color, bold, false, false, undefined, undefined, align));
  tf.text = text;
  return tf;
}

function formatScore(n: number): string {
  // same 12-digit zero padding as the HUD total (CHud.PadScore)
  let s = toAS2String(Math.floor(n));
  while (s.length < 12) s = '0' + s;
  return s;
}

/**
 * Show the highscore table of (mode, room) over `parent` (a screen clip). `highlightRank` (1..10) marks a new entry.
 * Returns the overlay clip; CLOSE removes it.
 */
export function showHighscoreTable(parent: any, mode: string, roomIndex: number, highlightRank = 0): any {
  parent._LocalHighscores?.removeMovieClip?.();
  const mc = parent.attachMovie(LOCAL_HIGHSCORES_LINKAGE, '_LocalHighscores', parent.getNextHighestDepth(), { _x: 320, _y: 240 });
  if (!mc) return undefined;
  const room = ROOM_NAMES[roomIndex] ?? '?';
  const title = addText(mc, 'tfTitle', 10, -230, -165, 460, 34, 'Arial Rounded MT Bold', 24, 0x000000, false, 'center', 'HIGHSCORES');
  title.filters = [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 4, 2)];
  addText(mc, 'tfRoom', 11, -230, -133, 460, 22, 'Calibri', 15, 0x333333, true, 'center',
    `${roomIndex + 1}. ${room}  -  ${MODE_TITLES[mode] ?? String(mode).toUpperCase()}`);
  const table = getTable(mode, roomIndex);
  const top = -102;
  const rowH = 21;
  addText(mc, 'tfHeadRank', 12, -200, top, 50, 20, 'Calibri', 13, 0x808080, true, 'right', 'RANK');
  addText(mc, 'tfHeadName', 13, -130, top, 200, 20, 'Calibri', 13, 0x808080, true, 'left', 'NAME');
  addText(mc, 'tfHeadScore', 14, 70, top, 130, 20, 'Calibri', 13, 0x808080, true, 'right', 'SCORE');
  for (let i = 0; i < TOP_N; i++) {
    const e = table[i];
    const y = top + 22 + i * rowH;
    const hi = highlightRank === i + 1;
    const color = hi ? 0xff0000 : e ? 0x000000 : 0xb0b0b0;
    addText(mc, 'tfRank' + i, 20 + i * 3, -200, y, 50, 22, 'Calibri', 15, color, true, 'right', `${i + 1}.`);
    addText(mc, 'tfName' + i, 21 + i * 3, -130, y, 200, 22, 'Calibri', 15, color, true, 'left', e ? e.mName : '---');
    addText(mc, 'tfScore' + i, 22 + i * 3, 70, y, 130, 22, 'Calibri', 15, color, true, 'right', e ? formatScore(e.mScore) : '');
  }
  const close = mc._Button_Close;
  if (close) {
    if (close._Selected) close._Selected._visible = false;
    close._Button.onRelease = function (): void {
      CSound.mSamples.Click2.PlaySound();
      mc.removeMovieClip();
    };
  }
  return mc;
}
