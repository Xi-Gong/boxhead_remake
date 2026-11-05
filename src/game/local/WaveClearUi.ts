// The settlement is a distinct surface: its action cannot target a card underneath it.
import {CMain,CInput} from '../packages.ts';
import {BODY_FONT,MENU_FONT,INK,RED,GREEN,text,setButtonLabel} from './UiStyle.ts';
import {frame,actionButton,PAPER,MUTED} from './DraftUiArt.ts';
import {netSession} from './Net/NetSession.ts';
import {queueDraftCommand} from './WaveDraftInput.ts';
import {DRAFT_CONTINUE,type WaveDraftState} from './WaveDraftRules.ts';
const views=new WeakMap<object,{clip:any;backdrop:any;key:string}>();
const WIDTH=610,HEIGHT=290;
export function confirmKeyLabel(index:number):string{
 const input=CMain.mInput,key=input?.['KEY_FIRE'+(netSession()?'':index?'2':'')]?.mKeycode;
 if(key===32)return 'SPACE';
 return String(CInput.mValidKeys?.[key]?.mName??'FIRE').replace(/^'(.)'$/,'$1');
}
export function hideWaveClear(world:any):void{const v=views.get(world);if(v){v.clip._visible=false;v.backdrop._visible=false;}}
export function renderWaveClear(world:any,state:WaveDraftState):void{
 const round=state.round!,intro=round.intro!,session=netSession(),indices=session?[session.role]:round.offers.map((_,i)=>i),key=indices.join(',');
 let view=views.get(world);
 if(!view||view.key!==key){
  view?.clip.removeMovieClip();view?.backdrop.removeMovieClip();
  const backdrop=world.createEmptyMovieClip('_WaveClearBackdrop',world.getNextHighestDepth());backdrop.onRelease=()=>{};
  const clip=world.createEmptyMovieClip('_WaveClearHud',world.getNextHighestDepth());
  const paper=clip.createEmptyMovieClip('_Paper',clip.getNextHighestDepth());frame(paper,WIDTH,HEIGHT,PAPER,INK,2.5);
  text(clip,'_Title',14,20,WIDTH-28,35,MENU_FONT,23,RED,false,'center','');
  text(clip,'_Timer',14,68,WIDTH-28,40,MENU_FONT,30,INK,false,'center','');
  text(clip,'_Info',14,116,WIDTH-28,24,BODY_FONT,14,MUTED,true,'center','');
  for(const [position,index]of indices.entries()){
   const width=indices.length===2?280:574,side=clip.createEmptyMovieClip('_Player'+index,clip.getNextHighestDepth());side._x=18+position*294;side._y=155;
   text(side,'_Status',0,0,width,23,BODY_FONT,14,INK,true,'center','');
   actionButton(side,'_Continue',width/2,48,width,36,'ENTER UPGRADES',14);
   text(side,'_Hint',0,77,width,23,BODY_FONT,12,MUTED,true,'center','');
  }
  view={clip,backdrop,key};views.set(world,view);
 }
 const {clip,backdrop}=view;
 clip._x=(world.mScreenSize.x-WIDTH)/2;clip._y=Math.max(64,(world.mScreenSize.y-HEIGHT)/2);
 backdrop._visible=clip._visible=!world.mHud.mcScreenPause;
 backdrop.clear();backdrop.beginFill(0x23231f,35);backdrop.moveTo(0,0);backdrop.lineTo(world.mScreenSize.x,0);backdrop.lineTo(world.mScreenSize.x,world.mScreenSize.y);backdrop.lineTo(0,world.mScreenSize.y);backdrop.lineTo(0,0);backdrop.endFill();
 const waiting=intro.remainingTicks>0;
 clip._Title.text=round.outcome==='survived'?'WAVE '+round.wave+' SURVIVED':round.outcome==='boss'||round.multiplier===2&&round.outcome!=='clear'?'BOSS DOWN!':'WAVE '+round.wave+' CLEARED!';
 clip._Timer.text=waiting?String(Math.ceil(intro.remainingTicks/CMain.mFPS)):'WAVE COMPLETE';
 clip._Info.text=`REWARD x${round.multiplier} / ${waiting?'UPGRADES OPEN AFTER 3 SECONDS':'CHOOSE YOUR UPGRADE NEXT'}`;
 for(const index of indices){
  const side=clip['_Player'+index],entered=intro.entered[index],enabled=!waiting&&!entered;
  side._Status.text='P'+(index+1)+' / '+(entered?'WAITING FOR PARTNER':waiting?'WAVE COMPLETE':'READY TO ENTER');side._Status.textColor=entered?GREEN:INK;
  setButtonLabel(side._Continue,entered?'WAITING FOR PARTNER':waiting?'PLEASE WAIT':'ENTER UPGRADES');
  side._Continue.enabled=enabled;side._Continue._alpha=enabled?100:55;
  side._Continue.onRelease=enabled?()=>queueDraftCommand(world,index,DRAFT_CONTINUE,round.wave,'intro'):undefined;
  side._Hint.text=waiting?'INPUT CANNOT SKIP THIS PAUSE':entered?'BOTH PLAYERS MUST ENTER':`RELEASE, THEN PRESS [${confirmKeyLabel(index)}] / PAD A`;
 }
}
