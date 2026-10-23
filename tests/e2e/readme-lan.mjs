// A real packaged LAN pair, ordinary selected-wave growth and real card/stat controls.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Game} from './lib.mjs';
export async function verifyReadmeLan(H,C,report,out){
 const games=[H,C].map(p=>new Game(p.page,p.page.context(),report.errors));
 const both=async(code)=>{for(const g of games)assert(await g.waitExpr(code,20000),code);};
 const result=report.readme={ok:false,method:'Actual packaged TCP peers, normal wave-3 menu selection and earned starting build; real mouse/keys; shared-tick end-of-wave staging; no stat/inventory rewrites or infinite-life switch'};
 result.initial=await Promise.all(games.map(g=>g.expr('({wave:m.mcWorld.mUpgrades.mLevelIndex,growth:m.mcWorld.mUpgrades.lanGrowth.players,bonuses:m.mcWorld.mUpgrades.waveDraft.bonuses,features:m.mcWorld.mUpgrades.features})')));
 for(const state of result.initial){assert.equal(state.wave,3);assert(state.growth.every(p=>p.level>1));assert(state.features.includes('native-bosses-v1'));}
 assert.deepEqual(result.initial[0],result.initial[1]);
 const target=Math.max(...await Promise.all(games.map(g=>g.expr('m.mcWorld.mTick'))))+60;
 for(const peer of [H,C])await peer.page.evaluate(target=>{const w=window.__game.main().mcWorld,process=w.Process;w.Process=function(...args){if(this.mTick===target)this.mUpgrades.FinishTimedWave();return process.apply(this,args);};},target);
 await both('m.mcWorld.mUpgrades.timedWave.phase==="draft"');
 for(const [index,g]of games.entries())assert(await g.waitExpr(`typeof m.mcWorld._WaveDraftHud?._Player${index}?._Card0?.onRelease==="function"`));
 await games[0].clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');await games[0].clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');
 await both('m.mcWorld.mUpgrades.waveDraft.round.confirmed[0]&&!m.mcWorld.mUpgrades.waveDraft.round.confirmed[1]');
 await C.page.keyboard.press('KeyR');assert(await games[1].waitExpr('m.mcWorld._WaveDraftHud._Player1._Stats._visible&&m.mcWorld._WaveDraftHud._Clock.text.includes("PARTNER READY")'));
 assert(await games[0].expr('!m.mcWorld._WaveDraftHud._Player0._Stats._visible&&!m.mcWorld._WaveDraftHud._Player1'));
 assert(await games[1].expr('!m.mcWorld._WaveDraftHud._Player0'));
 await C.page.keyboard.press('Space');await both('!m.mcWorld.mUpgrades.waveDraft.round.confirmed[1]');
 await C.page.waitForTimeout(300);
 await both('m.mcWorld.mUpgrades.timedWave.phase==="draft"&&m.mcWorld.mUpgrades.waveDraft.round.confirmed[0]&&!m.mcWorld.mUpgrades.waveDraft.round.confirmed[1]');
 await games[1].shot(join(out,'lan-growth.png'),false);await games[0].shot(join(out,'host-ready.png'),false);
 result.client=await games[1].expr('(()=>{const d=m.mcWorld._WaveDraftHud,s=d._Player1._Stats,percent=m.mcWorld.mUpgrades.features.includes("percent-stats-v1");return {title:d._Player1._Status.text,partner:d._Clock.text,level:s._Value0.text,shield:s._Value2.text,weapon:s["_Value"+(percent?11:4)].text};})()');
 for(const g of games)assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(report.errors,[]);result.ok=true;
 writeFileSync(join(out,'readme-lan.json'),JSON.stringify(result,null,2));console.log('NORMAL PACKAGED README LAN PASSED');
}
