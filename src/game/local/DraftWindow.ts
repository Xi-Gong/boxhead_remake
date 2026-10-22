import {CMain} from '../packages.ts';
import {nowMs} from '../../engine/flash/clock.ts';
import {BODY_FONT,MENU_FONT,INK,RED,GREEN,setButtonLabel,text} from './UiStyle.ts';
import {frame,actionButton,drawIcon,portrait,rewardColor,PAPER,CREAM,MUTED,BLUE,PURPLE} from './DraftUiArt.ts';
import {netSession} from './Net/NetSession.ts';
import {waveDraft} from './WaveDraft.ts';
import {queueDraftChoice,queueDraftCommand} from './WaveDraftInput.ts';
import {statsOpen,toggleStats,statsKeyLabel,beginStatsBinding,statsBindingHint} from './DraftStatsInput.ts';
import {capturePlayerStats,type PlayerStats} from './PlayerStats.ts';
import {PERCENT_STATS,percentText,type PercentStat} from './PercentStats.ts';
import {DRAFT_CONFIRM,encodeDraftSelection,REWARD_LABELS,compactStat,type Reward,type WaveDraftState} from './WaveDraftRules.ts';
type Preview=(stats:PlayerStats|undefined,reward:Reward,multiplier:number)=>string;
interface View {clip:any;backdrop:any;players:any[];cards:any[][];wave:number;indices:number[];key:string;signature:string;size:string}
const views=new WeakMap<object,View>();
const WIDTH=610,HEIGHT=400;
function label(field:any,value:string,size=12):void{
 field.text=value;const f=field.getTextFormat();f.size=size;field.setTextFormat(f);
 // Keep body text readable; wrap explanations and compact values instead of shrinking it away.
 if(!field.multiline&&field.textWidth>field._width-4){f.size=Math.max(12,size*(field._width-4)/field.textWidth);field.setTextFormat(f);}
}
function create(world:any,state:WaveDraftState,indices:number[]):View{
 const old=views.get(world);old?.clip.removeMovieClip();old?.backdrop.removeMovieClip();
 const backdrop=world.createEmptyMovieClip('_DraftBackdrop',world.getNextHighestDepth());
 backdrop.onRelease=()=>{};
 const clip=world.createEmptyMovieClip('_WaveDraftHud',world.getNextHighestDepth());
 const shadow=clip.createEmptyMovieClip('_Shadow',clip.getNextHighestDepth());shadow._x=4;shadow._y=5;frame(shadow,WIDTH,HEIGHT,0x282923,0x282923,1,45);
 const paper=clip.createEmptyMovieClip('_Background',clip.getNextHighestDepth());frame(paper,WIDTH,HEIGHT,PAPER,INK,2.5);
 paper.lineStyle(2,INK,100);paper.moveTo(15,60);paper.lineTo(WIDTH-15,60);
 text(clip,'_Title',14,8,WIDTH-28,29,MENU_FONT,23,RED,false,'center','');
 text(clip,'_Clock',14,38,WIDTH-28,18,BODY_FONT,12,MUTED,true,'center','');
 const players:any[]=[],cards:any[][]=[],dual=indices.length===2,column=dual?280:574,modern=!!(netSession()?.confirmedPlayerStats??capturePlayerStats(world))?.some(s=>s.percentages);
 for(const [position,index]of indices.entries()){
  const side=clip.createEmptyMovieClip('_Player'+index,clip.getNextHighestDepth());side._x=18+position*(column+14);side._y=70;
  const actor=(Object.values(world.mThing_Collection.mPlayerThings)as any[]).find(p=>p.mPlayerIndex===index);portrait(side,actor);
  text(side,'_Status',49,0,column-184,21,MENU_FONT,dual?14:17,INK,false,'left','');
  text(side,'_Bonuses',49,23,column-184,17,BODY_FONT,12,MUTED,false,'left','');
  const tab=actionButton(side,'_StatsButton',column-64,20,128,29,'',12);tab.onRelease=()=>toggleStats(world,index);
  cards[index]=[];
  for(let choice=0;choice<3;choice++){
   const width=dual?column:(column-20)/3,height=dual?66:210;
   const card=side.createEmptyMovieClip('_Card'+choice,side.getNextHighestDepth());card._x=dual?0:choice*(width+10);card._y=48+(dual?choice*72:0);card._baseY=card._y;card._cardWidth=width;card._cardHeight=height;
   const shade=card.createEmptyMovieClip('_Shadow',card.getNextHighestDepth());shade._x=3;shade._y=3;frame(shade,width,height,0x7b796d,0x7b796d,1);
   card.createEmptyMovieClip('_Face',card.getNextHighestDepth());
   const icon=card.createEmptyMovieClip('_Icon',card.getNextHighestDepth());icon._x=dual?10:14;icon._y=dual?13:14;icon._xscale=icon._yscale=dual?115:155;
   text(card,'_Label',dual?51:12,dual?5:64,dual?column-83:width-24,dual?20:34,MENU_FONT,dual?14:15,INK,false,'left','',!dual);
   text(card,'_Benefit',dual?51:12,dual?25:100,dual?80:width-24,dual?23:30,MENU_FONT,dual?19:25,GREEN,false,'left','');
   text(card,'_Detail',dual?139:12,dual?28:137,dual?column-151:width-24,dual?17:32,BODY_FONT,12,MUTED,true,'left','',!dual);
   text(card,'_Preview',12,dual?48:177,width-24,dual?16:29,BODY_FONT,12,INK,true,'left','',!dual);
   card.createEmptyMovieClip('_SelectedMark',card.getNextHighestDepth());cards[index]!.push(card);
  }
  const sheet=side.createEmptyMovieClip('_Stats',side.getNextHighestDepth());sheet._y=48;frame(sheet,column,modern?232:210,CREAM,INK,1.5);
  const ys=[9,31,49,67,100,118,136,168,187];
  for(let row=0;row<(modern?12:9);row++){
   const half=modern?6:4,right=!dual&&row>=half,left=!dual&&!right,cellWidth=dual?column:277,x=right?column-277:0,y=modern?(dual?7+row*18:9+(left?row:row-half)*33):dual?(ys[row]??220):11+(left?row:row-4)*36;
   const nameWidth=dual?105:120;
   text(sheet,'_Name'+row,x+10,y, nameWidth,17,BODY_FONT,12,MUTED,true,'left','');
   text(sheet,'_Value'+row,x+nameWidth+10,y,cellWidth-nameWidth-20,19,BODY_FONT,dual?12:15,INK,true,'right','');
  }
  if(!dual){text(sheet,'_Sources',12,modern?210:164,265,modern?18:38,BODY_FONT,12,MUTED,false,'left','',true);sheet.lineStyle(1,0xc6c1b3,100);sheet.moveTo(287,10);sheet.lineTo(287,200);}
  else if(!modern){sheet.lineStyle(1,0xd3cdbf,100);for(const y of [92,161]){sheet.moveTo(10,y);sheet.lineTo(column-10,y);}}
  const bind=actionButton(sheet,'_Bind',column/2,248,column,30,'',12);bind.onRelease=()=>beginStatsBinding(world,index);
  text(side,'_Hint',0,262,column,17,BODY_FONT,12,MUTED,false,'center','');
  const ready=actionButton(side,'_Ready',column/2,296,column,30,'READY',13);
  ready.onRelease=()=>{const r=(netSession()?.confirmedWaveDraft??waveDraft(world))?.round;if(!r||r.confirmed[index])return;
   r.readyRule?queueDraftCommand(world,index,DRAFT_CONFIRM,r.wave):queueDraftChoice(world,index,r.selected[index]!,r.wave);};
  players[index]=side;
 }
 text(clip,'_Controls',12,382,WIDTH-24,17,BODY_FONT,12,INK,true,'center','');
 const view={clip,backdrop,players,cards,wave:state.round!.wave,indices,key:indices.join(','),signature:'',size:''};views.set(world,view);return view;
}
function rows(s:PlayerStats|undefined):[string,string][]{
 if(!s)return [['SYNCING','PLEASE WAIT']];
 const number=compactStat,ammo=(n:number)=>s.infinite?'INF':number(n),keys=(['A','Y']as const).filter(k=>s.bindings?.[k]===s.weaponId).join('/');
 if(s.percentages){const p=s.percentages,bonus=(key:PercentStat)=>'+'+percentText(p[key]),limit=(key:PercentStat)=>bonus(key)+' / '+PERCENT_STATS[key].cap+'%';
  return [['LEVEL / XP',`${number(s.level)} / ${number(s.xp)} / ${number(s.required)}`],
   ['HEALTH',`${number(s.life)}/${number(s.maximum)} (${bonus('health')})`],['SHIELD',`${number(s.armor)}/${number(s.armorMaximum)} (${bonus('armor')})`],
   ['DAMAGE',`${bonus('damage')} / ${number(s.damage)}`],['FIRE RATE',`${bonus('haste')} / ${s.rate.toFixed(1)}/s`],
   ['MOVEMENT',limit('mobility')],['AMMUNITION',`${ammo(s.ammo)}/${ammo(s.capacity)} (${bonus('capacity')})`],
   ['SUPPLY',limit('scavenging')],['DODGE',limit('dodge')],['ENCHANT DMG',limit('enchantPower')],
   ['ENCHANT SHOTS',`${number(s.enchantDurability??0)}/${number(s.enchantMaximum??0)} (${bonus('endurance')})`],['WEAPON',s.weapon+(keys?` [${keys}]`:'')]];
 }
 return [['LEVEL / XP',`${number(s.level)} / ${number(s.xp)} / ${number(s.required)}`],['HEALTH',`${number(s.life)} / ${number(s.maximum)}`],
  ['SHIELD',`${number(s.armor)} / ${number(s.armorMaximum)}`],['MOVEMENT',`${Math.round(s.speed/.16*100)}%`],['WEAPON',s.weapon+(keys?` [${keys}]`:'')],
  ['DMG / RATE',`${number(s.damage)} / ${s.rate.toFixed(1)}/s`],['AMMUNITION',`${ammo(s.ammo)} / ${ammo(s.capacity)}`],
  [s.simplified?'HEAL / AMMO':'PIERCE / SUPPLY',s.simplified?`+${Math.round(s.supply*100)}%`:`${Math.round(s.penetration*100)} / +${Math.round(s.supply*100)}%`],
  [s.enchantMaximum!==undefined?`ENCHANT +${s.enchantDamage?((s.enchantDamage-1)*100).toFixed(1):15}%`:'ENCHANTMENT',s.enchantMaximum!==undefined?`${number(s.enchantDurability??0)} / ${number(s.enchantMaximum)}`:s.enchanted?`ACTIVE +${s.simplified?15:35}%`:'NONE']];
}
function benefit(reward:Reward,s:PlayerStats|undefined,m:number):[string,string]{
 if(reward==='enchantPower'&&!s?.percentages){const next=s?.previews?.enchantPower?.[m-1]??s?.enchantDamage??1.15;return [`+${((next-1)*100).toFixed(1)}%`,'total enchanted bonus'];}
 if(s?.percentages&&reward in PERCENT_STATS){const k=reward as PercentStat,before=s.percentages[k],after=s.percentagePreviews?.[k]?.[m-1]??before;return ['+'+percentText(Math.max(0,after-before)),k==='armor'?'max 40% of HP':`max ${PERCENT_STATS[k].cap}%`];}
 const percent:Record<Reward,number>={damage:8,health:s?.simplified?8:10,armor:s?.simplified?6:10,capacity:s?.previews?8:15,heal:35,ammo:35,haste:6,mobility:4,penetration:12,scavenging:10,endurance:10,enchantPower:0,dodge:3};
 const description:Record<Reward,string>={damage:'weapon damage',health:'max health',armor:'max shield',capacity:'ammo capacity',heal:'restore health',ammo:'restore ammo',haste:'fire-rate growth',mobility:'movement growth',penetration:'armor piercing',scavenging:'healing & ammo',endurance:'enchant endurance',enchantPower:'enchanted damage',dodge:'dodge chance'};
 return [`+${percent[reward]*m}%`,description[reward]];
}
function animate(view:View):void{
 const now=nowMs();for(const index of view.indices)for(const card of view.cards[index]!){
  const p=Math.min(1,Math.max(0,(now-(card._changedAt??now))/130)),from=card._fromY??card._baseY,to=card._baseY-(card._selected?2:0);
  card._y=from+(to-from)*(1-(1-p)**3);
 }
}
export function renderDraftWindow(world:any,state:WaveDraftState,preview:Preview):void{
 const round=state.round!,session=netSession(),indices=session?[session.role]:round.offers.map((_,i)=>i);let view=views.get(world);
 if(!view||view.wave!==round.wave||view.key!==indices.join(','))view=create(world,state,indices);
 view.clip._x=(world.mScreenSize.x-WIDTH)/2;view.clip._y=Math.max(64,(world.mScreenSize.y-HEIGHT)/2);
 view.backdrop._visible=view.clip._visible=!world.mHud.mcScreenPause;
 const size=`${world.mScreenSize.x},${world.mScreenSize.y}`;
 if(size!==view.size){view.backdrop.clear();view.backdrop.beginFill(0x23231f,28);view.backdrop.moveTo(0,0);view.backdrop.lineTo(world.mScreenSize.x,0);view.backdrop.lineTo(world.mScreenSize.x,world.mScreenSize.y);view.backdrop.lineTo(0,world.mScreenSize.y);view.backdrop.lineTo(0,0);view.backdrop.endFill();view.size=size;}
 view.clip._Title.text=round.outcome==='clear'?'EARLY CLEAR!  DOUBLE REWARD':round.outcome==='survived'?'WAVE '+round.wave+' SURVIVED':round.multiplier===2?'BOSS DOWN!  DOUBLE REWARD':'WAVE '+round.wave+' CLEARED!';
 const partner=session?(round.confirmed[1-session.role]?'PARTNER READY':'PARTNER IS CHOOSING'):'';
 const stats=session?session.confirmedPlayerStats:capturePlayerStats(world),open=indices.map(i=>statsOpen(world,i));
 label(view.clip._Controls,`MOVE: SELECT   A: READY   X / ${indices.map(statsKeyLabel).join(' / ')}: ${open.some(Boolean)?'BACK TO UPGRADES':'VIEW STATS'}`,12);
 // Keep the full-width prompt above the cards; the persistent DOM pad selectors occupy the bottom row.
 view.clip._Controls._visible=false;
 view.clip._Clock.text=[round.readyRule?partner:`${Math.ceil(round.remainingTicks/CMain.mFPS)}s / DEFAULT: FIREPOWER`,view.clip._Controls.text].filter(Boolean).join(' / ');
 const signature=JSON.stringify([round.selected,round.confirmed,round.offers,round.multiplier,stats,open,statsBindingHint(world),indices.map(statsKeyLabel)]);
 if(signature===view.signature){animate(view);return;}view.signature=signature;
 for(const index of indices){
  const side=view.players[index],s=stats?.find(p=>p.index===index),ready=round.confirmed[index],opened=statsOpen(world,index),b=state.bonuses[index]!;
  label(side._Status,`P${index+1} / ${opened?'STATS':ready?'READY!':'UPGRADE'}`,indices.length===2?14:17);side._Status.textColor=ready?GREEN:INK;
  label(side._Bonuses,`LEVEL ${compactStat(s?.level??1)} / ${compactStat(s?.xp??0)} XP`,12);
  setButtonLabel(side._StatsButton,opened?'X / BACK':`X / ${statsKeyLabel(index)} STATS`);
  for(let choice=0;choice<3;choice++){
   const card=view.cards[index]![choice],reward=round.offers[index]![choice]!,selected=round.selected[index]===choice,[amount,description]=benefit(reward,s,round.multiplier);
   if(card._selected!==selected){card._fromY=card._y;card._changedAt=nowMs();card._selected=selected;}
   card._visible=!opened;card._Face.clear();frame(card._Face,card._cardWidth,card._cardHeight,selected?0xfff0d9:CREAM,selected?RED:INK,selected?3:1.8);
   drawIcon(card._Icon,reward);label(card._Label,REWARD_LABELS[reward],indices.length===2?14:15);label(card._Benefit,amount,indices.length===2?19:25);card._Benefit.textColor=rewardColor(reward);label(card._Detail,description,12);
   label(card._Preview,preview(s,reward,round.multiplier),12);
   const mark=card._SelectedMark;mark.clear();mark._visible=selected;if(selected){mark.lineStyle(2.5,RED,100);mark.moveTo(card._cardWidth-25,12);mark.lineTo(card._cardWidth-20,17);mark.lineTo(card._cardWidth-11,7);}
   card._alpha=ready?80:100;card.onRelease=!ready?()=>round.readyRule?queueDraftCommand(world,index,encodeDraftSelection(choice),round.wave):queueDraftChoice(world,index,choice,round.wave):undefined;card.useHandCursor=!!card.onRelease;
  }
  side._Stats._visible=opened;const values=rows(s);
  for(let row=0;row<values.length;row++){label(side._Stats['_Name'+row],values[row]?.[0]??'',12);label(side._Stats['_Value'+row],values[row]?.[1]??'',indices.length===2?12:15);side._Stats['_Value'+row].textColor=row===1?RED:row===2?BLUE:row===8?PURPLE:INK;}
  const shortcuts=`A: ${s?.bindings?.A?.toUpperCase()??'--'} / Y: ${s?.bindings?.Y?.toUpperCase()??'--'}`;
  if(side._Stats._Sources)side._Stats._Sources.text=s?.percentages?'ADDITIVE % / LEVEL + CHOICES':`${shortcuts}\nBUILD: DMG ${b.damage} / HP ${b.health} / SHIELD ${b.armor}`;
  setButtonLabel(side._Stats._Bind,`CHANGE KEY: ${statsKeyLabel(index)} / PAD: X`);
  side._Hint.text=opened?(statsBindingHint(world)||(s?.percentages?shortcuts:'' )||(indices.length===2?`${shortcuts} / END ${b.endurance??0}${s?.enchantDamage?` / PWR ${b.enchantPower??0}`:''}`:`SOURCES: LEVEL + CHOICES / ENDURANCE ${b.endurance??0}${s?.enchantDamage?` / POWER ${b.enchantPower??0}`:''}`)):ready?'CHOICE LOCKED / WAITING FOR PARTNER':round.multiplier===2?(round.outcome?'DOUBLE GAINS / STAT CAPS APPLY':'EVERY BENEFIT IS DOUBLED'):'SELECT A CARD, THEN READY';
  side._Hint.textColor=ready&&!opened?GREEN:MUTED;
  side._Ready._visible=!opened;setButtonLabel(side._Ready,ready?'READY! / WAITING':`READY / ${REWARD_LABELS[round.offers[index]![round.selected[index]!]!]}`);side._Ready.enabled=!ready;side._Ready._alpha=ready?70:100;
 }
 animate(view);
}
export function hideDraftWindow(world:any):void{const view=views.get(world);if(view){view.clip._visible=false;view.backdrop._visible=false;}}
