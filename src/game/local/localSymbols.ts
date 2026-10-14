// Remake-only library symbols (scope: local instructions page + local highscore table), assembled ONLY from original
// characters of the SWF so the pages look like the game's own screens. They are added to library.json at boot
// (src/main.ts calls installLocalSymbols before the Library/Player is created). See src/game/scope.ts.
//
//   9001 "Screen_Instructions"  = Screen_Debrief's frame (menu background #198, _Size #56, "Back to menu" tab #257 +
//                                 _Icon_Back #260) + the BOXHEAD 2PLAY logo #10; text is added by CScreen_Instructions.
//   9002 "Local_Highscores"     = the options-window parts of Screen_SelectWorld (mcLock #274 dim + click blocker,
//                                 white panel #317 with its drop shadow, _Button_Close #305 "CLOSE"), centred on (0,0).
//   9003 "Screen_LanLobby"      = v0.1.3 LAN lobby frame (menu bg #198 + _Size #56 + small logo #10).
//   9004 "Screen_LanSetup"      = v0.1.4 LAN setup frame (same); SubScreen_Coop/DeathMatch attached at runtime.
import type { CharDef, LibraryJson, PlaceOp, SpriteDef } from '../../shared/assetSchema.ts';
import { TextFormat } from '../../engine/runtime.ts';

export const SCREEN_INSTRUCTIONS_ID = 9001;
export const SCREEN_INSTRUCTIONS_LINKAGE = 'Screen_Instructions';
export const LOCAL_HIGHSCORES_ID = 9002;
export const LOCAL_HIGHSCORES_LINKAGE = 'Local_Highscores';
export const SCREEN_LAN_LOBBY_ID = 9003;
export const SCREEN_LAN_LOBBY_LINKAGE = 'Screen_LanLobby';
export const SCREEN_LAN_SETUP_ID = 9004;
export const SCREEN_LAN_SETUP_LINKAGE = 'Screen_LanSetup';

const I = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/** Copy of the placement at `depth` in frame 1 of sprite `spriteId` (with optional overrides). */
function copyPlace(json: LibraryJson, spriteId: number, depth: number, over: Partial<PlaceOp> = {}): PlaceOp {
  const s = json.chars[String(spriteId)] as SpriteDef | undefined;
  const op = s?.frames[0]?.ops.find((o) => o.op === 'place' && o.depth === depth) as PlaceOp | undefined;
  if (!op) throw new Error(`localSymbols: no placement at depth ${depth} in sprite ${spriteId}`);
  return { ...JSON.parse(JSON.stringify(op)), ...over } as PlaceOp;
}

function sprite(id: number, ops: PlaceOp[]): SpriteDef {
  return { t: 'sprite', id, frameCount: 1, frames: [{ ops }], labels: {} };
}

/** Build the synthetic sprites (pure; throws if an original part is missing). */
export function buildLocalSymbols(json: LibraryJson): SpriteDef[] {
  const instructions = sprite(SCREEN_INSTRUCTIONS_ID, [
    copyPlace(json, 376, 1),                    // #198 menu background
    copyPlace(json, 376, 4),                    // #56 _Size
    { op: 'place', depth: 6, move: false, id: 10, m: { ...I, a: 0.42, d: 0.42, tx: 466, ty: 6 } }, // #10 logo, small
    copyPlace(json, 376, 89),                   // #257 shadow tab of the back button
    copyPlace(json, 376, 91),                   // #260 _Icon_Back ("Back to menu")
  ]);
  const highscores = sprite(LOCAL_HIGHSCORES_ID, [
    copyPlace(json, 358, 1),                    // #274 mcLock (dims the screen, swallows clicks)
    copyPlace(json, 358, 3),                    // #317 white window panel (drop shadow)
    copyPlace(json, 358, 136, { m: { a: 0.6999969482421875, b: 0, c: 0, d: 0.6999969482421875, tx: 0, ty: 144.5 } }), // #305 _Button_Close
  ]);
  // v0.1.3 LAN lobby: the instructions frame without the back tab (the lobby draws its own BACK TO MENU button).
  const lanLobby = sprite(SCREEN_LAN_LOBBY_ID, [
    copyPlace(json, 376, 1),                    // #198 menu background
    copyPlace(json, 376, 4),                    // #56 _Size
    { op: 'place', depth: 6, move: false, id: 10, m: { ...I, a: 0.42, d: 0.42, tx: 466, ty: 6 } }, // #10 logo, small
  ]);
  // v0.1.4 LAN setup screen: same frame; the original SubScreen_Coop/DeathMatch (characters + level selector)
  // is attached at runtime by CScreen_LanSetup, so the page looks like the traditional 2-player select screen.
  const lanSetup = sprite(SCREEN_LAN_SETUP_ID, [
    copyPlace(json, 376, 1),                    // #198 menu background
    copyPlace(json, 376, 4),                    // #56 _Size
    { op: 'place', depth: 6, move: false, id: 10, m: { ...I, a: 0.42, d: 0.42, tx: 466, ty: 6 } }, // #10 logo, small
  ]);
  return [instructions, highscores, lanLobby, lanSetup];
}

/** Add the synthetic sprites and their linkages to library.json (idempotent). Call before `new Library(json)`. */
export function installLocalSymbols(json: LibraryJson): void {
  for (const s of buildLocalSymbols(json)) json.chars[String(s.id)] = s as CharDef;
  json.exports[SCREEN_INSTRUCTIONS_LINKAGE] = SCREEN_INSTRUCTIONS_ID;
  json.exports[LOCAL_HIGHSCORES_LINKAGE] = LOCAL_HIGHSCORES_ID;
  json.exports[SCREEN_LAN_LOBBY_LINKAGE] = SCREEN_LAN_LOBBY_ID;
  json.exports[SCREEN_LAN_SETUP_LINKAGE] = SCREEN_LAN_SETUP_ID;
}

/**
 * Deviation SAVE_QUIT_RESUME: a menu-style button drawn at runtime (the original menu / pause buttons are baked
 * library art whose labels cannot change). The clip is centred on (x, y) and carries a `_Contents` child holding
 * the drawn plate + label, so CScreen_Main.Register_Button's rollover (alpha + jitter filters on _Contents)
 * applies to it unchanged.
 */
export function buildMenuButton(parent: any, name: string, x: number, y: number, w: number, h: number, label: string, fontSize: number): any {
  const mc = parent.createEmptyMovieClip(name, parent.getNextHighestDepth());
  mc._x = x;
  mc._y = y;
  const contents = mc.createEmptyMovieClip('_Contents', mc.getNextHighestDepth());
  contents._x = -w / 2;
  contents._y = -h / 2;
  contents.lineStyle(2, 0x9c9c9c);
  contents.beginFill(0x181818);
  contents.moveTo(0, 0);
  contents.lineTo(w, 0);
  contents.lineTo(w, h);
  contents.lineTo(0, h);
  contents.lineTo(0, 0);
  contents.endFill();
  const tf = contents.createTextField('_Label', contents.getNextHighestDepth(), 0, (h - fontSize) / 2 - 2, w, h);
  tf.embedFonts = true;
  tf.selectable = false;
  tf.setNewTextFormat(new TextFormat('Arial Rounded MT Bold', fontSize, 0xffffff, true, false, false, undefined, undefined, 'center'));
  tf.text = label;
  return mc;
}
