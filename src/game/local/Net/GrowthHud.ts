// LAN_PERSONAL_GROWTH: display-only, world-owned clips. No simulation fields, timers or DOM listeners.
import { flash, TextFormat } from '../../../engine/runtime.ts';
import { nowMs } from '../../../engine/flash/clock.ts';
import { CMain, World } from '../../packages.ts';
import { timedWave } from '../TimedWaves.ts';
import { clockLabel } from '../TimedWaveRules.ts';
import { BODY_FONT, MENU_FONT, INK, RED, text, capsule } from '../UiStyle.ts';
import { growthOf, MAX_LEVEL, xpRequired, growthAtMaximum, infiniteGrowthWeapon, type GrowthState } from './Growth.ts';
import { netSession } from './NetSession.ts';
import { remainingEnemies, type EnemyCounts } from './EnemyCounts.ts';
import { compactStat, draftBonuses } from '../WaveDraftRules.ts';
import {TIERED_GROWTH_RULE,tieredLevelStats} from '../TieredGrowthRules.ts';
import {combatWorld} from '../CombatRules.ts';
import {capturePlayerStats} from '../PlayerStats.ts';

export const GROWTH_HUD = { margin: 12, width: 210, height: 46, centerWidth: 172, top: 4 } as const;
export function growthLayout(width: number): { left: number; right: number; center: number; bottom: number } {
  return { left: GROWTH_HUD.margin, right: width - GROWTH_HUD.margin - GROWTH_HUD.width,
    center: (width - GROWTH_HUD.centerWidth) / 2, bottom: GROWTH_HUD.top + GROWTH_HUD.height };
}
interface Side { clip: any; score: any; level: any; xp: any; fill: any; lastScore: number; lastLevel: number; lastXp: number; pulseUntil: number; pulse: boolean }
interface HudView { clip: any; sides: Side[]; center: any; wave: any; zombies: any; devils: any; lastWave: number; lastWidth: number }
const views = new WeakMap<object, HudView>();
/** World-local bounds match the bitmap draw plane, including wide/tall viewport layout. */
export function growthScoreTarget(hud: any, owner: number): { x: number; y: number } | undefined {
  const score = views.get(hud)?.sides[owner]?.score;
  if (!score) return undefined;
  const bounds = score.getBounds(hud.mWorld);
  return { x: (bounds.xMin + bounds.xMax) / 2, y: (bounds.yMin + bounds.yMax) / 2 };
}
const outlined = (): any[] => [new flash.filters.GlowFilter(0x000000, 1, 2, 2, 10, 1)];

function backing(clip: any, width: number, height: number): void {
  clip.lineStyle(0.5, 0x777777, 30);
  clip.beginFill(0xf5f5f3, 85);
  // Small-radius corners echo the original game's life bar without a large menu-shaped capsule.
  const r=5;
  clip.moveTo(r,0); clip.lineTo(width-r,0); clip.curveTo(width,0,width,r);
  clip.lineTo(width,height-r); clip.curveTo(width,height,width-r,height);
  clip.lineTo(r,height); clip.curveTo(0,height,0,height-r); clip.lineTo(0,r); clip.curveTo(0,0,r,0);
  clip.endFill(); clip.lineStyle();
}
function side(parent: any, index: number): Side {
  const clip = parent.createEmptyMovieClip('_Player' + index, parent.getNextHighestDepth());
  backing(clip,GROWTH_HUD.width,GROWTH_HUD.height);
  text(clip,'_Identity',7,3,34,19,BODY_FONT,12,index===0?RED:INK,true,'left','P'+(index+1));
  const score=text(clip,'_Score',38,0,164,26,MENU_FONT,18,0xffffff,false,'right',''); score.filters=outlined();
  const level=text(clip,'_Level',7,24,78,16,BODY_FONT,11,INK,true,'left','');
  const xp=text(clip,'_Experience',89,24,113,16,BODY_FONT,11,INK,false,'right','');
  const track=clip.createEmptyMovieClip('_Track',clip.getNextHighestDepth()); track._x=8; track._y=39;
  track.beginFill(0x333333,22); capsule(track,0,0,194,4); track.endFill();
  const fill=track.createEmptyMovieClip('_Fill',track.getNextHighestDepth());
  fill.beginFill(0x00c800,100); capsule(fill,0,0,194,4); fill.endFill();
  return {clip,score,level,xp,fill,lastScore:-1,lastLevel:-1,lastXp:-1,pulseUntil:0,pulse:false};
}
function create(hud: any): HudView {
  const world=hud.mWorld;
  const clip=world.createEmptyMovieClip('_LanGrowthHud',world.getNextHighestDepth());
  clip._y=GROWTH_HUD.top;
  const center=clip.createEmptyMovieClip('_Wave',clip.getNextHighestDepth()); backing(center,GROWTH_HUD.centerWidth,46);
  text(center,'_Caption',54,0,64,17,BODY_FONT,10,INK,true,'center','WAVE');
  const wave=text(center,'_Number',54,14,64,30,MENU_FONT,22,0xffffff,false,'center',''); wave.filters=outlined();
  text(center,'_Clock',54,30,64,15,BODY_FONT,11,INK,true,'center','');
  text(center,'_ZombieCaption',0,0,54,17,BODY_FONT,10,0x49554a,true,'center','ZOMBIE');
  text(center,'_DevilCaption',118,0,54,17,BODY_FONT,10,RED,true,'center','DEVIL');
  const zombies=text(center,'_Zombies',0,18,54,26,MENU_FONT,18,INK,false,'center','');
  const devils=text(center,'_Devils',118,18,54,26,MENU_FONT,18,0xa60000,false,'center','');
  center.lineStyle(.5,0x777777,22);
  for(const x of [54,118]){center.moveTo(x,10);center.lineTo(x,36);}center.lineStyle();
  const sides = [side(clip,0)];
  if (World.CWorld.mGameMode !== 'Single') sides.push(side(clip,1));
  const result:HudView={clip,sides,center,wave,zombies,devils,lastWave:-1,lastWidth:-1};
  clip.onUnload=():void=>{views.delete(hud);};
  views.set(hud,result); return result;
}
function update(hud: any, state: GrowthState, wave: number, enemies: EnemyCounts): void {
  const view=views.get(hud)??create(hud), width=hud.mWorld.mScreenSize.x, time=nowMs();
  const session=netSession(),timer=session?session.confirmedTimedWave:timedWave(hud.mWorld);
  const size=timer?18:22;
  view.wave._y=timer?10:14;view.wave._height=timer?24:30;
  view.center._Clock._visible=!!timer&&timer.phase==='combat';
  if(timer){view.center._Clock.text=clockLabel(timer.remainingTicks,CMain.mFPS);view.center._Clock.textColor=timer.remainingTicks<=CMain.mFPS*30?RED:INK;}
  view.clip._visible=!hud.mcScreenPause;
  if(view.lastWidth!==width){
    const layout=growthLayout(width);
    view.sides[0]!.clip._x=layout.left;
    if (view.sides[1]) view.sides[1].clip._x=layout.right;
    view.center._x=layout.center;
    view.lastWidth=width;
  }
  if(view.lastWave!==wave){
    view.wave.text=String(wave);view.wave.setTextFormat(new TextFormat(MENU_FONT,size,0xffffff,false,false,false,undefined,undefined,'center'));
    if(view.wave.textWidth>60)view.wave.setTextFormat(new TextFormat(MENU_FONT,size*60/view.wave.textWidth,0xffffff,false,false,false,undefined,undefined,'center'));
    view.lastWave=wave;
  }
  if(view.zombies.text!==String(enemies.zombies))view.zombies.text=String(enemies.zombies);
  if(view.devils.text!==String(enemies.devils))view.devils.text=String(enemies.devils);
  for(let index=0;index<view.sides.length;index++){
    const p=state.players[index]!, ui=view.sides[index]!;
    const progressChanged=ui.lastXp!==p.xp||ui.lastLevel!==p.level;
    if(ui.lastScore!==p.score){
      const value=String(p.score).padStart(12,'0');
      ui.score.setNewTextFormat(new TextFormat(MENU_FONT,Math.min(18,18*12/value.length),0xffffff,false,false,false,undefined,undefined,'right'));
      ui.score.text=value;ui.lastScore=p.score;
    }
    if(ui.lastLevel!==p.level){
      if(ui.lastLevel>=0&&p.level>ui.lastLevel)ui.pulseUntil=time+700;
      ui.level.text='LV '+p.level;ui.lastLevel=p.level;
      ui.level.setTextFormat(new TextFormat(BODY_FONT,11,INK,true));
      if(ui.level.textWidth>74)ui.level.setTextFormat(new TextFormat(BODY_FONT,11*74/ui.level.textWidth,INK,true));
    }
    const pulse=time<ui.pulseUntil;
    if(progressChanged||ui.pulse!==pulse||ui.xp.text===''){
      ui.xp.text=growthAtMaximum(p)?'MAX':pulse?'LEVEL UP!':`${p.xp} / ${xpRequired(p)} XP`;
      ui.xp.setTextFormat(new TextFormat(BODY_FONT,11,INK,false,false,false,undefined,undefined,'right'));
      if(ui.xp.textWidth>109)ui.xp.setTextFormat(new TextFormat(BODY_FONT,11*109/ui.xp.textWidth,INK,false,false,false,undefined,undefined,'right'));
      ui.xp.textColor=pulse?0x007000:INK;ui.level.textColor=pulse?0x007000:INK;
      ui.pulse=pulse;ui.lastXp=p.xp;
    }
    if(progressChanged){
      ui.fill._xscale=growthAtMaximum(p)?100:p.xp/xpRequired(p)*100;
      ui.fill._visible=growthAtMaximum(p)||p.xp>0;
    }
  }
}

const WEAPONS=[['pistol','Pistol'],['uzi','UZI'],['shotgun','Shotgun'],['barrel','Barrel'],['grenade','Grenade'],
  ['fakewall','Fake wall'],['mine','Claymore'],['rocket','Rocket'],['chargepack','Charge pack'],['railgun','Railgun']];
function pauseGrowth(hud: any, state: GrowthState): void {
  const pause=hud.mcScreenPause;
  if(!pause||pause._PersonalUpgrades)return;
  const oldHeading=pause.getInstanceAtDepth(15); if(oldHeading)oldHeading._visible=false;
  for(let n=0;n<100;n++)if(pause['upgrade_'+n])pause['upgrade_'+n]._visible=false;
  const layer=pause.createEmptyMovieClip('_PersonalUpgrades',pause.getNextHighestDepth());
  text(layer,'_Title',0,73,640,20,BODY_FONT,13,0xffffff,true,'center','PERSONAL UPGRADES');
  const count=World.CWorld.mGameMode==='Single'?1:2;
  for(let i=0;i<count;i++){
    const x=count===1?180:28+i*304,p=state.players[i]!;
    const heading=text(layer,'_Player'+i,x,99,280,22,MENU_FONT,14,0xffffff,false,'left',`P${i+1}  /  LV ${p.level}  /  ${growthAtMaximum(p)?'MAX':p.xp+'/'+xpRequired(p)+' XP'}`);
    if(heading.textWidth>276){const format=heading.getTextFormat();format.size*=276/heading.textWidth;heading.setTextFormat(format);}
    if(p.endless){
      const session=netSession(),bonus=session?session.confirmedWaveDraft?.bonuses[i]:hud.mWorld.mUpgrades.waveDraft?draftBonuses(hud.mWorld,i):undefined;
      const tiered=p.tiered===TIERED_GROWTH_RULE,stats=tieredLevelStats(p.level),base=tiered?stats.vitality:200+4*(p.level-1),damage=tiered?stats.damage:.01*Math.max(0,p.level-125),capacity=tiered?stats.capacity:0;
      const modern=session?!!session.confirmedPlayerStats?.[i]?.previews:combatWorld(hud.mWorld);
      const ammoText=modern?'AMMO <3x':`AMMO +${compactStat(((1+capacity)*(1+.15*(bonus?.capacity??0))-1)*100)}%`;
      const actual=session?session.confirmedPlayerStats?.find(s=>s.index===i):capturePlayerStats(hud.mWorld).find(s=>s.index===i);
      const caption=`HP ${compactStat(actual?.maximum??Math.round(base*(1+.1*(bonus?.health??0))))} / SHIELD ${compactStat(actual?.armorMaximum??Math.round(base*(1+.1*(bonus?.armor??0))))} | DMG +${compactStat(((1+damage)*(1+.08*(bonus?.damage??0))-1)*100)}% | ${ammoText}`;
      const summary=text(layer,'_GrowthStats'+i,x,122,280,16,BODY_FONT,10,0xcccccc,false,'left',caption);
      if(summary.textWidth>276){const format=summary.getTextFormat();format.size*=276/summary.textWidth;summary.setTextFormat(format);}
    }
    const groups:Record<string,Record<string,boolean>>={pistol:{}};
    for(let n=1;n<=Math.min(MAX_LEVEL,p.level);n++)for(const item of hud.mWorld.mUpgrades.mMultipliers[n]??[]){
      if(item.mClassID==='CThing_Creature_Player'&&typeof item.mValue==='string')groups[item.mValue]??={};
      else if(item.mName){
        const key=item.mClassID.replace(/^CThing_(?:Weapon|Object)_/,'').toLowerCase();
        if(item.mValue===true)(groups[key]??={})[item.mProp]=true;
      }
    }
    let row=0;
    for(const [key,name] of WEAPONS){
      if(!groups[key!])continue;
      const y=(p.endless?144:129)+row++*(p.endless?31:34);
      text(layer,`_Weapon${i}_${key}`,x,y,280,17,BODY_FONT,12,0xffffff,true,'left',name!);
      const flags=groups[key!]!, details:string[]=[];
      for(const [prop,label] of Object.entries(PERK_LABELS)){
        if(!flags[prop])continue;
        if((prop==='DoubleDamage'&&(flags.QuadDamage||flags.FatalDamage))||(prop==='QuadDamage'&&flags.FatalDamage)
          ||(prop==='DoubleAmmo'&&(flags.QuadAmmo||flags.InfinateAmmo))||(prop==='QuadAmmo'&&flags.InfinateAmmo)
          ||(prop==='FastFire'&&flags.RapidFire)||(prop==='LongShot'&&flags.InfinateRange)
          ||(prop==='BigBang'&&flags.BiggerBang)||(prop==='WideShot'&&flags.WiderShot))continue;
        const modern=netSession()?!!netSession()?.confirmedPlayerStats?.[i]?.previews:combatWorld(hud.mWorld);
        const names:Record<string,string>={DoubleAmmo:'+50% capacity',QuadAmmo:'+100% capacity',InfinateAmmo:'+125% capacity',RapidFire:'+30% rate (capped)'};
        details.push(modern?(names[prop]??label):label);
      }
      text(layer,`_Details${i}_${key}`,x,y+14,280,27,BODY_FONT,10,0xcccccc,false,'left',details.join(' / ')||'Standard',true);
    }
  }
  pause.cacheAsBitmap=false;
}

const PERK_LABELS:Record<string,string>={FastFire:'Auto fire',RapidFire:'Rapid fire',DoubleDamage:'2x damage',
  QuadDamage:'4x damage',FatalDamage:'10x damage',DoubleAmmo:'2x ammo',QuadAmmo:'4x ammo',InfinateAmmo:'Infinite ammo',
  LongShot:'Long range',InfinateRange:'Infinite range',WideShot:'Wide shot',WiderShot:'Wider shot',BigBang:'Big blast',
  BiggerBang:'Bigger blast',ClusterExplode:'Cluster blast',HomingMissiles:'Homing'};

export function installGrowthHud(): void {
  const proto=World.CHud.prototype as any,draw=proto.Draw,updatePlayer=proto.UpdatePlayer,pause=proto.Pause;
  proto.Draw=function(this:any,...args:any[]):any{
    const result=draw.apply(this,args),session=netSession();
    const state = session ? session.confirmedGrowth : growthOf(this.mWorld);
    if(growthOf(this.mWorld)&&state){
      if(World.CHud.mcScoreTotal)World.CHud.mcScoreTotal._visible=false;
      update(this,state,session?session.confirmedWave:this.mWorld.mUpgrades.mLevelIndex,
        session?session.confirmedEnemies:remainingEnemies(this.mWorld));
    }
    return result;
  };
  proto.UpdatePlayer=function(this:any,player:any,position:any,...args:any[]):any{
    const result=updatePlayer.call(this,player,position,...args);
    const weapon=player.mWeapon_Current;
    if(weapon&&weapon.mTotalAmmo===999999&&!infiniteGrowthWeapon(weapon))this.mcPlayers[player.mPlayerIndex].mcAmmo.tfAmount.text=weapon.mAmmo+':'+weapon.mTotalAmmo;
    if(growthOf(this.mWorld)){
      const clip=this.mcPlayers[player.mPlayerIndex];
      if(clip){
        // Keep the original ammo/weapon and life display clear of the new top strip. No extra head label.
        const top=clip.mcAmmo.getBounds(clip).yMin;
        const x=Math.max(48,Math.min(this.mWorld.mScreenSize.x-48,clip._x));
        const y=Math.max(growthLayout(this.mWorld.mScreenSize.x).bottom+3-top,clip._y);
        if(clip._x!==x)clip._x=x;
        if(clip._y!==y)clip._y=y;
      }
    }
    return result;
  };
  proto.Pause=function(this:any,on:any):any{
    const result=pause.call(this,on),session=netSession(),state=session?session.confirmedGrowth:growthOf(this.mWorld);
    if(on&&growthOf(this.mWorld)&&state)pauseGrowth(this,state);
    const view=views.get(this);if(view)view.clip._visible=!on;
    return result;
  };
}
