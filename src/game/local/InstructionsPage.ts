// LOCAL instructions page (scope decision, deviation LOCAL_INSTRUCTIONS): the main menu's "INSTRUCTIONS" item opened
// the CrazyMonkeyGames site; the remake shows this screen instead. It is a real screen of the game's screen system
// (linkage "Screen_Instructions", class CScreen_Instructions extends Screen.CScreen), so CScreen_Collection shows it
// with the original cross-fade transition, and its "Back to menu" icon (_Icon_Back, wired by CScreen) returns to the
// main menu. The frame is assembled from original characters (localSymbols.ts); text uses the embedded fonts with
// the menus' styles (Arial Rounded MT Bold headings with the menu drop shadow, Calibri body, white glow).
import { TextFormat, flash, proto, registerClass } from '../../engine/runtime.ts';
import { CInput, CMain } from '../packages.ts';
import { CScreen } from '../Screen/CScreen.ts';
import { SCREEN_INSTRUCTIONS_LINKAGE } from './localSymbols.ts';

const INK = 0x333333;
const ACCENT = 0xcc0000;

/** Page content (English, as the original game). */
export const INSTRUCTIONS = {
  title: 'INSTRUCTIONS',
  player1: {
    title: 'PLAYER 1',
    keys: [
      ['Move', 'Arrow keys'],
      ['Shoot', '/'],
      ['Next weapon', '.'],
      ['Previous weapon', ','],
    ],
    note: 'Single player: SPACE also shoots, keys 1 - 0 select weapons',
  },
  player2: {
    title: 'PLAYER 2',
    keys: [
      ['Move', 'W  A  S  D'],
      ['Shoot', 'SPACE'],
      ['Next weapon', 'E'],
      ['Previous weapon', 'Q'],
    ],
    note: 'Keys can be changed in CONTROLS on the level select screen',
  },
  pause: 'P  =  PAUSE',
  modes: [
    ['SINGLE PLAY', 'Survive the endless waves of zombies and devils. Kill quickly to raise the multiplier: it unlocks new weapons and upgrades.'],
    ['COOPERATIVE', 'Two players on one keyboard. A fallen player comes back next to the partner - the game ends when both are dead.'],
    ['DEATH MATCH', 'Split screen, player against player. The first to reach the number of frags set in OPTIONS (5, 10, 20 or 50) wins.'],
  ],
  weaponsTitle: 'WEAPONS',
  weaponsNote: '(unlocked at kill multiplier)',
  weapons: [
    ['1', 'Pistol', ''],
    ['2', 'UZI', 'x5'],
    ['3', 'Shotgun', 'x10'],
    ['4', 'Barrel', 'x15'],
    ['5', 'Grenade', 'x20'],
    ['6', 'Fake Walls', 'x30'],
    ['7', 'Claymore', 'x40'],
    ['8', 'Rocket', 'x50'],
    ['9', 'Charge Pack', 'x55'],
    ['0', 'Railgun', 'x70'],
  ],
  // v0.1.2 additions (GAMEPAD_INPUT / SAVE_QUIT_RESUME / WAVE_CHECKPOINT_RETRY).
  gamepad: 'GAMEPAD: stick or d-pad moves - RT or A fires - RB / LB change weapon - START pauses - in menus the stick moves the cursor and A clicks',
  saving: 'SAVE & QUIT (pause screen) parks the run - CONTINUE (main menu) resumes the current wave - after death RETRY restarts the current wave',
  // v0.1.3 addition (LAN_MULTIPLAYER); v0.1.4: room + ready + host-driven setup flow.
  lan: 'LAN GAME (main menu, exe only): CREATE ROOM or join by list / IP - player 2 readies up, the host picks mode, both characters and the level - either key set or pad drives the local player - a ticking 30 s countdown guards reconnects',
} as const;

/** Short label of a Flash key code for the page (CInput.mValidKeys names without the quotes). */
export function keyLabel(code: number): string {
  if (code === 32) return 'SPACE';
  const name: unknown = CInput.mValidKeys?.[code]?.mName;
  if (typeof name !== 'string') return `KEY ${code}`;
  const quoted = /^'(.*)'$/.exec(name);
  return (quoted ? quoted[1]! : name).replace(/^ARROW /, '').replace(/^NUM PD '(.)'$/, 'NUM $1').trim() || name;
}

/**
 * Lane X1: the key rows of a player from the CURRENT save (CONTROLS window), so the page never contradicts a rebinding.
 * Falls back to the defaults of INSTRUCTIONS when the save is not available (tools / tests without a game).
 */
export function playerKeyRows(p: 1 | 2): (readonly [string, string])[] {
  const sd = CMain.mSaveData;
  const def = p === 1 ? INSTRUCTIONS.player1.keys : INSTRUCTIONS.player2.keys;
  if (!sd || !CInput.mValidKeys) return def.map((r) => [r[0], r[1]] as const);
  const k = (a: string): number => Number(sd[`mPlayer${p}_Key${a}`]);
  const move = [k('MoveUp'), k('MoveLeft'), k('MoveDown'), k('MoveRight')];
  const arrows = move.join() === '38,37,40,39';
  return [
    ['Move', arrows ? 'Arrow keys' : move.map(keyLabel).join('  ')],
    ['Shoot', keyLabel(k('Shoot'))],
    ['Next weapon', keyLabel(k('NextWeapon'))],
    ['Previous weapon', keyLabel(k('PrevWeapon'))],
  ];
}

function glow(): any[] {
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2)];
}

function menuShadow(): any[] {
  // the main menu items' drop shadow (Screen_Main placements: distance 5, blur 5, strength 0.18)
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2), new flash.filters.DropShadowFilter(5, 45, 0x000000, 1, 5, 5, 0.18, 1)];
}

export class CScreen_Instructions extends CScreen {
  override ctor(): void {
    super.ctor();
    this.mDepth = 100;
    this.Build();
  }

  override toString(): string {
    return this._CLASSID_;
  }

  Text(x: number, y: number, w: number, h: number, font: string, size: number, color: number, bold: boolean,
    align: 'left' | 'right' | 'center', text: string, multiline = false): any {
    const tf = this.createTextField('tf' + this.mDepth, this.mDepth++, x, y, w, h);
    tf.embedFonts = true;
    tf.selectable = false;
    if (multiline) {
      tf.multiline = true;
      tf.wordWrap = true;
    }
    tf.setNewTextFormat(new TextFormat(font, size, color, bold, false, false, undefined, undefined, align));
    tf.text = text;
    return tf;
  }

  Build(): void {
    const C = INSTRUCTIONS;
    this.Text(150, 14, 300, 40, 'Arial Rounded MT Bold', 30, INK, false, 'center', C.title).filters = menuShadow();

    const players = [C.player1, C.player2];
    for (let p = 0; p < 2; p++) {
      const pl = players[p]!;
      const x = p === 0 ? 40 : 340;
      this.Text(x, 62, 270, 24, 'Arial Rounded MT Bold', 18, ACCENT, false, 'left', pl.title).filters = menuShadow();
      const keys = playerKeyRows((p + 1) as 1 | 2);
      for (let i = 0; i < keys.length; i++) {
        const y = 88 + i * 19;
        this.Text(x, y, 120, 20, 'Calibri', 14, INK, true, 'left', keys[i]![0]).filters = glow();
        this.Text(x + 120, y, 175, 20, 'Calibri', 14, 0x000000, true, 'left', keys[i]![1]).filters = glow();
      }
      this.Text(x, 166, 280, 36, 'Calibri', 12, INK, false, 'left', pl.note, true).filters = glow();
    }
    this.Text(170, 198, 300, 24, 'Arial Rounded MT Bold', 16, INK, false, 'center', C.pause).filters = menuShadow();

    for (let i = 0; i < C.modes.length; i++) {
      const y = 228 + i * 44;
      this.Text(40, y, 150, 22, 'Arial Rounded MT Bold', 15, ACCENT, false, 'left', C.modes[i]![0]).filters = menuShadow();
      this.Text(190, y + 1, 410, 42, 'Calibri', 13, INK, true, 'left', C.modes[i]![1], true).filters = glow();
    }

    this.Text(40, 364, 150, 22, 'Arial Rounded MT Bold', 15, ACCENT, false, 'left', C.weaponsTitle).filters = menuShadow();
    this.Text(140, 367, 300, 20, 'Calibri', 12, INK, false, 'left', C.weaponsNote).filters = glow();
    for (let i = 0; i < C.weapons.length; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 40 + col * 116;
      const y = 392 + row * 22;
      const [key, name, at] = C.weapons[i]!;
      this.Text(x, y, 24, 22, 'Arial Rounded MT Bold', 14, ACCENT, false, 'left', key).filters = glow();
      this.Text(x + 15, y + 1, 76, 22, 'Calibri', 13, 0x000000, true, 'left', name).filters = glow();
      this.Text(x + 88, y + 1, 30, 22, 'Calibri', 13, INK, false, 'left', at).filters = glow();
    }

    // v0.1.2 / v0.1.3 additions: three compact lines in the free bottom strip.
    this.Text(40, 432, 560, 18, 'Calibri', 11, INK, false, 'center', C.gamepad, true).filters = glow();
    this.Text(40, 448, 560, 18, 'Calibri', 11, INK, false, 'center', C.saving, true).filters = glow();
    this.Text(40, 464, 560, 18, 'Calibri', 11, INK, false, 'center', C.lan, true).filters = glow();
  }
}
proto(CScreen_Instructions, { _CLASSID_: 'CScreen_Instructions' });

/** Register the page class for its synthetic linkage (the symbol itself is added by installLocalSymbols). */
export function registerInstructionsPage(): void {
  registerClass(SCREEN_INSTRUCTIONS_LINKAGE, CScreen_Instructions);
}
