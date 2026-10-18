// Frozen pre-optimization algorithm and the candidate hash the exact same immutable snapshot.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHeadlessGame} from '../tests/sim/harness.ts';
import {explosionBurst} from '../tests/sim/explosionFixture.ts';
import {captureWorldSnap,makeSnapCtx} from '../src/game/local/Net/WorldSnap.ts';
import {simulationDigest as candidate} from '../src/game/local/Net/StateDigest.ts';
import {simulationDigest as baseline} from '../tests/fixtures/net/stateDigestLegacy.ts';
const game=createHeadlessGame({mode:'Coop',room:1}),world=game.world();explosionBurst(world,256);game.tick(5);
const snap=captureWorldSnap(world,makeSnapCtx(world),false),expected=baseline(snap),runs=[];
assert.deepEqual(candidate(snap),expected);
for(const impl of [baseline,candidate])for(let i=0;i<5;i++)impl(snap);
for(let round=1;round<=3;round++)for(const[kind,impl]of Object.entries({baseline,candidate})){
 globalThis.gc?.();const start=performance.now();let result;
 for(let i=0;i<30;i++)result=impl(snap);
 const ms=performance.now()-start;assert.deepEqual(result,expected);runs.push({round,kind,iterations:30,ms});
}
mkdirSync('generated/reports/v028',{recursive:true});writeFileSync('generated/reports/v028/digest-paired.json',JSON.stringify({node:process.version,things:Object.keys(snap.things).length,runs},null,2));
console.log(runs);game.quit();
