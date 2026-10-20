import {CMain,World} from '../packages.ts';
import {BODY_FONT,text} from './UiStyle.ts';
import {netSession} from './Net/NetSession.ts';
import {waveDraft} from './WaveDraft.ts';
import {queueDraftChoice} from './WaveDraftInput.ts';
import {REWARD_LABELS,REWARD_DETAILS,compactStat,type WaveDraftState} from './WaveDraftRules.ts';
interface DraftView {clip:any;title:any;clock:any;players:any[];cards:any[][];wave:number;signature:string;width:number}
const views=new WeakMap<object,DraftView>();
function rect(clip:any,width:number,height:number,color:number,alpha=100):void {
  clip.beginFill(color,alpha);clip.moveTo(0,0);clip.lineTo(width,0);clip.lineTo(width,height);clip.lineTo(0,height);clip.lineTo(0,0);clip.endFill();
}
function create(world:any,state:WaveDraftState):DraftView {
  views.get(world)?.clip.removeMovieClip();
  const count=state.round!.offers.length,width=count===1?520:610,column=(width-36-(count-1)*14)/count;
  const clip=world.createEmptyMovieClip('_WaveDraftHud',world.getNextHighestDepth());rect(clip,width,360,0x202420,96);
  const title=text(clip,'_Title',12,10,width-24,24,BODY_FONT,20,0xffffff,true,'center','WAVE COMPLETE');
  const clock=text(clip,'_Clock',12,36,width-24,20,BODY_FONT,13,0xffd28d,true,'center','');
  const players:any[]=[],cards:any[][]=[];
  for(let index=0;index<count;index++){
    const x=18+index*(column+14),side=clip.createEmptyMovieClip('_Player'+index,clip.getNextHighestDepth());side._x=x;side._y=64;
    text(side,'_Status',0,0,column,20,BODY_FONT,14,0xffffff,true,'left','');
    text(side,'_Bonuses',0,22,column,16,BODY_FONT,10,0xbac4b9,false,'left','');players.push(side);
    cards[index]=[];
    for(let choice=0;choice<3;choice++){
      const card=side.createEmptyMovieClip('_Card'+choice,side.getNextHighestDepth());card._y=46+choice*68;
      text(card,'_Label',12,8,column-24,20,BODY_FONT,14,0xffffff,true,'left','');
      text(card,'_Detail',12,32,column-24,18,BODY_FONT,12,0xd9ddd6,false,'left','');
      cards[index]!.push(card);
    }
  }
  text(clip,'_Controls',12,324,width-24,24,BODY_FONT,11,0xc7cec5,false,'center','MOVE / WEAPON KEYS: CHOOSE   |   FIRE: CONFIRM   |   CLICK A CARD');
  const view={clip,title,clock,players,cards,wave:state.round!.wave,signature:'',width};views.set(world,view);return view;
}
function update(world:any,state:WaveDraftState):void {
  const round=state.round!,session=netSession();let view=views.get(world);
  if(!view||view.wave!==round.wave||view.players.length!==round.offers.length)view=create(world,state);
  view.clip._x=(world.mScreenSize.x-view.width)/2;view.clip._y=Math.max(82,(world.mScreenSize.y-360)/2);
  view.clip._visible=!world.mHud.mcScreenPause;
  view.title.text=round.multiplier===2?'BOSS DEFEATED — DOUBLE REWARD':'WAVE '+round.wave+' COMPLETE';
  const message=round.readyRule?'CHOOSE ONE  /  CONTINUE WHEN EVERYONE IS READY':`CHOOSE ONE  /  ${Math.ceil(round.remainingTicks/CMain.mFPS)}s  /  DEFAULT: FIREPOWER`;
  if(view.clock.text!==message)view.clock.text=message;
  const signature=JSON.stringify([round.selected,round.confirmed,round.offers,state.bonuses,round.multiplier,session?.role]);
  if(signature===view.signature)return;view.signature=signature;
  for(let index=0;index<round.offers.length;index++){
    const side=view.players[index],bonus=state.bonuses[index]!,local=!session||session.role===index;
    side._Status.text=`P${index+1}  ${round.confirmed[index]?'READY':local?'CHOOSE YOUR UPGRADE':'WAITING FOR PARTNER'}`;
    side._Status.textColor=round.confirmed[index]?0xa8d59b:0xffffff;
    side._Bonuses.text=`DMG +${compactStat(bonus.damage*8)}%  HP +${compactStat(bonus.health*10)}%  SHIELD +${compactStat(bonus.armor*10)}%  AMMO +${compactStat(bonus.capacity*15)}%`;
    const format=side._Bonuses.getTextFormat(),available=(view.width-36-(round.offers.length-1)*14)/round.offers.length;
    format.size=10;side._Bonuses.setTextFormat(format);
    if(side._Bonuses.textWidth>available-4){format.size*= (available-4)/side._Bonuses.textWidth;side._Bonuses.setTextFormat(format);}
    for(let choice=0;choice<3;choice++){
      const card=view.cards[index]![choice],reward=round.offers[index]![choice]!,selected=round.selected[index]===choice;
      card.clear();card.lineStyle(selected?2:1,selected?0xf4ce8c:0x737e72,100);
      rect(card,(view.width-36-(round.offers.length-1)*14)/round.offers.length,60,selected?0x525b42:0x343d35);
      card._Label.text=REWARD_LABELS[reward]+(!round.readyRule&&choice===0?'  ·  DEFAULT':'');
      card._Detail.text=REWARD_DETAILS[reward].replace(/\d+%/,n=>`${parseInt(n)*round.multiplier}%`);
      card._alpha=local||round.confirmed[index]?100:72;
      card.onRelease=local&&!round.confirmed[index]?()=>queueDraftChoice(world,index,choice,round.wave):undefined;
      card.useHandCursor=!!card.onRelease;
    }
  }
}
export function installWaveDraftUi():void {
  const hud=World.CHud.prototype as any,draw=hud.Draw;
  hud.Draw=function(this:any,...args:any[]):any{
    const result=draw.apply(this,args),session=netSession(),world=this.mWorld;
    const state=session?session.confirmedWaveDraft:waveDraft(world);
    if(state?.round)update(world,state);else if(views.has(world))views.get(world)!.clip._visible=false;
    return result;
  };
}
