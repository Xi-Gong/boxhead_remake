// Renderer-owned inspection state. Opening a sheet only filters this machine's sampled input.
import {Key} from '../../engine/runtime.ts';
import {CMain,CSaveData,CInput} from '../packages.ts';
import {netSession} from './Net/NetSession.ts';
import {SLOT_ORDER} from './Net/NetSlot.ts';
type Sheet={open:boolean;release:boolean};
type View={wave:number;sheets:Sheet[];binding?:number;message:string};
const views=new WeakMap<object,View>();
function view(world:any):View{
 const wave=world.mUpgrades?.waveDraft?.round?.wave??-1;let v=views.get(world);
 if(!v||v.wave!==wave){v={wave,sheets:[{open:false,release:false},{open:false,release:false}],message:''};views.set(world,v);}return v;
}
export function statsKeys():number[]{
 const keys=CSaveData.mSharedObject?.data?.mDraftStatsKeys;
 const used=new Set<number>([80]);
 for(const name of SLOT_ORDER)for(const post of ['','2']){const key=CMain.mInput?.['KEY_'+name+post]?.mKeycode;if(typeof key==='number')used.add(key);}
 return [0,1].map(i=>{
  const preferred=Number.isInteger(keys?.[i])&&keys[i]>0&&keys[i]<256?keys[i]:i?82:9;
  const chosen=[preferred,i?82:9,84,71,72,74,75,76,86,66].find(key=>!used.has(key))??120;
  used.add(chosen);return chosen;
 });
}
export function statsKeyLabel(index:number):string{const key=statsKeys()[index]!;return key===9?'TAB':String(CInput.mValidKeys?.[key]?.mName??String.fromCharCode(key)).replace(/^'(.)'$/,'$1');}
export function statsOpen(world:any,index:number):boolean{return view(world).sheets[index]?.open??false;}
export function toggleStats(world:any,index:number):void{
 const round=world.mUpgrades?.waveDraft?.round,s=netSession();
 if(!round||index>=round.offers.length||s&&s.role!==index)return;
 const sheet=view(world).sheets[index]!;sheet.open=!sheet.open;sheet.release=true;view(world).binding=undefined;
}
export function beginStatsBinding(world:any,index:number):void{view(world).binding=index;view(world).message='PRESS A KEY / ESC TO CANCEL';}
export function statsBindingHint(world:any):string{return view(world).message;}
export function draftInputBlocked(world:any,index:number):boolean{
 if(!world?.mUpgrades?.waveDraft?.round)return false;
 const sheet=view(world).sheets[index]!;if(sheet.open)return true;
 if(!sheet.release)return false;
 const input=CMain.mInput,s=netSession();
 const held=SLOT_ORDER.some(name=>(s?['','2']:[index?'2':'']).some(postfix=>input?.['KEY_'+name+postfix]?.IsDown()));
 if(!held)sheet.release=false;return held;
}
export function installDraftStatsInput():void{
 const proto=CInput.prototype as any,process=proto.ProcessAllKeys;
 proto.ProcessAllKeys=function(this:any):any{
  const keys=statsKeys();for(let i=0;i<2;i++)if(this['KEY_STATS'+i]?.mKeycode!==keys[i])this.RegisterKey('KEY_STATS'+i,keys[i]);
  const result=process.call(this),world=CMain._this?.mcWorld;
  // Original CInput instances retain their Key listeners. Only the current world's input may toggle UI.
  if(this!==CMain.mInput||!world?.mLoaded||world.mPaused||!world.mUpgrades?.waveDraft?.round)return result;
  const v=view(world),code=Key.getCode();
  if(v.binding!==undefined&&Key.isDown(code)){
   const index=v.binding;
   if(code===27){v.binding=undefined;v.message='';return result;}
   const used=SLOT_ORDER.some(name=>['','2'].some(post=>this['KEY_'+name+post]?.mKeycode===code))||code===80||code===keys[1-index];
   if(used||code<1||code>255||[16,17,18].includes(code)){v.message='KEY IN USE / CHOOSE ANOTHER';return result;}
   const next=[...keys];next[index]=code;CSaveData.mSharedObject.data.mDraftStatsKeys=next;CMain.mSaveData.SaveData();
   v.binding=undefined;v.message='KEY SAVED';return result;
  }
  for(let i=0;i<2;i++)if(this['KEY_STATS'+i].IsPressed())toggleStats(world,netSession()?.role??i);
  return result;
 };
}
