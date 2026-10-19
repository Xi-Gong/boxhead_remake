import assert from 'node:assert/strict';
import {launch,openGame,toMainMenu} from './lib.mjs';
import {verifyPersistentEnchantment} from './persistent-enchantment.mjs';
const browser=await launch();let g;
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');
 assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.click(380,230);
 await verifyPersistentEnchantment(g,process.env.BOXHEAD_QA_OUT??'generated/reports/v030-rc2/browser');
 console.log('PERSISTENT ENCHANTMENT BROWSER PASSED');
}finally{await g?.close();await browser.close();}
