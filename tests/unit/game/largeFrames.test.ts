import {expect,it} from 'vitest';
import {FrameDecoder,encodeFrame,LAN_FRAME_MAX} from '../../../src/game/local/Net/protocol.ts';
import {outboundFrames,LargeFrameAssembler,LARGE_FRAME_MAX} from '../../../electron/largeFrames.ts';
import {validLanMessage} from '../../../src/game/local/Net/MessageValidation.ts';

it('retains byte-identical legacy frames and negotiates oversized checkpoint fragmentation',()=>{
 const small={t:'in',tick:42,bits:16};expect(outboundFrames(small,false)).toEqual([encodeFrame(small)]);
 const message={t:'start',snap:{objects:Array.from({length:600},(_,i)=>({classID:'CThing_Object_SupplyCrate',origin:'placed',x:5.5,y:5.5,angle:0,supply:{kind:'armor',id:'s'+i}}))}};
 expect(()=>new FrameDecoder().push(encodeFrame(message))).toThrow(/too large/);
 expect(()=>outboundFrames(message,false)).toThrow(/negotiated/);
 const frames=outboundFrames(message,true),decoder=new FrameDecoder(),assembler=new LargeFrameAssembler(),received:unknown[]=[];
 expect(frames.length).toBeGreaterThan(1);
 for(const frame of frames){expect(frame.length-4).toBeLessThanOrEqual(LAN_FRAME_MAX);
  for(let i=0;i<frame.length;i+=113)for(const parsed of decoder.push(frame.subarray(i,i+113))){const result=assembler.accept(parsed,true);if(result!==undefined)received.push(result);}
 }expect(received).toEqual([message]);
});
it('rejects unnegotiated, missing, mixed, reordered and oversized transfers',()=>{
 const value={t:'start',snap:{payload:'x'.repeat(LAN_FRAME_MAX*2)}},parsed=outboundFrames(value,true).map(f=>new FrameDecoder().push(f)[0])as any[];
 expect(()=>new LargeFrameAssembler().accept(parsed[0],false)).toThrow();
 expect(()=>new LargeFrameAssembler().accept(parsed[1],true)).toThrow();
 for(const changed of [{...parsed[1],id:'different'},{...parsed[1],index:0},{...parsed[1],data:'@'}, {...parsed[1],count:1e6}]){
  const a=new LargeFrameAssembler();a.accept(parsed[0],true);expect(()=>a.accept(changed,true)).toThrow();
 }
 expect(()=>outboundFrames({t:'start',snap:{payload:'x'.repeat(LARGE_FRAME_MAX)}},true)).toThrow();
});
it('clears partial transfer state when a connection is disposed or replaced',()=>{
 const value={t:'start',snap:{payload:'x'.repeat(LAN_FRAME_MAX*2)}},a=new LargeFrameAssembler(),frames=outboundFrames(value,true).map(f=>new FrameDecoder().push(f)[0]);
 a.accept(frames[0],true);a.clear();expect(()=>a.accept(frames[1],true)).toThrow();
 const output=frames.map(frame=>a.accept(frame,true)).filter(v=>v!==undefined);expect(output).toEqual([value]);
});
it('does not expand the original control-message limit through negotiated fragmentation',()=>{
 const input={t:'in',tick:1,bits:0,weaponCommands:[{button:'A',action:'select',extension:'x'.repeat(100000)}]};
 expect(validLanMessage(input)).toBe(true); // Unknown optional fields remain wire-compatible.
 expect(()=>outboundFrames(input,true)).toThrow(/checkpoint/i);
});
it('rejects a forged fragmented input before it can enter renderer input caches',()=>{
 const input={t:'in',tick:1,bits:0,sum:{tick:1,score:0,things:1,zombies:0,q:[0,0,0,0,0,0],extension:'x'.repeat(100000)}};
 expect(validLanMessage(input)).toBe(true);
 const body=encodeFrame(input).subarray(4),assembler=new LargeFrameAssembler(),count=Math.ceil(body.length/32768);
 expect(()=>{for(let index=0;index<count;index++)assembler.accept({t:'fragment',id:'forged-control',index,count,data:Buffer.from(body.subarray(index*32768,(index+1)*32768)).toString('base64')},true);}).toThrow(/checkpoint/i);
});
