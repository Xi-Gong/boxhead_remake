// Negotiated checkpoint-only fragmentation. Simulation messages retain their original JSON/wire fields.
import {randomUUID} from 'node:crypto';
import {encodeFrame,LAN_FRAME_MAX} from '../src/game/local/Net/protocol.ts';
export const LARGE_FRAMES_CAPABILITY='large-frames-v1';
export const LARGE_FRAME_MAX=8*1024*1024;
const CHUNK=32*1024;
interface Fragment {t:'fragment';id:string;index:number;count:number;data:string}
const checkpoint=(value:any):boolean=>value?.t==='start'&&value.snap!==null&&typeof value.snap==='object'&&!Array.isArray(value.snap);

export function outboundFrames(message:unknown,negotiated:boolean):Uint8Array[]{
 const encoded=encodeFrame(message);
 if(encoded.length-4<=LAN_FRAME_MAX)return [encoded];
 if(!negotiated||encoded.length-4>LARGE_FRAME_MAX)throw new Error('LAN message exceeds negotiated transfer limit');
 // Inputs/commands/checksums retain the original cap, including unknown optional fields they cache.
 if(!checkpoint(message))throw new Error('Large LAN transfer requires a checkpoint');
 const body=encoded.subarray(4),id=randomUUID(),count=Math.ceil(body.length/CHUNK),frames:Uint8Array[]=[];
 for(let index=0;index<count;index++)frames.push(encodeFrame({t:'fragment',id,index,count,data:Buffer.from(body.subarray(index*CHUNK,(index+1)*CHUNK)).toString('base64')} satisfies Fragment));
 return frames;
}
export class LargeFrameAssembler {
 private pending:{id:string;count:number;parts:Buffer[];bytes:number}|undefined;
 accept(value:any,negotiated:boolean):unknown|undefined{
  if(value?.t!=='fragment')return value;
  const {id,index,count,data}=value;
  if(!negotiated||typeof id!=='string'||!id.length||id.length>64||!Number.isInteger(index)||!Number.isInteger(count)||count<2||count>Math.ceil(LARGE_FRAME_MAX/CHUNK)
   ||index<0||index>=count||typeof data!=='string'||data.length>4*Math.ceil(CHUNK/3))throw new Error('Invalid LAN fragment');
  const part=Buffer.from(data,'base64');
  if(!part.length||part.length>CHUNK||part.toString('base64')!==data)throw new Error('Invalid LAN fragment body');
  if(!this.pending){if(index!==0)throw new Error('Missing first LAN fragment');this.pending={id,count,parts:[],bytes:0};}
  const p=this.pending;
  if(p.id!==id||p.count!==count||p.parts.length!==index||p.bytes+part.length>LARGE_FRAME_MAX)throw new Error('Out-of-order LAN fragment');
  p.parts.push(part);p.bytes+=part.length;
  if(p.parts.length<count)return undefined;
  this.pending=undefined;
  const result=JSON.parse(Buffer.concat(p.parts,p.bytes).toString('utf8'));
  if(result?.t==='fragment')throw new Error('Nested LAN fragments');
  if(!checkpoint(result))throw new Error('Large LAN transfer requires a checkpoint');
  return result;
 }
 clear():void{this.pending=undefined;}
}
