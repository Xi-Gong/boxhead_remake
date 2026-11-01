// Controlled long-run state, applied at a common simulation tick; real renderer restart and room rejoin.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Game,toMainMenu} from './lib.mjs';
export async function verifyLargeCheckpoint(H,C,report,out){
 for(const peer of [H,C])await peer.app.evaluate(()=>{
  const net=process.getBuiltinModule('net'),write=net.Socket.prototype.write;globalThis.__largeCheckpointFragments=0;
  net.Socket.prototype.write=function(...args){try{const value=args[0];if(ArrayBuffer.isView(value)&&JSON.parse(Buffer.from(value.buffer,value.byteOffset,value.byteLength).subarray(4).toString()).t==='fragment')globalThis.__largeCheckpointFragments++;}catch{}return write.apply(this,args);};
 });
 const games=[H,C].map(p=>new Game(p.page,p.page.context(),report.errors)),both=async expression=>{for(const g of games)assert(await g.waitExpr(expression,20000),expression);};
 const read=()=>Promise.all(games.map(g=>g.expr('(()=>{const w=m.mcWorld;return {wave:w.mUpgrades.mLevelIndex,checkpoint:g.lan().checkpoint,crates:Object.values(w.mThing_Collection.mThings).filter(t=>t.Process&&t.mSupplyId).map(t=>[t.mSupplyId,t.mSupplyKind]).sort(),growth:w.mUpgrades.lanGrowth,bonuses:w.mUpgrades.waveDraft.bonuses,digest:g.__netDigest(),events:g.lan().confirmedEvents};})()')));
 await H.page.keyboard.press('KeyP');await both('!g.lan().paused');
 const target=Math.max(...await Promise.all(games.map(g=>g.expr('m.mcWorld.mTick'))))+50;
 for(const peer of [H,C])await peer.page.evaluate(target=>{
  const w=window.__game.main().mcWorld,prior=w.Process,P=window.__game.pkg;
  w.Process=function(...args){if(this.mTick===target){
   const mask=P.World.Map.CMap_Cell.mCollide_StaticImpassable|P.World.Map.CMap_Cell.mCollide_Object|P.World.Map.CMap_Cell.mCollide_EdgeOfMap,players=Object.values(this.mThing_Collection.mPlayerThings);
   const cell=this.mMap.mCells.flat().find(c=>c&&!(c.mCollide&mask)&&players.every(p=>Math.hypot(p.mPosition.mX-c.mID.x-.5,p.mPosition.mY-c.mID.y-.5)>5));
   if(!cell)throw new Error('large checkpoint has no reachable test floor');
   for(let i=0;i<600;i++)this.mThing_Collection.AddThing(new P.Thing.Object.CThing_Object_SupplyCrate(new P.Thing.Math.CThing_Position(cell.mID.x+.5,cell.mID.y+.5,0),['medical','armor','enchant','ammo'][i%4],'s'+this.mUpgrades.supplyState.nextId++));
   this.mUpgrades.AdvanceTimedWave();
  }return prior.apply(this,args);};
 },target);
 await both('m.mcWorld.mTick>'+target+'&&g.lan().checkpoint>='+target);
 await H.page.keyboard.press('KeyP');await both('g.lan().paused');
 const before=await read();assert.deepEqual(before[0].crates,before[1].crates);assert.equal(before[0].crates.length,600);assert.deepEqual(before[0].digest,before[1].digest);
 const checkpoint=before[0].checkpoint;
 await C.page.evaluate(()=>window.boxheadDesktop.lan.shutdown());
 assert(await games[0].waitExpr('g.lan().session==="reconnecting"',10000));
 await C.page.reload();assert(await games[1].waitExpr('g.ready',120000));await toMainMenu(games[1]);await C.page.evaluate(()=>window.__game.__setInfiniteLife(true));
 await games[1].clickClip('m.mcScreen.mcLanGame');assert(await games[1].waitScreen('State_LanLobby','Screen_LanLobby'));
 const input=C.page.locator('input[type=text]');await input.click();await C.page.keyboard.type('127.0.0.1');
 await games[1].clickClip('m.mcScreen.entryEls.find(b=>b?._Contents?._Label?.text==="JOIN")');
 await both('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded&&g.lan().session==="playing"');
 await H.page.waitForTimeout(500);await H.page.keyboard.press('KeyP');await both('g.lan().paused');
 const after=await read();assert.deepEqual(after[0].digest,after[1].digest);assert.deepEqual(after[0].events,after[1].events);
 for(const row of after){assert.equal(row.checkpoint,checkpoint);assert.deepEqual(row.crates,before[0].crates);assert.deepEqual(row.bonuses,before[0].bonuses);assert.deepEqual(row.growth,before[0].growth);}
 await games[0].shot(join(out,'large-checkpoint-restored.png'),false);
 const fragments=await Promise.all([H,C].map(peer=>peer.app.evaluate(()=>globalThis.__largeCheckpointFragments)));assert(fragments[0]>1,'host really sent negotiated fragments');
 report.largeCheckpoint={ok:true,permanentCrates:600,fragments,before,after,method:'Common-tick prepared permanent supplies; real client renderer restart, IP typing and rejoin; full confirmed gameplay and sound identity comparison.'};
 console.log('LARGE CHECKPOINT: 600 permanent crates survived renderer restart and checkpoint transfer');
}
