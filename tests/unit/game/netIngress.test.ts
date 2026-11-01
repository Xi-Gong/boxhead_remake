import {expect,it} from 'vitest';
import {Socket,createServer} from 'node:net';
import {LanTransport} from '../../../electron/lan.ts';
import {encodeFrame,FrameDecoder,decodeBeacon,LAN_MAGIC,LAN_PROTOCOL_VERSION} from '../../../src/game/local/Net/protocol.ts';
import {validLanMessage} from '../../../src/game/local/Net/MessageValidation.ts';

const cfg={difficulty:0,gameSpeed:1,devils:true,collisions:true,damage:true,gameAmount:0,detail:true,charP1:0,charP2:0};
it('accepts supported legacy and extended messages without stripping optional fields',()=>{
 const messages=[{t:'hello',proto:1,app:'build',name:'peer',char:0},
  {t:'welcome',ok:true,proto:1,app:'build',name:'peer',sid:''},
  {t:'setup',sel:{mode:'Coop',charP1:0,charP2:3,levelIdx:17,difficulty:3,gameAmount:0,wave:1}},
  {t:'start',mode:'Coop',roomLink:'ROOM_Single_0018',cfg,seed:0xffffffff,inputDelay:0,netcode:'rollback-v2'},
  {t:'in',tick:42,bits:103,weaponCommands:[{action:'bind',button:'A',weapon:'uzi'}]},
  {t:'recover',stage:'commit',generation:1,seed:0,need:0,head:1,epoch:'test'},
  {t:'hb',ts:0,echo:true},{t:'lobby'},{t:'pause'},{t:'unpause'},{t:'retry'}];
 for(const message of messages)expect(validLanMessage(message),JSON.stringify(message)).toBe(true);
});

it.each([{...cfg,gameSpeed:9},{...cfg,difficulty:-1},{...cfg,features:{}},null])('rejects invalid game configuration: %j',bad=>{
 expect(validLanMessage({t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',cfg:bad,seed:0})).toBe(false);
});

it.each([null,[],17,{t:'in',tick:-1,bits:16},{t:'in',tick:1.5,bits:16},
 {t:'in',tick:0,bits:128},{t:'in',tick:0,bits:'16'},
 {t:'in',tick:0,bits:16,sum:{tick:0,q:null}},
 {t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',seed:0,cfg:null},
 {t:'setup',sel:null},{t:'hb',ts:'broken'},
])('disconnects malformed LAN JSON before it can reach the renderer: %j',message=>{
 const transport=new LanTransport({identity:'ingress-test'}),socket=new Socket(),received:unknown[]=[];
 transport.onMessage(m=>received.push(m));
 try{
  (transport as any).attachPeer(socket,new FrameDecoder());
  socket.emit('data',Buffer.from(encodeFrame(message)));
  expect(received).toEqual([]);
  expect(transport.hasPeer).toBe(false);
 }finally{transport.shutdown();socket.destroy();}
});

it.each([-1,0,65536,1.5])('ignores a discovery beacon with invalid TCP port %s',port=>{
 expect(decodeBeacon(JSON.stringify({magic:LAN_MAGIC,proto:LAN_PROTOCOL_VERSION,app:'x',name:'x',status:'lobby',port}))).toBeNull();
});

it.each([{proto:99,app:'ingress-test'},{proto:LAN_PROTOCOL_VERSION,app:'different-build'}])('refuses a welcome from a different build: %j',async identity=>{
 const sockets=new Set<Socket>(),server=createServer(socket=>{
  sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  socket.once('data',()=>socket.write(encodeFrame({t:'welcome',ok:true,...identity,name:'fake',sid:'test'})));
 });
 const client=new LanTransport({identity:'ingress-test'});
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=(server.address()as {port:number}).port;
  expect(await client.connect('127.0.0.1',{name:'client',char:0},port)).toEqual({ok:false,reason:'version'});
  expect(client.hasPeer).toBe(false);
 }finally{client.shutdown();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
