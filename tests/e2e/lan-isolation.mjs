// Test-process socket namespace: real transport, isolated from the player's normal LAN room.
export async function isolateLanPorts(app) {
 await app.evaluate(() => {
  if(globalThis.__qaIsolatedLanPorts)return;
  const net=process.getBuiltinModule('net'),udp=process.getBuiltinModule('dgram');
  const listen=net.Server.prototype.listen,connect=net.Socket.prototype.connect;
  const bind=udp.Socket.prototype.bind,send=udp.Socket.prototype.send;
  const tcpPort=p=>Number(p)>=47631&&Number(p)<=47640?Number(p)+1000:p;
  net.Server.prototype.listen=function(...args){
   if(args[0]&&typeof args[0]==='object'&&'port' in args[0])args[0]={...args[0],port:tcpPort(args[0].port)};
   else if(typeof args[0]==='number')args[0]=tcpPort(args[0]);
   return listen.apply(this,args);
  };
  net.Socket.prototype.connect=function(...args){
   // net.connect(options) passes its normalized [options, callback] tuple to Socket.connect.
   if(Array.isArray(args[0])){
    const tuple=args[0];tuple[0]={...tuple[0],port:tcpPort(tuple[0].port)};
   }else if(args[0]&&typeof args[0]==='object'&&'port' in args[0])args[0]={...args[0],port:tcpPort(args[0].port)};
   else if(typeof args[0]==='number')args[0]=tcpPort(args[0]);
   return connect.apply(this,args);
  };
  udp.Socket.prototype.bind=function(...args){
   if(args[0]===47630)args[0]=48630;
   else if(args[0]?.port===47630)args[0]={...args[0],port:48630};
   return bind.apply(this,args);
  };
  udp.Socket.prototype.send=function(...args){
   // Discovery uses send(buffer, port, address); ephemeral fast-input ports are untouched.
   if(args[1]===47630)args[1]=48630;
   return send.apply(this,args);
  };
  globalThis.__qaIsolatedLanPorts={discovery:48630,tcp:[48631,48640]};
 });
 console.log('QA LAN ports: discovery 48630; TCP 48631-48640 (player ports untouched)');
}
