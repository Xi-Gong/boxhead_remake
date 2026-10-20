// BOSS_OVERHEAD_HEALTH: presentation only; HP is supplied by the same confirmed state as the wave HUD.
import type { BossWaveState } from './TimedWaves.ts';
import { BODY_FONT, text } from './UiStyle.ts';

const WIDTH = 118, HEIGHT = 28, GAP = 5;

export function compactBossHealth(value: number): string {
  const hp = Math.max(0, Math.ceil(value));
  if (!Number.isFinite(hp)) return '?';
  if (hp < 10000) return String(hp);
  for (const [limit, unit] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
    if (hp >= limit && hp < 1e15) {
      const scaled = hp / limit;
      return Number(scaled.toFixed(scaled < 10 ? 2 : 1)) + unit;
    }
  }
  return hp.toExponential(2).replace('+', '');
}

/** Uses the rendered frame's crown/shoulder bounds without updating animation or simulation state. */
export function bossHealthLayout(world: any, boss: BossWaveState | undefined) {
  if (!boss?.id || boss.defeated || !(boss.life > 0) || !(boss.maximum > 0)) return;
  const enemy = world.mThing_Collection?.mThings[boss.id];
  if (!enemy?.mPosition || enemy.mBossKind !== boss.kind) return;
  const anim = enemy.mXSI_Animation, object = anim?.mAnimationObject;
  const frame = object?.mDirections[object.mLookup256[enemy.mAngle.__get__mAngle256() & 255]]
    ?.mFrames[anim.mCurrentFrameID & 16777215];
  if (!frame?.mDisp || !frame.sBMD) return;
  const position = world.GetScreenPosition(enemy.mPosition), screen = world.mScreenSize;
  const top = position.y + frame.mDisp.y, left = position.x + frame.mDisp.x;
  // Do not pin labels to screen edges for enemies outside this camera's visible playfield.
  if (position.x < 0 || position.x > screen.x || top > screen.y ||
      top + frame.sBMD.height < 0 || left + frame.sBMD.width < 0 || left > screen.x) return;
  const x = Math.round(Math.max(2, Math.min(screen.x - WIDTH - 2, position.x - WIDTH / 2)));
  const y = Math.round(Math.max(2, top - HEIGHT - GAP));
  const life = Math.min(boss.maximum, boss.life);
  return { x, y, width: WIDTH, height: HEIGHT, headTop: top,
    anchorX: Math.max(4, Math.min(WIDTH - 4, position.x - x)),
    fraction: Math.max(0, Math.min(1, life / boss.maximum)),
    label: `${compactBossHealth(life)} / ${compactBossHealth(boss.maximum)}` };
}

export function drawBossHealth(world: any, boss: BossWaveState | undefined, visible: boolean): void {
  const layout = visible ? bossHealthLayout(world, boss) : undefined;
  let layer = world._BossHealthHud;
  if (layout && !layer) {
    layer = world.createEmptyMovieClip('_BossHealthHud', world.getNextHighestDepth());
    text(layer, '_Health', 2, 0, WIDTH - 4, 19, BODY_FONT, 12, 0xffffff, true, 'center', '');
  }
  if (!layer) return;
  layer._visible = !!layout;
  if (!layout) return;
  layer._x = layout.x; layer._y = layout.y; layer._Health.text = layout.label;
  layer.clear();
  const rect = (x: number, y: number, w: number, h: number, color: number, alpha = 100): void => {
    layer.beginFill(color, alpha); layer.moveTo(x, y); layer.lineTo(x + w, y);
    layer.lineTo(x + w, y + h); layer.lineTo(x, y + h); layer.lineTo(x, y); layer.endFill();
  };
  const accent = boss!.kind === 'charger' ? 0xd5c89a : 0xffae64;
  rect(0, 0, WIDTH, HEIGHT, 0x171a18, 94);
  rect(3, 19, WIDTH - 6, 6, 0x534844);
  rect(3, 19, (WIDTH - 6) * layout.fraction, 6, accent);
  rect(3, 19, (WIDTH - 6) * layout.fraction, 1, 0xffecd0);
  // Small pointer keeps ownership clear when the label shifts inward at a screen edge.
  layer.beginFill(accent); layer.moveTo(layout.anchorX - 3, HEIGHT);
  layer.lineTo(layout.anchorX, HEIGHT + 3); layer.lineTo(layout.anchorX + 3, HEIGHT);
  layer.lineTo(layout.anchorX - 3, HEIGHT); layer.endFill();
}
