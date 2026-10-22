import {expect,it} from 'vitest';
import {padFaceButtons,padLayoutPreferences,resolvePadLayout} from '../../../src/game/local/GamepadLayout.ts';
it('resolves printed letters without changing triggers, sticks or assuming every 8BitDo uses Nintendo labels',()=>{
 expect(padFaceButtons('8BitDo SN30 Pro','auto')).toEqual({A:1,B:0,X:3,Y:2});
 for(const id of ['Xbox 360 Controller','8BitDo Ultimate 2C','8BitDo SN30 Pro Xbox','8BitDo SN30 Pro for Android'])expect(resolvePadLayout(id,'auto')).toBe('xbox');
 expect(resolvePadLayout('Pro Controller (Vendor: 057e Product: 2009)','auto')).toBe('nintendo');
 expect(padFaceButtons('Xbox 360 Controller','nintendo')).toEqual({A:1,B:0,X:3,Y:2});
});
it('remembers layout separately by pad identity and slot, and tolerates unavailable storage',()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 padLayoutPreferences(storage).write('Xbox',0,'nintendo');const again=padLayoutPreferences(storage);
 expect(again.read('Xbox',0)).toBe('nintendo');expect(again.read('Xbox',1)).toBe('auto');expect(again.read('Other',0)).toBe('auto');again.write('Xbox',0,'auto');expect(again.read('Xbox',0)).toBe('auto');
 const denied=padLayoutPreferences({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});expect(denied.read('Xbox',0)).toBe('auto');expect(()=>denied.write('Xbox',0,'nintendo')).not.toThrow();
});
