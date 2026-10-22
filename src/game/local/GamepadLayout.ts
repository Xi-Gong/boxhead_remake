// The Gamepad API numbers physical positions; printed Nintendo letters swap both Xbox pairs.
export type PadLayout = 'xbox' | 'nintendo';
export type PadLayoutChoice = 'auto' | PadLayout;
export type PadLayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;
const faces = {xbox: {A:0,B:1,X:2,Y:3}, nintendo: {A:1,B:0,X:3,Y:2}} as const;
export function resolvePadLayout(id: string | undefined, choice: PadLayoutChoice): PadLayout {
 if(choice!=='auto')return choice;
 // Xbox-branded SN30 editions have Xbox lettering. Generic XInput IDs cannot identify an SN30 shell.
 return !/xbox|for android/i.test(id??'')&&/sn30|sf30|nintendo|switch pro|pro controller|8bitdo.*pro[ -]?2/i.test(id??'')?'nintendo':'xbox';
}
export function padFaceButtons(id: string | undefined, choice: PadLayoutChoice){return faces[resolvePadLayout(id,choice)];}
function browserStorage(): PadLayoutStorage | undefined {try{return globalThis.localStorage;}catch{return undefined;}}
export function padLayoutPreferences(storage: PadLayoutStorage | undefined = browserStorage()) {
 const key=(id:string|undefined,slot:number)=>`BOXHEAD_PAD_LAYOUT_V1:${slot}:${id??''}`;
 return {
  read(id:string|undefined,slot:number):PadLayoutChoice {try{const value=storage?.getItem(key(id,slot));return value==='xbox'||value==='nintendo'?value:'auto';}catch{return 'auto';}},
  write(id:string|undefined,slot:number,choice:PadLayoutChoice):void {try{storage?.setItem(key(id,slot),choice);}catch{/* Layout still works for this session when storage is unavailable. */}},
 };
}
