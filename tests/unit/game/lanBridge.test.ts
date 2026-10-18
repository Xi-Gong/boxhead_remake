import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const lan = vi.hoisted(() => ({onMessage:vi.fn(),onPeer:vi.fn(),onHosts:vi.fn(),connect:vi.fn(),hostStart:vi.fn(),addresses:vi.fn(),discoverStart:vi.fn(),send:vi.fn(),shutdown:vi.fn()}));
vi.mock('../../../src/engine/platform/desktop.ts',()=>({desktop:{lan}}));
import { lanBridge, _resetBridgeForTests } from '../../../src/game/local/Net/bridge.ts';
function deferred<T>() { let resolve!: (v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
describe('LAN bridge operation lifetime',()=>{
 beforeEach(()=>{vi.resetAllMocks();});afterEach(()=>{_resetBridgeForTests();});
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
});
