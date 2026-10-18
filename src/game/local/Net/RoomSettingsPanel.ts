import { CMain } from '../../packages.ts';
import { BODY_FONT, MENU_FONT, INK, RED, GREY, panelCard, pillButton, setButtonEnabled, setButtonLabel, text } from '../UiStyle.ts';
import { lanBridge } from './bridge.ts';
import { roomSettingsFromSave } from './RoomSettings.ts';

/** The same screen-owned canvas panel in the waiting room and setup; no DOM or global listeners. */
export class RoomSettingsPanel {
  readonly root: any;
  private readonly buttons = new Map<string, any>();
  private readonly hint: any;
  constructor(parent: any) {
    this.root = parent.createEmptyMovieClip('_RoomSettings', parent.getNextHighestDepth());
    const card = panelCard(this.root);
    text(card,'_Title',-220,-150,440,28,MENU_FONT,21,RED,false,'center','GAME SETTINGS');
    this.hint=text(card,'_Hint',-220,-119,440,20,BODY_FONT,11,GREY,false,'center','');
    const rows=[['difficulty','DIFFICULTY'],['gameSpeed','GAME SPEED'],['devils','DEVILS'],['collisions','PLAYER COLLISION'],['damage','FRIENDLY FIRE'],['gameAmount','WIN CONDITION']];
    rows.forEach(([key,label],index)=>{
      const y=-82+index*33;
      text(card,'_Label_'+key,-205,y-8,200,22,BODY_FONT,13,INK,true,'left',label!);
      const button=pillButton(card,'_Value_'+key,108,y+2,182,26,'',12);
      button.onRelease=()=>this.change(key!);this.buttons.set(key!,button);
    });
    const close=pillButton(card,'_Close',0,144,170,28,'CLOSE',14);
    close.onRelease=()=>{this.root._visible=false;};
    this.root._visible=false;
  }
  open(): void { this.root._visible=true;this.refresh(); }
  refresh(): void {
    if(!this.root._visible)return;
    const b=lanBridge(),sel=b.sel,settings=sel.settings??roomSettingsFromSave(CMain.mSaveData);
    this.hint.text=b.isHost?'Changes apply to the next new game.':'Host settings - read only';
    const values:Record<string,string>={difficulty:['BEGINNER','INTERMEDIATE','EXPERT','NIGHTMARE'][sel.difficulty]!,
      gameSpeed:['SLOW','NORMAL','FAST'][settings.gameSpeed]!,devils:settings.devils?'ON':'OFF',
      collisions:settings.collisions?'ON':'OFF',damage:settings.damage?'ON':'OFF',
      gameAmount:sel.mode==='DeathMatch'?`${[5,10,20,50][sel.gameAmount]} KILLS`:'SURVIVE WAVES'};
    for(const [key,button]of this.buttons){setButtonLabel(button,values[key]!);
      setButtonEnabled(button,b.isHost&&['hosting','lobby','setup'].includes(b.phase)&&(key!=='gameAmount'||sel.mode==='DeathMatch'),70);}
  }
  private change(key:string):void{
    const b=lanBridge();if(!b.isHost)return;
    const sel=b.sel,settings=sel.settings??roomSettingsFromSave(CMain.mSaveData);
    if(key==='difficulty'||key==='gameAmount')b.setSel({...sel,[key]:(sel[key]+1)%4});
    else if(key==='gameSpeed')b.setSel({...sel,settings:{...settings,gameSpeed:(settings.gameSpeed+1)%3}});
    else if(key==='devils'||key==='collisions'||key==='damage')b.setSel({...sel,settings:{...settings,[key]:!settings[key]}});
    this.refresh();
  }
}
