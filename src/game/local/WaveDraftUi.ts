import {CMain,World} from '../packages.ts';
import {BODY_FONT,INK,RED,GREY,GREEN,PILL_FILL,pillButton,setButtonLabel,text} from './UiStyle.ts';
import {netSession} from './Net/NetSession.ts';
import {waveDraft} from './WaveDraft.ts';
import {queueDraftChoice,queueDraftCommand} from './WaveDraftInput.ts';
import {installDraftStatsInput,statsOpen,toggleStats,statsKeyLabel,beginStatsBinding,statsBindingHint} from './DraftStatsInput.ts';
import {capturePlayerStats,type PlayerStats} from './PlayerStats.ts';
import {DRAFT_CONFIRM,encodeDraftSelection,REWARD_LABELS,REWARD_DETAILS,compactStat,type Reward,type WaveDraftState} from './WaveDraftRules.ts';
interface DraftView {clip:any;title:any;clock:any;players:any[];cards:any[][];wave:number;width:number;signature:string}
const views=new WeakMap<object,DraftView>();
function box(c:any,w:number,h:number,color:number,alpha=100):void{
 const r=Math.min(7,w/2,h/2);c.beginFill(color,alpha);c.moveTo(r,0);c.lineTo(w-r,0);c.curveTo(w,0,w,r);c.lineTo(w,h-r);
 c.curveTo(w,h,w-r,h);c.lineTo(r,h);c.curveTo(0,h,0,h-r);c.lineTo(0,r);c.curveTo(0,0,r,0);c.endFill();
}
function drawIcon(c:any,reward:Reward):void{
 c.clear();box(c,25,25,0xe6e0d8);c.lineStyle(1.5,RED,100);
 if(reward==='damage'){
  for(let i=0;i<=12;i++){const a=i*Math.PI/6,x=12.5+5*Math.cos(a),y=12.5+5*Math.sin(a);i?c.lineTo(x,y):c.moveTo(x,y);}
  for(const [x,y,dx,dy]of [[12.5,3,0,6],[12.5,16,0,6],[3,12.5,6,0],[16,12.5,6,0]]){c.moveTo(x,y);c.lineTo(x!+dx!,y!+dy!);}
 }else if(reward==='health'||reward==='heal'){
  c.beginFill(RED,90);c.moveTo(12.5,20);c.curveTo(1,12,6,7);c.curveTo(10,3,12.5,8);c.curveTo(16,3,20,7);c.curveTo(24,12,12.5,20);c.endFill();
 }else if(reward==='armor'){
  c.moveTo(12.5,4);c.lineTo(20,7);c.lineTo(18,16);c.lineTo(12.5,21);c.lineTo(7,16);c.lineTo(5,7);c.lineTo(12.5,4);c.moveTo(12.5,7);c.lineTo(12.5,17);
 }else if(reward==='haste'){
  for(let i=0;i<=12;i++){const a=i*Math.PI/6,x=12.5+8*Math.cos(a),y=12.5+8*Math.sin(a);i?c.lineTo(x,y):c.moveTo(x,y);}
  c.moveTo(12.5,7);c.lineTo(12.5,13);c.lineTo(17,15);
 }else if(reward==='mobility'){
  c.moveTo(6,5);c.lineTo(12,5);c.lineTo(13,13);c.lineTo(21,17);c.lineTo(20,21);c.lineTo(5,21);c.lineTo(6,5);
  c.moveTo(7,10);c.lineTo(11,10);c.moveTo(7,13);c.lineTo(11,13);
 }else if(reward==='penetration'){
  c.moveTo(7,4);c.lineTo(18,7);c.lineTo(17,18);c.lineTo(12,21);c.lineTo(7,18);c.lineTo(7,4);
  c.moveTo(3,12);c.lineTo(22,12);c.moveTo(17,8);c.lineTo(22,12);c.lineTo(17,16);
 }else if(reward==='scavenging'){
  c.moveTo(5,8);c.lineTo(20,8);c.lineTo(20,21);c.lineTo(5,21);c.lineTo(5,8);c.moveTo(9,8);c.lineTo(9,4);c.lineTo(16,4);c.lineTo(16,8);
  c.moveTo(12.5,11);c.lineTo(12.5,18);c.moveTo(9,14.5);c.lineTo(16,14.5);
 }else{
  for(let i=0;i<3;i++){const x=6+i*5;c.moveTo(x,19);c.lineTo(x,8);c.lineTo(x+2,5);c.lineTo(x+4,8);c.lineTo(x+4,19);c.lineTo(x,19);}
 }
}
function fit(field:any,value:string,size:number):void{field.text=value;const f=field.getTextFormat();f.size=size;field.setTextFormat(f);if(field.textWidth>field._width-4){f.size*=Math.max(.7,(field._width-4)/field.textWidth);field.setTextFormat(f);}}
const number=(n:number)=>compactStat(n);
const ammo=(n:number,infinite=false)=>infinite?'INF':number(n);
export function rewardPreview(stats:PlayerStats|undefined,reward:Reward,m:number):string{
 if(!stats)return 'Current stats will appear when confirmed';
 const b=stats.bonuses;
 if(reward==='damage')return `DAMAGE  ${number(stats.damage)}  >  ${number(stats.previews?.damage[m-1]??stats.damage/(1+.08*b.damage)*(1+.08*(b.damage+m)))}`;
 if(reward==='health')return `MAX HP  ${number(stats.maximum)}  >  ${number(stats.previews?.health?.[m-1]??stats.maximum/(1+.1*b.health)*(1+.1*(b.health+m)))}`;
 if(reward==='armor')return `MAX SHIELD  ${number(stats.armorMaximum)}  >  ${number(stats.previews?.armor?.[m-1]??stats.armorMaximum/(1+.1*b.armor)*(1+.1*(b.armor+m)))}`;
 if(reward==='haste')return `RATE  ${stats.rate.toFixed(1)}  >  ${(stats.previews?.haste?.[m-1]??stats.rate).toFixed(1)} per sec`;
 if(reward==='mobility')return `MOVEMENT  ${number(stats.speed/.16*100)}%  >  ${number(stats.previews?.mobility?.[m-1]??100)}%`;
 if(reward==='penetration')return `PIERCING  ${number(stats.penetration*100)}%  >  ${number(stats.previews?.penetration?.[m-1]??0)}%`;
 if(reward==='scavenging')return `SUPPLY EFFECT  +${number(stats.supply*100)}%  >  +${number(stats.previews?.scavenging?.[m-1]??0)}%`;
 if(reward==='capacity')return stats.infinite?'CAPACITY  /  FINITE WEAPONS':`CAPACITY  ${ammo(stats.capacity)}  >  ${ammo(stats.previews?.capacity[m-1]??stats.capacity+Math.floor(stats.capacityBase*.15*(b.capacity+m))-Math.floor(stats.capacityBase*.15*b.capacity))}`;
 if(reward==='heal')return `HP  ${number(stats.life)}  >  ${number(Math.min(stats.maximum,stats.life+stats.maximum*.35*m*(1+stats.supply)))}`;
 return stats.infinite?'RESTORE AMMO TO FINITE WEAPONS':`AMMO  ${ammo(stats.ammo)}  >  ${ammo(Math.min(stats.capacity,stats.ammo+Math.ceil(stats.capacity*.35*m*(1+stats.supply))))}`;
}
function create(world:any,state:WaveDraftState):DraftView{
 views.get(world)?.clip.removeMovieClip();
 const count=state.round!.offers.length,width=count===1?520:610,column=(width-36-(count-1)*14)/count;
 const clip=world.createEmptyMovieClip('_WaveDraftHud',world.getNextHighestDepth());
 const shadow=clip.createEmptyMovieClip('_Shadow',clip.getNextHighestDepth());shadow._x=2;shadow._y=3;box(shadow,width,386,0x333333,30);
 const background=clip.createEmptyMovieClip('_Background',clip.getNextHighestDepth());box(background,width,386,0xe9e9e5,99);
 background.lineStyle(1,0xc9c9c3,100);background.moveTo(16,62);background.lineTo(width-16,62);
 const title=text(clip,'_Title',12,10,width-24,25,BODY_FONT,21,RED,true,'center','');
 const clock=text(clip,'_Clock',12,37,width-24,18,BODY_FONT,12,INK,false,'center','');
 const players:any[]=[],cards:any[][]=[];
 for(let index=0;index<count;index++){
  const side=clip.createEmptyMovieClip('_Player'+index,clip.getNextHighestDepth());side._x=18+index*(column+14);side._y=72;
  text(side,'_Status',0,0,column,20,BODY_FONT,14,INK,true,'left','');
  text(side,'_Bonuses',0,24,column-98,18,BODY_FONT,10,GREY,false,'left','');
  const tab=pillButton(side,'_StatsButton',column-45,30,90,23,'STATS',11);tab.onRelease=()=>toggleStats(world,index);
  cards[index]=[];
  for(let choice=0;choice<3;choice++){
   const card=side.createEmptyMovieClip('_Card'+choice,side.getNextHighestDepth());card._y=52+choice*70;
   const icon=card.createEmptyMovieClip('_Icon',card.getNextHighestDepth());icon._x=10;icon._y=10;
   text(card,'_Label',44,6,column-54,20,BODY_FONT,14,INK,true,'left','');
   text(card,'_Detail',44,26,column-54,16,BODY_FONT,11,GREY,false,'left','');
   text(card,'_Preview',12,45,column-24,15,BODY_FONT,10,RED,true,'left','');cards[index]!.push(card);
  }
  const sheet=side.createEmptyMovieClip('_Stats',side.getNextHighestDepth());sheet._y=52;box(sheet,column,204,PILL_FILL);
  for(let row=0;row<9;row++){
   text(sheet,'_Name'+row,10,8+row*18,84,17,BODY_FONT,10,GREY,false,'left','');
   text(sheet,'_Value'+row,94,8+row*18,column-106,17,BODY_FONT,11,INK,true,'right','');
  }
  const binding=pillButton(sheet,'_Bind',column/2,184,column-20,23,'',10);binding.onRelease=()=>beginStatsBinding(world,index);
  text(side,'_Hint',0,258,column,15,BODY_FONT,9,GREY,false,'center','');
  const ready=pillButton(side,'_Ready',column/2,282,column,27,'READY',13,{selected:true});
  ready.onRelease=()=>{const r=(netSession()?.confirmedWaveDraft??waveDraft(world))?.round;if(!r||r.confirmed[index])return;
   r.readyRule?queueDraftCommand(world,index,DRAFT_CONFIRM,r.wave):queueDraftChoice(world,index,r.selected[index]!,r.wave);};
  players.push(side);
 }
 text(clip,'_Controls',12,365,width-24,17,BODY_FONT,11,INK,false,'center','');
 const view={clip,title,clock,players,cards,wave:state.round!.wave,width,signature:''};views.set(world,view);return view;
}
function statsRows(s:PlayerStats|undefined):[string,string][]{
 if(!s)return [['SYNCING','WAIT FOR CONFIRMATION']];
 return [['LEVEL / XP',`${s.level}  /  ${number(s.xp)} / ${number(s.required)}`],['HEALTH',`${number(s.life)} / ${number(s.maximum)}`],
  ['SHIELD',`${number(s.armor)} / ${number(s.armorMaximum)}`],['MOVEMENT',`${Math.round(s.speed/.16*100)}%`],['WEAPON',s.weapon],
  ['DMG / RATE',`${number(s.damage)} / ${s.rate.toFixed(1)} per sec`],['AMMUNITION',`${ammo(s.ammo,s.infinite)} / ${ammo(s.capacity,s.infinite)}`],
  [s.simplified?'SUPPLY EFFECT':'PIERCE / SUPPLY',s.simplified?`+${Math.round(s.supply*100)}%`:`${Math.round(s.penetration*100)}% / +${Math.round(s.supply*100)}%`],['ENCHANTMENT',s.enchanted?`ACTIVE  +${s.simplified?15:35}% DAMAGE`:'NONE']];
}
function update(world:any,state:WaveDraftState):void{
 const round=state.round!,session=netSession();let view=views.get(world);
 if(!view||view.wave!==round.wave||view.players.length!==round.offers.length)view=create(world,state);
 view.clip._x=(world.mScreenSize.x-view.width)/2;view.clip._y=Math.max(74,(world.mScreenSize.y-386)/2);view.clip._visible=!world.mHud.mcScreenPause;
 view.title.text=round.multiplier===2?'BOSS DEFEATED / DOUBLE REWARD':'WAVE '+round.wave+' COMPLETE';
 view.clock.text=round.readyRule?'TAKE YOUR TIME / CONTINUE WHEN EVERYONE IS READY':`CHOOSE ONE / ${Math.ceil(round.remainingTicks/CMain.mFPS)}s / DEFAULT: FIREPOWER`;
 const stats=session?session.confirmedPlayerStats:capturePlayerStats(world),open=round.offers.map((_,i)=>statsOpen(world,i));
 view.clip._Controls.text=`MOVE: SELECT   A: READY   X / ${session?statsKeyLabel(session.role):round.offers.map((_,i)=>statsKeyLabel(i)).join(' / ')}: ${open.some(Boolean)?'BACK TO UPGRADES':'VIEW STATS'}`;
 const signature=JSON.stringify([round.selected,round.confirmed,round.offers,state.bonuses,round.multiplier,session?.role,stats,open,statsBindingHint(world)]);
 if(signature===view.signature)return;view.signature=signature;
 for(let i=0;i<round.offers.length;i++){
  const side=view.players[i],local=!session||session.role===i,ready=round.confirmed[i],s=stats?.find(p=>p.index===i),b=state.bonuses[i]!;
  fit(side._Status,`P${i+1}  /  ${ready?'READY':local?'CHOOSE YOUR UPGRADE':'PARTNER IS CHOOSING'}`,14);side._Status.textColor=ready?GREEN:INK;
  fit(side._Bonuses,`DMG +${number(b.damage*8)}%  HP +${number(b.health*(s?.simplified?8:10))}%`,10);
  setButtonLabel(side._StatsButton,open[i]?'BACK / X':`X / ${statsKeyLabel(i)}`);side._StatsButton.enabled=local;side._StatsButton._alpha=local?100:55;
  for(let choice=0;choice<3;choice++){
   const card=view.cards[i]![choice],reward=round.offers[i]![choice]!,selected=round.selected[i]===choice;
   card._visible=!open[i];card.clear();card.lineStyle(selected?2:1,selected?RED:0xcdcdc7,100);
   box(card,(view.width-36-(round.offers.length-1)*14)/round.offers.length,64,selected?0xfff5ef:PILL_FILL);
   drawIcon(card._Icon,reward);fit(card._Label,REWARD_LABELS[reward],14);
   const detail=s?.simplified&&reward==='health'?'Max health +8%':s?.simplified&&reward==='armor'?'Max shield +6%':reward==='capacity'&&s?.previews?'Ammo capacity +8% (diminishing)':REWARD_DETAILS[reward];
   fit(card._Detail,detail.replace(/\d+%/,n=>`${parseInt(n)*round.multiplier}%`),11);
   fit(card._Preview,rewardPreview(s,reward,round.multiplier),10);card._alpha=local||ready?100:70;
   card.onRelease=local&&!ready?()=>round.readyRule?queueDraftCommand(world,i,encodeDraftSelection(choice),round.wave):queueDraftChoice(world,i,choice,round.wave):undefined;
   card.useHandCursor=!!card.onRelease;
  }
  side._Stats._visible=open[i];const rows=statsRows(s);
  for(let row=0;row<9;row++){fit(side._Stats['_Name'+row],rows[row]?.[0]??'',10);fit(side._Stats['_Value'+row],rows[row]?.[1]??'',11);}
  setButtonLabel(side._Stats._Bind,`CHANGE KEY: ${statsKeyLabel(i)} / PAD: X`);
  side._Hint.text=open[i]?(statsBindingHint(world)||'SOURCES: LEVEL UPGRADES + WAVE CHOICES'):ready?'YOUR CHOICE IS LOCKED / WAITING FOR PARTNER':'';
  setButtonLabel(side._Ready,ready?'READY / WAITING':`READY / ${REWARD_LABELS[round.offers[i]![round.selected[i]!]!]}`);
  side._Ready.enabled=local&&!ready&&!open[i];side._Ready._alpha=ready?65:local&&!open[i]?100:45;
 }
}
export function installWaveDraftUi():void{
 installDraftStatsInput();
 const hud=World.CHud.prototype as any,draw=hud.Draw;
 hud.Draw=function(this:any,...args:any[]):any{
  const result=draw.apply(this,args),session=netSession(),world=this.mWorld,state=session?session.confirmedWaveDraft:waveDraft(world);
  if(state?.round)update(world,state);else if(views.has(world))views.get(world)!.clip._visible=false;return result;
 };
}
