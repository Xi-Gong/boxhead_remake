// Shared style tokens + widget builders for the REMAKE-ADDED UI (deviations SAVE_QUIT_RESUME / LAN_MULTIPLAYER /
// START_WAVE_SELECTOR / GAMEPAD_INPUT), so every added surface speaks the ORIGINAL game's visual language instead
// of the pre-v0.2.2 ad-hoc dark plates. All builders draw with the engine's Flash Graphics API + the embedded SWF
// fonts (embedFonts = true), on the authored 640x480 content space - layout is resolution-independent by
// construction (DYNAMIC_VIEWPORT centres that space on any window).
//
// Style tokens are measured from the original art (library.json + gallery renders):
//   menu items   Arial Rounded MT Bold #333333 + DropShadow(5, 45deg, black, blur 5, strength 0.18), idle alpha 50,
//                rollover alpha 100 + jitter (CScreen_Main.Register_Button does both on the _Contents child).
//   section text Calibri, the game's signature red #ef1304 (chars 502/503).
//   option pills the select screens' OPTIONS/CONTROLS pills: near-white #f5f5f3 capsule, soft #d8d8d8 bottom-right
//                shade, near-black #1f1f1f bold label; the options window's selected marker is a #e60000 @ 35%
//                alpha wash (sprite 358) - reused as the hover/selected feedback.
import { TextFormat, flash } from '../../engine/runtime.ts';

// ---- tokens ---------------------------------------------------------------------------------------------------------------------------- -

export const INK = 0x333333;            // menu text / body copy on light surfaces
export const RED = 0xef1304;            // the game's signature red (section headings, accents)
export const GREY = 0x888888;           // secondary copy
export const GREEN = 0x007000;          // status-ok copy (ready states, ping) on light surfaces
/** The options-window selected marker's wash (sprite 358: #e60000 at 35% alpha). */
export const WASH_COLOR = 0xe60000;
export const WASH_ALPHA = 35;               // AS2 drawing-API alpha: percent (0..100), not 0..1
/** The select-screen pill family. */
export const PILL_FILL = 0xf5f5f3;
export const PILL_SHADE = 0xd8d8d8;     // the soft bottom/right shade of the raised pill
export const PILL_LABEL = 0x1f1f1f;
export const MENU_FONT = 'Arial Rounded MT Bold';
export const BODY_FONT = 'Calibri';

/** The soft 45-degree shadow carried by the authored menu parents. */
export function menuShadow(): any[] {
  return [new flash.filters.DropShadowFilter(5, 45, 0x000000, 1, 5, 5, 0.18, 1)];
}

/** Plain white glow (labels over art, the options-window look). */
export function glow(): any[] {
  return [new flash.filters.GlowFilter(0xffffff, 1, 6, 6, 6, 2)];
}

/** A bordered text field helper (the common shape of the per-screen Text() duplicates). */
export function text(parent: any, name: string, x: number, y: number, w: number, h: number, font: string, size: number,
  color: number, bold: boolean, align: 'left' | 'right' | 'center', value: string, multiline = false): any {
  const tf = parent.createTextField(name, parent.getNextHighestDepth(), x, y, w, h);
  tf.embedFonts = true;
  tf.selectable = false;
  if (multiline) {
    tf.multiline = true;
    tf.wordWrap = true;
  }
  tf.setNewTextFormat(new TextFormat(font, size, color, bold, false, false, undefined, undefined, align));
  tf.text = value;
  return tf;
}

/** Bold centred ARMTB label (the menu font family) in one call. */
export function menuText(parent: any, name: string, x: number, y: number, w: number, h: number, label: string,
  size: number, color = INK): any {
  return text(parent, name, x, y, w, h, MENU_FONT, size, color, true, 'center', label);
}

/** Draw the raised pill base into `g` at (0,0)-(w,h): soft shade capsule + the near-white capsule on top. */
export function pillBase(g: any, w: number, h: number): void {
  g.lineStyle();
  g.beginFill(PILL_SHADE, 100);
  capsule(g, 1, 1.5, w, h);
  g.endFill();
  g.beginFill(PILL_FILL, 100);
  capsule(g, 0, 0, w, h);
  g.endFill();
}

/** A #e60000@35% wash capsule child of `parent` covering (x,y)-(x+w,y+h), hidden by default. */
export function washCapsule(parent: any, name: string, x: number, y: number, w: number, h: number): any {
  const mc = parent.createEmptyMovieClip(name, parent.getNextHighestDepth());
  mc._x = x;
  mc._y = y;
  mc.beginFill(WASH_COLOR, WASH_ALPHA);
  capsule(mc, 0, 0, w, h);
  mc.endFill();
  mc._visible = false;
  return mc;
}

/**
 * A BARE-TEXT menu item, visually indistinguishable from the baked main-menu items (ARMTB #333333 + menu shadow).
 * The label sits in a `_Contents` child, so CScreen_Main.Register_Button's rollover (alpha 50 -> 100 + jitter
 * filters) applies unchanged; callers wire onRelease on the returned clip. Centred on (x, y).
 */
export function menuTextItem(parent: any, name: string, x: number, y: number, label: string, size: number): any {
  const mc = parent.createEmptyMovieClip(name, parent.getNextHighestDepth());
  mc._x = x;
  mc._y = y;
  const contents = mc.createEmptyMovieClip('_Contents', mc.getNextHighestDepth());
  text(contents, '_Label', -150, -size * 0.67, 300, 30, MENU_FONT, size, INK, false, 'center', label);
  // Authored items carry their soft shadow on the PARENT; Register_Button owns child hover filters.
  // A white child glow made additions look outlined and disappeared permanently on the first roll-out.
  mc.filters = menuShadow();
  return mc;
}

/**
 * A select-screen pill button (the OPTIONS/CONTROLS family): near-white capsule with a soft bottom/right shade and
 * a bold near-black label. Hover feedback is the options window's own selected wash (#e60000 @ 35%) plus the label
 * flipping to the signature red; `selected` keeps the wash on (a primary/default action). Centred on (x, y).
 */
export function pillButton(parent: any, name: string, x: number, y: number, w: number, h: number, label: string,
  size: number, opts: { selected?: boolean } = {}): any {
  const mc = parent.createEmptyMovieClip(name, parent.getNextHighestDepth());
  mc._x = x;
  mc._y = y;
  const contents = mc.createEmptyMovieClip('_Contents', mc.getNextHighestDepth());
  contents._x = -w / 2;
  contents._y = -h / 2;
  pillBase(contents, w, h);
  const wash = washCapsule(contents, '_Wash', 0, 0, w, h);
  const tf = text(contents, '_Label', 0, (h - size) / 2 - 2, w, h, BODY_FONT, size, PILL_LABEL, true, 'center', label);
  const setHover = (on: boolean, selected: boolean): void => {
    const enabled = mc.enabled !== false;
    wash._visible = enabled && (on || selected);
    if (tf) tf.textColor = enabled && on ? RED : PILL_LABEL;
  };
  const selected = !!opts.selected;
  wash._visible = selected;
  mc.onRollOver = (): void => setHover(true, selected);
  mc.onRollOut = (): void => setHover(false, selected);
  mc.onDragOut = (): void => setHover(false, selected);
  return mc;
}

/** Keep visual disabled state and actual hit testing together. */
export function setButtonEnabled(button: any, enabled: boolean, disabledAlpha = 45): void {
  button.enabled = enabled;
  button._alpha = enabled ? 100 : disabledAlpha;
  if (!enabled) button.onRollOut?.();
}

export function setButtonLabel(button: any, value: string): void {
  if (button?._Contents?._Label) button._Contents._Label.text = value;
}

/** A capsule path (pill = radius h/2) from (x, y) to (x+w, y+h). */
export function capsule(g: any, x: number, y: number, w: number, h: number): void {
  const r = Math.min(h / 2, w / 2);
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.curveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.curveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.curveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.curveTo(x, y, x + r, y);
}

/**
 * The original options-window panel: dims the page (#274 mcLock art, black @ 10%) and centres the white panel card
 * (#317 art with its drop shadow) - the same chrome the local highscore table uses (localSymbols 9005), attached
 * at the screen centre. Coordinates inside the returned clip are CENTRED on the panel (x -230..230 = the 460-wide
 * content area, like the highscore table's layout). The mcLock also swallows stray clicks, as the original's does.
 */
export function panelCard(parent: any, name = '_PanelCard'): any {
  return parent.attachMovie('Local_PanelCard', name, parent.getNextHighestDepth(), { _x: 320, _y: 240 });
}
