// Real browser regression: badge refresh must preserve the pad buttons' hit targets.
import assert from 'node:assert/strict';
import { launch, openGame, toMainMenu } from './lib.mjs';
const browser = await launch();
try {
  const g = await openGame(browser, { init: () => {
    navigator.getGamepads = () => [{ index: 0, connected: true, id: 'QA controller', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }, null];
  }});
  await toMainMenu(g);
  await g.clickClip('m.mcScreen.mcCoopPlay');
  assert.ok(await g.waitScreen('State_SelectWorld_Coop', 'Screen_SelectWorld'));
  const pad = g.page.locator('button').filter({ hasText: /^PAD 1/ });
  await pad.waitFor();
  assert.equal(await pad.evaluate(el => getComputedStyle(el).pointerEvents), 'auto', 'pad chip must receive actual pointer clicks after refresh');
  const before = await pad.textContent();
  await pad.click();
  await g.page.waitForTimeout(500);
  console.log('badge', await pad.textContent(), await g.expr('P.World.CWorld.mGameMode'));
  await g.page.waitForFunction(before => [...document.querySelectorAll('button')].some(b => b.textContent.startsWith('PAD 1') && b.textContent !== before), before);
  await pad.click();
  await g.page.waitForTimeout(500);
  console.log('badge', await pad.textContent(), await g.expr('P.World.CWorld.mGameMode'));
  await g.page.waitForFunction(before => [...document.querySelectorAll('button')].some(b => b.textContent === before), before);
  assert.deepEqual(await g.scriptErrors(), []);
  await g.close();
  console.log('PASS: real pad-chip clicks swap assignments in both directions after badge refresh');
} finally { await browser.close(); }
