import './headless.ts';
import {expect,it} from 'vitest';
import {Socket} from 'node:net';
import {lanBridge,_resetBridgeForTests} from '../../src/game/local/Net/bridge.ts';
import {LanTransport} from '../../electron/lan.ts';
import {encodeFrame,FrameDecoder} from '../../src/game/local/Net/protocol.ts';

const cfg={difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0};
it('a joining client cannot launch a game on the host before the host has a session',()=>{
 _resetBridgeForTests();const b=lanBridge(),old=(b as any).launch;let launches=0;
 try{
  b.isHost=true;b.phase='lobby';(b as any).launch=()=>launches++;
  (b as any).onMessage({t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',cfg,seed:42});
  expect(launches).toBe(0);expect(b.session).toBeNull();expect(b.phase).toBe('lobby');
 }finally{(b as any).launch=old;_resetBridgeForTests();}
});
it('clients ignore a host attempting to renegotiate itself as the joining peer',()=>{
 _resetBridgeForTests();const b=lanBridge();try{
  b.isHost=false;b.phase='lobby';b.peerName='host';
  (b as any).onMessage({t:'hello',proto:1,app:'test',name:'spoof',char:0,sid:'spoof',features:[]});
  expect(b.peerName).toBe('host');expect(b.sid).toBeUndefined();
 }finally{_resetBridgeForTests();}
});
it.each([{t:'hello',proto:1,app:'test',name:'spoof',char:0},{t:'welcome',proto:1,app:'test',name:'spoof',sid:'x',ok:true}])('handshake messages cannot be replayed over an established connection: %j',message=>{
 const transport=new LanTransport({identity:'test'}),socket=new Socket(),received:unknown[]=[];
 transport.onMessage(m=>received.push(m));try{
  (transport as any).attachPeer(socket,new FrameDecoder());socket.emit('data',Buffer.from(encodeFrame(message)));
  expect(received).toEqual([]);expect(transport.hasPeer).toBe(false);
 }finally{transport.shutdown();socket.destroy();}
});
