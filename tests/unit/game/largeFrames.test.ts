import {expect,it} from 'vitest';
import {FrameDecoder,encodeFrame,LAN_FRAME_MAX} from '../../../src/game/local/Net/protocol.ts';
import {outboundFrames,LargeFrameAssembler,LARGE_FRAME_MAX} from '../../../electron/largeFrames.ts';

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
 const value={t:'start',snap:'x'.repeat(LAN_FRAME_MAX*2)},parsed=outboundFrames(value,true).map(f=>new FrameDecoder().push(f)[0])as any[];
 expect(()=>new LargeFrameAssembler().accept(parsed[0],false)).toThrow();
 expect(()=>new LargeFrameAssembler().accept(parsed[1],true)).toThrow();
 for(const changed of [{...parsed[1],id:'different'},{...parsed[1],index:0},{...parsed[1],data:'@'}, {...parsed[1],count:1e6}]){
  const a=new LargeFrameAssembler();a.accept(parsed[0],true);expect(()=>a.accept(changed,true)).toThrow();
 }
 expect(()=>outboundFrames({t:'start',snap:'x'.repeat(LARGE_FRAME_MAX)},true)).toThrow();
});
it('clears partial transfer state when a connection is disposed or replaced',()=>{
 const a=new LargeFrameAssembler(),frames=outboundFrames({snap:'x'.repeat(LAN_FRAME_MAX*2)},true).map(f=>new FrameDecoder().push(f)[0]);
 a.accept(frames[0],true);a.clear();expect(()=>a.accept(frames[1],true)).toThrow();
 const output=frames.map(frame=>a.accept(frame,true)).filter(v=>v!==undefined);expect(output).toEqual([{snap:'x'.repeat(LAN_FRAME_MAX*2)}]);
});
