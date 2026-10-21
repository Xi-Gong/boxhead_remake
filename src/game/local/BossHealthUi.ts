// BOSS_OVERHEAD_HEALTH: presentation only; HP is supplied by the same confirmed state as the wave HUD.
import {bossMembers,type BossWaveState,type BossMemberState} from './TimedWaves.ts';
import { capsule } from './UiStyle.ts';
import {simplifiedWorld} from './CombatRules.ts';

const WIDTH = 64, HEIGHT = 7, GAP = 5;
const paints=new WeakMap<object,{width:number;height:number;fraction:number;kind:BossMemberState['kind']}>();

/** Uses the rendered frame's crown/shoulder bounds without updating animation or simulation state. */
export function bossHealthLayout(world: any, boss: BossMemberState | undefined) {
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
  const simple=simplifiedWorld(world),width=simple?boss.kind==='charger'||boss.kind==='zombie'?44:40:WIDTH,height=simple?5:HEIGHT,gap=simple?4:GAP;
  const x = Math.round(Math.max(2, Math.min(screen.x - width - 2, position.x - width / 2)));
  const y = Math.round(Math.max(2, top - height - gap));
  const life = Math.min(boss.maximum, boss.life);
  return { x, y, width, height, headTop: top,
    fraction: Math.max(0, Math.min(1, life / boss.maximum)) };
}

export function drawBossHealth(world: any, boss: BossWaveState | undefined, visible: boolean): void {
  const members=boss?bossMembers(boss):[],layouts=members.map(m=>visible?bossHealthLayout(world,m):undefined);
  let layer = world._BossHealthHud;
  if (layouts.some(Boolean) && !layer) {
    layer = world.createEmptyMovieClip('_BossHealthHud', world.getNextHighestDepth());
  }
  if (!layer) return;
  layer._visible=layouts.some(Boolean);
  for(let i=0;i<3;i++)if(layer['_Boss'+i])layer['_Boss'+i]._visible=false;
  for(const [i,layout]of layouts.entries()){
    if(!layout)continue;
    const bar=layer['_Boss'+i]??layer.createEmptyMovieClip('_Boss'+i,layer.getNextHighestDepth());
    bar._visible=true;paintBar(bar,layout,members[i]!);
  }
}
function paintBar(layer:any,layout:NonNullable<ReturnType<typeof bossHealthLayout>>,boss:BossMemberState):void{
  layer._x = layout.x; layer._y = layout.y;
  const {width,height}=layout;
  const previous=paints.get(layer);
  // Camera/animation movement changes placement, not the bar's paths. Clip-owned cache is render-only.
  if(previous&&previous.width===width&&previous.height===height&&previous.fraction===layout.fraction&&previous.kind===boss.kind)return;
  layer.clear();
  const pill = (x: number, y: number, w: number, h: number, color: number, alpha = 100): void => {
    if(w<=0)return;
    layer.beginFill(color, alpha); capsule(layer,x,y,w,h); layer.endFill();
  };
  const accent = boss.kind === 'charger'||boss.kind==='zombie' ? 0xd5c89a : boss.kind==='butcher'?0xd99a88:boss.kind==='hunter'?0x9cd4cf:0xffae64;
  pill(0,0,width,height,0x171a18,94);
  pill(1,1,width-2,height-2,0x534844);
  pill(1,1,Math.max(1,(width-2)*layout.fraction),height-2,accent);
  pill(2,1,Math.max(0,(width-2)*layout.fraction-2),1,0xffecd0,65);
  paints.set(layer,{width,height,fraction:layout.fraction,kind:boss.kind});
}
