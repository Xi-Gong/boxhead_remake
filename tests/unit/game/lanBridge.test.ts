import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const lan = vi.hoisted(() => ({onMessage:vi.fn(),onPeer:vi.fn(),onHosts:vi.fn(),connect:vi.fn(),hostStart:vi.fn(),addresses:vi.fn(),discoverStart:vi.fn(),send:vi.fn(),shutdown:vi.fn()}));
vi.mock('../../../src/engine/platform/desktop.ts',()=>({desktop:{lan}}));
import { lanBridge, _resetBridgeForTests } from '../../../src/game/local/Net/bridge.ts';
import { CMain } from '../../../src/game/packages.ts';
import '../../../src/game/allClasses.ts';
function deferred<T>() { let resolve!: (v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
describe('LAN bridge operation lifetime',()=>{
 it.each([{netcodes:[]},{netcodes:['rollback-v2']}])('negotiates start mode from peer capability $netcodes',({netcodes})=>{
  const b=lanBridge(), previous=CMain.mSaveData;
  CMain.mSaveData={} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try {
   b.useRollbackV2=true;
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',sid:'qa',char:0,netcodes});
   b.phase='setup';b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');
   expect(start.netcode).toBe(netcodes.length?'rollback-v2':undefined);
   expect(start.inputDelay).toBe(netcodes.length?0:2);
   expect(launch.mock.calls[0]![8]).toBe(start.netcode);
  } finally {CMain.mSaveData=previous;launch.mockRestore();}
 });
 it('first client launch preserves the host netcode selection',()=>{
  const b=lanBridge(), launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try {
   lan.onMessage.mock.calls[0]![0]({t:'start',mode:'Coop',roomLink:'ROOM_Single_0001',cfg:{},seed:7,inputDelay:0,netcode:'rollback-v2'});
   expect(launch.mock.calls[0]![8]).toBe('rollback-v2');
  } finally {launch.mockRestore();}
 });
 beforeEach(()=>{vi.resetAllMocks();});afterEach(()=>{_resetBridgeForTests();});
 it('a joined guest clears the stale HOSTING banner',()=>{
  const b=lanBridge();b.phase='hosting';b.message='HOSTING - waiting for player 2...';
  lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',sid:'qa',char:0});
  expect(b.phase).toBe('lobby');expect(b.message).toBe('');
 });
 it.each([true,false])('late join result (%s) cannot resurrect a departed room',async(ok)=>{
  const d=deferred<{ok:boolean;reason?:string}>();lan.connect.mockReturnValue(d.promise);
  const b=lanBridge();b.join('127.0.0.1');b.leaveLobby();d.resolve({ok,reason:'late failure'});await settle();
  expect(b.phase).toBe('idle');expect(b.message).toBe('');
 });
 it('an older join result cannot overwrite a newer attempt',async()=>{
  const a=deferred<{ok:boolean}>(),z=deferred<{ok:boolean}>();lan.connect.mockReturnValueOnce(a.promise).mockReturnValueOnce(z.promise);
  const b=lanBridge();b.join('old');b.join('new');a.resolve({ok:true});await settle();expect(b.phase).toBe('joining');
  z.resolve({ok:true});await settle();expect(b.phase).toBe('lobby');
 });
 it('host address lookup cannot update a departed room',async()=>{
  const d=deferred<string[]>();lan.hostStart.mockResolvedValue({ok:true});lan.addresses.mockReturnValue(d.promise);
  const b=lanBridge();b.host();await settle();b.leaveLobby();d.resolve(['10.0.0.7']);await settle();
  expect(b.phase).toBe('idle');expect(b.hostAddrs).toEqual([]);
 });
 it('a discovery failure after leaving cannot restore an error banner',async()=>{
  const d=deferred<{ok:boolean;reason:string}>();lan.discoverStart.mockReturnValue(d.promise);
  const b=lanBridge();b.refresh();b.leaveLobby();d.resolve({ok:false,reason:'late'});await settle();expect(b.message).toBe('');
 });
 it('reconnect timer never cancels an in-flight slow connection',async()=>{
  vi.useFakeTimers();vi.stubGlobal('window',globalThis);
  const d=deferred<{ok:boolean}>();lan.connect.mockReturnValue(d.promise);
  const b=lanBridge();
  const session={role:1,phase:'reconnecting',reconnectSecondsLeft:()=>30,dispose:()=>{},forfeit:()=>{}};
  b.session=session as any;b.hostIp='10.0.0.7';b.phase='playing';
  try {
   (b as any).startReconnectLoop();
   await vi.advanceTimersByTimeAsync(4000);
   expect(lan.connect).toHaveBeenCalledTimes(1);
   d.resolve({ok:false});await settle();
   await vi.advanceTimersByTimeAsync(1000);
   expect(lan.connect).toHaveBeenCalledTimes(2);
   (b as any).stopTimers();
   await vi.advanceTimersByTimeAsync(3000);
   expect(lan.connect).toHaveBeenCalledTimes(2);
  } finally {b.session=null;(b as any).stopTimers();vi.useRealTimers();vi.unstubAllGlobals();}
 });
});
