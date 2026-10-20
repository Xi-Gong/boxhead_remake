import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const lan = vi.hoisted(() => ({onMessage:vi.fn(),onPeer:vi.fn(),onHosts:vi.fn(),connect:vi.fn(),hostStart:vi.fn(),addresses:vi.fn(),discoverStart:vi.fn(),send:vi.fn(),shutdown:vi.fn()}));
vi.mock('../../../src/engine/platform/desktop.ts',()=>({desktop:{lan}}));
import { lanBridge, _resetBridgeForTests } from '../../../src/game/local/Net/bridge.ts';
import { CMain, CSaveData } from '../../../src/game/packages.ts';
import '../../../src/game/allClasses.ts';
function deferred<T>() { let resolve!: (v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
describe('LAN bridge operation lifetime',()=>{
 it.each([true,false])('negotiates timed waves and rejects a downgraded timer checkpoint: %s',enabled=>{
  const b=lanBridge(),previous=CMain.mSaveData;CMain.mSaveData={} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  const features=['endless-pve-v1','personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2','pve-balance-v1',...(enabled?['timed-waves-v1']:[])];
  try{
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});b.phase='setup';b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');expect(start.cfg.timedWaves).toBe(enabled?'timed-waves-v1':undefined);
   expect(b.timedWavesAvailable()).toBe(enabled);
   const onHello=vi.fn();b.session={phase:'reconnecting',startOpts:{cfg:{endless:'endless-pve-v1',timedWaves:'timed-waves-v1'}},onHello} as any;
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});expect(onHello).toHaveBeenCalledTimes(enabled?1:0);
  }finally{b.session=null;CMain.mSaveData=previous;launch.mockRestore();}
 });
 it.each([undefined,'persistent-enchantment-v1','enemy-variants-v1','endless-pve-v1','personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2','pve-balance-v1'])('negotiates persistent enchantment and guards recovery; missing %s',missing=>{
  const b=lanBridge(),previous=CMain.mSaveData;CMain.mSaveData={} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{}),features=['persistent-enchantment-v1','enemy-variants-v1','endless-pve-v1','personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2','pve-balance-v1'].filter(f=>f!==missing);
  try{
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});b.phase='setup';b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');expect(start.cfg.enchantment).toBe(missing?undefined:'persistent-enchantment-v1');
   const onHello=vi.fn();b.session={phase:'reconnecting',startOpts:{cfg:{endless:'endless-pve-v1',variants:'enemy-variants-v1',enchantment:'persistent-enchantment-v1'}},onHello} as any;
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});expect(onHello).toHaveBeenCalledTimes(missing?0:1);
   if(missing)expect(b.message).toContain('v0.3.0-rc2');
  }finally{b.session=null;CMain.mSaveData=previous;launch.mockRestore();}
 });
 it.each([true,false])('negotiates enemy variants and refuses incompatible modern recovery: %s',enabled=>{
  const b=lanBridge(),previous=CMain.mSaveData;CMain.mSaveData={} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{}),features=['endless-pve-v1','personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2','pve-balance-v1',...(enabled?['enemy-variants-v1']:[])];
  try{
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});b.phase='setup';b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');expect(start.cfg.variants).toBe(enabled?'enemy-variants-v1':undefined);
   const onHello=vi.fn();b.session={phase:'reconnecting',startOpts:{cfg:{endless:'endless-pve-v1',variants:'enemy-variants-v1'}},onHello} as any;
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});expect(onHello).toHaveBeenCalledTimes(enabled?1:0);
   if(!enabled)expect(b.message).toContain('v0.3.0');
  }finally{b.session=null;CMain.mSaveData=previous;launch.mockRestore();}
 });
 it.each([undefined,...['endless-pve-v1','personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2','pve-balance-v1']])('negotiates endless waves only with every prerequisite; missing %s',missing=>{
  const b=lanBridge(),previous=CMain.mSaveData,shared=CSaveData.mSharedObject;CMain.mSaveData={} as any;
  CSaveData.mSharedObject={data:{mMaxWaveReached:1000}} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try{
   const features=['endless-pve-v1','personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2','pve-balance-v1'].filter(f=>f!==missing);
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});b.phase='setup';
   expect(b.sel.maxWave).toBe(missing?100:1000);
   b.sel={...b.sel,wave:missing?100:1000};b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');
   expect(start.wave).toBe(missing?100:1000);expect(start.cfg.endless).toBe(missing?undefined:'endless-pve-v1');
  }finally{CMain.mSaveData=previous;CSaveData.mSharedObject=shared;launch.mockRestore();}
 });
 it.each([false,true])('negotiates reliable supplies only with all prerequisites: %s',enabled=>{
  const b=lanBridge(),previous=CMain.mSaveData;CMain.mSaveData={} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try{
   const features=['personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2',...(enabled?['reliable-supplies-v1']:[])];
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features});b.phase='setup';b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');
   expect(start.cfg.refill).toBe(enabled?'reliable-supplies-v1':undefined);
  }finally{CMain.mSaveData=previous;launch.mockRestore();}
 });
 it('never publishes an invalid wave and rechecks the host save cap before starting',()=>{
  const b=lanBridge(),previous=CMain.mSaveData,oldShared=CSaveData.mSharedObject;CMain.mSaveData={} as any;
  CSaveData.mSharedObject={data:{mMaxWaveReached:7}} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try{
   b.phase='setup';const before=b.sel;
   for(const wave of [0,101,1.5,'2',NaN])b.setSel({...before,wave:wave as number,maxWave:100});
   expect(b.sel).toBe(before);expect(lan.send).not.toHaveBeenCalled();
   b.sel={...before,wave:8,maxWave:100};b.startGame(false);expect(launch).not.toHaveBeenCalled();
   b.sel={...before,wave:7,maxWave:100};b.startGame(false);expect(launch).toHaveBeenCalledOnce();
  }finally{CMain.mSaveData=previous;CSaveData.mSharedObject=oldShared;launch.mockRestore();}
 });
 it('normalizes numeric save switches and publishes host settings in the waiting room and setup',()=>{
  const b=lanBridge(),previous=CMain.mSaveData;CMain.mSaveData={mGameSpeed:0,mDevilsActive:0,mCollisionsActive:1,mDamageActive:0,mDetail:0} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try{
   b.phase='lobby';b.setSel({...b.sel,difficulty:2,settings:{gameSpeed:2,devils:false,collisions:true,damage:false}});
   expect(lan.send).toHaveBeenLastCalledWith({t:'lobby',sel:b.sel});
   b.peerName='guest';b.ready=true;b.enterSetup();expect(b.sel.difficulty).toBe(2);expect(b.sel.settings?.gameSpeed).toBe(2);
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',features:['team-pass-v1']});
   b.phase='setup';b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');
   expect(start.cfg).toMatchObject({difficulty:2,gameSpeed:2,devils:false,collisions:true,damage:false,detail:false,teamPass:'team-pass-v1'});
   b.sel={...b.sel,settings:undefined};lan.send.mockClear();b.startGame(false);
   const next=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');expect(next.cfg.damage).toBe(false);
  }finally{CMain.mSaveData=previous;launch.mockRestore();}
 });
 it('blocks guest edits and changes during a running game',()=>{
  const b=lanBridge(),before=b.sel;b.phase='lobby';b.isHost=false;
  b.setSel({...before,difficulty:3});expect(b.sel).toBe(before);expect(lan.send).not.toHaveBeenCalled();
  b.isHost=true;b.phase='playing';b.setSel({...before,difficulty:3});expect(b.sel).toBe(before);
 });
 it.each([[],['personal-growth-v1'],['armor-ammo-v1'],['personal-growth-v1','armor-ammo-v1'],['pve-balance-v1'],['personal-growth-v1','pve-balance-v1'],['personal-growth-v1','armor-ammo-v1','pve-balance-v1'],['survival-v1'],['survival-v1','personal-growth-v1'],['survival-v1','personal-growth-v1','armor-ammo-v1'],['supply-crates-v2'],['supply-crates-v2','personal-growth-v1','armor-ammo-v1'],['supply-crates-v2','survival-v1','personal-growth-v1','armor-ammo-v1']].map(features=>({features})))('negotiates gameplay rules from advertised features $features',({features})=>{
  const b=lanBridge(), previous=CMain.mSaveData;
  CMain.mSaveData={} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try {
   lan.onMessage.mock.calls[0]![0]({t:'hello',name:'guest',sid:'qa',char:0,features});
   b.phase='setup';b.startGame(false);
   const start=lan.send.mock.calls.map(c=>c[0]).find(m=>m.t==='start');
   expect(start.cfg.progression).toBe(features.includes('personal-growth-v1')?'personal-growth-v1':undefined);
   expect(start.cfg.supplies).toBe(features.includes('armor-ammo-v1')?'armor-ammo-v1':undefined);
   expect(start.cfg.balance).toBe(['personal-growth-v1','armor-ammo-v1','pve-balance-v1'].every(f=>features.includes(f))?'pve-balance-v1':undefined);
   expect(start.cfg.survival).toBe(['personal-growth-v1','armor-ammo-v1','survival-v1'].every(f=>features.includes(f))?'survival-v1':undefined);
   expect(start.cfg.loot).toBe(['personal-growth-v1','armor-ammo-v1','survival-v1','supply-crates-v2'].every(f=>features.includes(f))?'supply-crates-v2':undefined);
  } finally {CMain.mSaveData=previous;launch.mockRestore();}
 });
 it('a restarted client without history rejects in-place recovery',()=>{
  lanBridge();
  lan.onMessage.mock.calls[0]![0]({t:'recover',stage:'offer',generation:3,seed:7,need:90,head:95});
  expect(lan.send).toHaveBeenCalledWith({t:'recover',stage:'reject',generation:3,seed:7,need:90,head:95});
 });
 it.each([{netcodes:[]},{netcodes:['rollback-v2']}])('negotiates start mode from peer capability $netcodes',({netcodes})=>{
  const b=lanBridge(), previous=CMain.mSaveData;
  CMain.mSaveData={} as any;
  const launch=vi.spyOn(b as any,'launch').mockImplementation(()=>{});
  try {
   expect(b.useRollbackV2).toBe(true);
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
