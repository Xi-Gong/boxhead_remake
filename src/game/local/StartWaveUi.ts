// LOCAL deviation START_WAVE_SELECTOR (v0.1.9): the START WAVE cycler of the level selection screens. Drawn at
// runtime in the empty bottom-left band of Screen_SelectWorld (the scope-hidden _IconMoreGames / promo-button
// footprint). v0.2.2 restyle (UiStyle): the select screens' own control language - a near-white capsule value
// plate with the bold near-black number, flanked by outlined white arrow buttons (the level selector's arrow
// family) with the options-window #e60000@35% wash as hover feedback - instead of the old dark plates.
// Single/Coop only (Death Match has no waves); the value is screen-session state (StartWave.ts), never the save.
import { CSound } from '../packages.ts';
import { cycleSelectedStartWave, getSelectedStartWave } from './StartWave.ts';
import { PILL_FILL, PILL_LABEL, menuText, pillBase, washCapsule } from './UiStyle.ts';

/** An outlined white square arrow button with a solid dark triangle (the level selector's arrow family). */
function arrow(parent: any, name: string, x: number, y: number, dir: -1 | 1, onPress: () => void): any {
  const S = 26;
  const mc = parent.createEmptyMovieClip(name, parent.getNextHighestDepth());
  mc._x = x;
  mc._y = y;
  const c = mc.createEmptyMovieClip('_Contents', mc.getNextHighestDepth());
  c._x = -S / 2;
  c._y = -S / 2;
  c.lineStyle(2, 0x6b6b6b);
  c.beginFill(PILL_FILL, 1);
  c.moveTo(0, 0);
  c.lineTo(S, 0);
  c.lineTo(S, S);
  c.lineTo(0, S);
  c.lineTo(0, 0);
  c.endFill();
  c.lineStyle();
  c.beginFill(PILL_LABEL, 1);
  const cx = S / 2, half = 6;
  c.moveTo(cx + dir * half, S / 2);
  c.lineTo(cx - dir * half * 0.6, S / 2 - half);
  c.lineTo(cx - dir * half * 0.6, S / 2 + half);
  c.lineTo(cx + dir * half, S / 2);
  c.endFill();
  const hover = washCapsule(c, '_Wash', 0, 0, S, S);
  mc.onRollOver = function (): void { hover._visible = true; };
  mc.onRollOut = function (): void { hover._visible = false; };
  mc.onDragOut = mc.onRollOut;
  mc.onRelease = function (): void {
    onPress();
    CSound.mSamples.Click2.PlaySound(); // the map/character cyclers' sound
  };
  return mc;
}

/**
 * Build the cycler on `parent` (the CScreen_SelectWorld screen), centred on stage (x, y). Returns the clip; fields:
 * mcValue (the number TextField), bLeft / bRight (the arrow buttons).
 */
export function buildStartWaveCycler(parent: any, x: number, y: number): any {
  const mc = parent.createEmptyMovieClip('mcStartWave', parent.getNextHighestDepth());
  mc._x = x;
  mc._y = y;
  // caption centred above the plate with a one-GAP break; the plate is a 90x28 pill like the value plates
  menuText(mc, 'mcCaption', -79, -30, 158, 16, 'START WAVE', 12);
  const plate = mc.createEmptyMovieClip('mcPlate', mc.getNextHighestDepth());
  plate._x = -45;
  plate._y = -14;
  pillBase(plate, 90, 28);
  const value = menuText(plate, 'mcValue', 0, 3, 90, 24, '1', 18, PILL_LABEL);
  const refresh = (): void => { value.text = String(getSelectedStartWave()); };
  const bump = (d: number): void => { cycleSelectedStartWave(d); refresh(); };
  mc.bLeft = arrow(mc, 'bLeft', -60, 0, -1, () => bump(-1));
  mc.bRight = arrow(mc, 'bRight', 60, 0, 1, () => bump(1));
  mc.mcValue = value;
  refresh();
  return mc;
}
