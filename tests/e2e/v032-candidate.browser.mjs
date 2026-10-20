// Production-browser preflight of the same current gameplay assertions used by the portable gate.
import assert from 'node:assert/strict';
import {launch,openGame,toMainMenu} from './lib.mjs';
import {verifyV032Candidate} from './v032-candidate.mjs';
const out=process.env.BOXHEAD_QA_OUT??`generated/reports/v032/candidate-browser-${Date.now()}`;
const browser=await launch();let g;
try{
 g=await openGame(browser);await toMainMenu(g);
 await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.click(320,230);assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));
 await g.page.waitForTimeout(700);await verifyV032Candidate(g,out);
 assert.deepEqual(g.log,[]);console.log('V032 CANDIDATE BROWSER PASSED '+out);
}finally{await g?.close();await browser.close();}
