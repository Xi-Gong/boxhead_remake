// Prepared UI fixtures are separate from the input-only balance playtests.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.CANDIDATE_OUT??`generated/reports/v033/ui-${Date.now()}`;
mkdirSync(out,{recursive:true});const report={ok:false,method:'One headless 640x480 production browser, prepared draft fixture and real clicks/keys'};
const browser=await launch();let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);
 report.initial=await g.expr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.NewWeapon("uzi");p.SelectWeapon("uzi");p.mWeapon_Current.mPersistentEnchantment=true;p.mWeapon_Current.mEnchantedAmmo=p.mWeapon_Current.mAmmo;return {rule:w.mUpgrades.combat.rule,health:p.mMaxLife};})()');
 assert.equal(report.initial.rule,'combat-pve-v3');assert.equal(report.initial.health,160);
 await g.expr('(()=>{const w=m.mcWorld;w.mUpgrades.FinishTimedWave();w.mUpgrades.waveDraft.round.offers=[["health","armor","damage"]];})()');
 assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._Player0?._Card0?._Detail.text.includes("8%")'));
 await g.page.waitForTimeout(700);
 report.cards=await g.expr('m.mcWorld._WaveDraftHud._Player0._Card0._Preview.text+" | "+m.mcWorld._WaveDraftHud._Player0._Card1._Preview.text');
 assert.match(report.cards,/160.*173.*60.*64/);await g.shot(`${out}/cards.png`,false);
 await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible'));
 report.stats=await g.expr('Array.from({length:9},(_,i)=>[m.mcWorld._WaveDraftHud._Player0._Stats["_Name"+i].text,m.mcWorld._WaveDraftHud._Player0._Stats["_Value"+i].text])');
 assert.equal(report.stats[7][0],'SUPPLY EFFECT');assert.equal(report.stats[8][1],'ACTIVE  +15% DAMAGE');await g.shot(`${out}/stats.png`,false);
 await g.page.keyboard.press('Tab');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Card0');await g.clickClip('m.mcWorld._WaveDraftHud._Player0._Ready');
 assert(await g.waitExpr('m.mcWorld.mUpgrades.mLevelIndex===2'));assert.equal(await g.expr('Object.values(m.mcWorld.mThing_Collection.mPlayerThings)[0].mMaxLife'),173);
 await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.waitForTimeout(700);await g.shot(`${out}/pause.png`,false);
 assert.match(await g.expr('m.mcWorld.mHud.mcScreenPause._PersonalUpgrades._GrowthStats0.text'),/HP 173 \/ SHIELD 60/);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}catch(error){report.error=String(error);throw error;}
finally{await g?.close();await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
console.log('V033 CANDIDATE UI PASSED '+out);
