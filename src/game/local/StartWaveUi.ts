// LOCAL deviation START_WAVE_SELECTOR (v0.1.9): the START WAVE cycler of the level selection screens. Drawn at
// runtime in the empty bottom-left band of Screen_SelectWorld (the scope-hidden _IconMoreGames / promo-button
// footprint), in the style of the runtime menu buttons (SAVE_QUIT_RESUME's buildMenuButton): caption + < value >.
// Single/Coop only (Death Match has no waves); the value is screen-session state (StartWave.ts), never the save.
import { TextFormat } from '../../engine/runtime.ts';
import { CSound } from '../packages.ts';
import { cycleSelectedStartWave, getSelectedStartWave } from './StartWave.ts';

const FONT = 'Arial Rounded MT Bold';

function label(mc: any, name: string, x: number, y: number, w: number, h: number, text: string, size: number, color: number): any {
  const tf = mc.createTextField(name, mc.getNextHighestDepth(), x, y, w, h);
  tf.embedFonts = true;
  tf.selectable = false;
  tf.setNewTextFormat(new TextFormat(FONT, size, color, true, false, false, undefined, undefined, 'center'));
  tf.text = text;
  return tf;
}

function arrow(parent: any, name: string, x: number, y: number, glyph: string, delta: number, refresh: () => void): any {
  const mc = parent.createEmptyMovieClip(name, parent.getNextHighestDepth());
  mc._x = x;
  mc._y = y;
  const contents = mc.createEmptyMovieClip('_Contents', mc.getNextHighestDepth());
  contents.lineStyle(2, 0x9c9c9c);
  contents.beginFill(0x181818);
  const S = 26;
  contents.moveTo(0, 0);
  contents.lineTo(S, 0);
  contents.lineTo(S, S);
  contents.lineTo(0, S);
  contents.lineTo(0, 0);
  contents.endFill();
  label(contents, '_Label', 0, 1, S, S, glyph, 18, 0xffffff);
  mc.onRelease = function (this: any): void {
    cycleSelectedStartWave(delta);
    refresh();
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
  label(mc, 'mcCaption', -80, -26, 160, 18, 'START WAVE', 13, 0x737373);
  const value = label(mc, 'mcValue', -25, -6, 50, 28, '1', 22, 0xffcc00);
  const refresh = (): void => { value.text = String(getSelectedStartWave()); };
  arrow(mc, 'bLeft', -58, -6, '<', -1, refresh);
  arrow(mc, 'bRight', 32, -6, '>', 1, refresh);
  refresh();
  return mc;
}
