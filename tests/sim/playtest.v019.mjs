// v0.1.9 visual acceptance playtest (deviations COOP_DEATH_WEAPON_CRATE + START_WAVE_SELECTOR): drives the REAL
// app through the real mouse path and screenshots every new surface for the zai vision MCP check (the release gate:
// "verify effects with the vision MCP, never by code-reading alone"). Also captures README screenshots.
//   npx vite build --outDir generated/qa-dist --emptyOutDir && npx vite preview --outDir generated/qa-dist --port 5198
//   node tests/sim/playtest.v019.mjs        (GAME_URL, default http://localhost:5198/)
// Exits non-zero on any failed step; screenshots land in generated/reports/qa/v019_*.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../generated/reports/qa');
mkdirSync(OUT, { recursive: true });
const URL = process.env.GAME_URL ?? 'http://localhost:5198/';
const MENU_Y = { Single: 226, Coop: 259, DeathMatch: 292 };

const report = { ok: false, steps: [], errors: [], shots: [] };
const step = (s) => { report.steps.push(s); console.log(s); };
const fail = (s) => { report.errors.push(s); console.error('FAIL: ' + s); };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.on('pageerror', (e) => fail('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') fail('console: ' + m.text().slice(0, 300)); });

const waitFor = async (fn, arg, timeout = 30000) => {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
};
const waitScreen = (st, id, timeout = 30000) => waitFor(([st, id]) => {
  const m = window.__game?.main?.();
  return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
}, [st, id], timeout);
const waitRunning = () => waitFor(() => window.__game?.state?.() === 'State_RunWorld' && window.__game.main().mcWorld?.mLoaded, null, 60000);
const stageToPage = async (x, y) => {
  const r = await page.evaluate(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  return [r.x + (x / 640) * r.w, r.y + (y / 480) * r.h];
};
const clickStage = async (x, y) => {
  const [px, py] = await stageToPage(x, y);
  await page.mouse.move(px, py);
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(60);
};
const centreOf = (expr) => page.evaluate((expr) => {
  const m = window.__game.main();
  const mc = new Function('m', `return ${expr};`)(m);
  if (!mc) return null;
  const b = mc.getBounds(m._parent);
  if (!(b.xMax < 10000)) return null;
  return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 };
}, expr);
const shot = async (name) => { const p = join(OUT, `v019_${name}.png`); await page.screenshot({ path: p }); report.shots.push(p); step('shot ' + p); };

// ---- boot -------------------------------------------------------------------------------------------
await page.goto(URL);
await waitFor(() => window.__game && (window.__game.stage === 'audio' || window.__game.ready || window.__game.stage === 'failed'), null, 120000);
if (!(await page.evaluate(() => window.__game.ready))) { await page.mouse.click(480, 360); step('clicked the audio-unlock overlay'); }
if (!(await waitFor(() => window.__game.ready, null, 30000))) { fail('app never became ready: ' + await page.evaluate(() => window.__game.stage)); }
if (!(await waitScreen('State_Main', 'Screen_Main', 60000))) { fail('no main menu'); await shot('boot_debug'); }
await page.waitForTimeout(500);
await shot('menu');

// ---- Single: the wave cycler on the level selection --------------------------------------------------
await clickStage(320, MENU_Y.Single);
if (!(await waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld'))) { fail('no Single level selection'); await shot('single_debug'); }
await page.waitForTimeout(400);
await shot('select_single_wave1');
const waveText = () => page.evaluate(() => window.__game.main().mcScreen.mcStartWave?.mcValue?.text);
if ((await waveText()) !== '1') fail('cycler default is not 1: ' + (await waveText()));

// 24 real clicks on the cycler's right arrow -> wave 25 (the arrow's own onRelease handler).
const arrow = await centreOf('m.mcScreen.mcStartWave.bRight');
if (!arrow) { fail('cycler right arrow not found on screen'); await shot('arrow_debug'); }
for (let i = 0; i < 24; i++) await clickStage(arrow.x, arrow.y);
if ((await waveText()) !== '25') fail('cycling to 25 failed: ' + (await waveText()));
await shot('select_single_wave25');

// Start the room (the level icon's own START button handler) and verify the run really begins at LEVEL 25 / x36
// (anchorInterp(25) = 30 + 5 * (20/15) = 36.67 -> 36: tiers up to x30 - uzi, shotgun, barrel, grenade, fakewall).
await page.evaluate(() => {
  const m = window.__game.main();
  const icons = m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons;
  icons._Button.onRelease.call(icons._Button);
});
if (!(await waitRunning())) fail('wave-25 room did not start');
const startState = await page.evaluate(() => {
  const w = window.__game.main().mcWorld;
  const p = w.mThing_Collection.mPlayerThings;
  const first = Object.values(p)[0];
  return { level: w.mUpgrades.mLevelIndex, mult: w.mUpgrades.mMultiplierIndex, weapons: first.mWeaponList.filter((x) => x.mActive).map((x) => x.mNameID) };
});
if (startState.level !== 25 || startState.mult !== 36) fail(`wave-25 start wrong: level ${startState.level} mult ${startState.mult}`);
const wantWeapons = 'pistol,uzi,shotgun,barrel,grenade,fakewall';
if (startState.weapons.join(',') !== wantWeapons) fail(`wave-25 loadout wrong (${startState.weapons.join(',')}), wanted ${wantWeapons}`);
step(`wave-25 run verified: level ${startState.level} mult ${startState.mult} weapons ${startState.weapons.join(',')}`);
await page.waitForTimeout(4200); // let wave 25's zombies spawn and reach the open floor (README gameplay shot)
const zombieState = await page.evaluate(() => {
  const w = window.__game.main().mcWorld;
  const counts = w.mThing_Collection.mThingCounters;
  const p = Object.values(w.mThing_Collection.mPlayerThings)[0];
  return { zombies: counts.CThing_Creature_Zombie ?? 0, tick: w.mTick, level: w.mUpgrades.mLevelIndex, px: p.mPosition.mX, py: p.mPosition.mY, life: p.mLife };
});
step(`wave-25 field after 4.2 s: ${JSON.stringify(zombieState)}`);
if (zombieState.zombies < 10) fail(`wave-25 spawned only ${zombieState.zombies} zombies in 4.2 s (sim: 51)`);
// Draw the horde on camera for the README shot: a few seconds of real movement + fire (the real keyboard path).
for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
  await page.keyboard.down(key);
  await page.keyboard.down('Slash');
  await page.waitForTimeout(1500);
  await page.keyboard.up(key);
  await page.keyboard.up('Slash');
}
await page.waitForTimeout(800);
await shot('ingame_wave25');
await page.keyboard.press('p');
await page.waitForTimeout(300);
await page.evaluate(() => { const w = window.__game.main().mcWorld; w.mHud.mcScreenPause?._Quit?.onRelease?.call(w.mHud.mcScreenPause._Quit); });
await waitFor(() => window.__game?.state?.() === 'State_Debrief', null, 30000);

// ---- Coop: the death crate ---------------------------------------------------------------------------
await page.evaluate(() => window.__game.main().SetState('State_SelectWorld_Coop'));
if (!(await waitScreen('State_SelectWorld_Coop', 'Screen_SelectWorld'))) fail('no Coop level selection');
await page.waitForTimeout(400);
await shot('select_coop');
const coopWave = await page.evaluate(() => window.__game.main().mcScreen.mcStartWave?.mcValue?.text);
if (coopWave !== '1') fail('coop cycler did not reset to 1: ' + coopWave);
await page.evaluate(() => {
  const m = window.__game.main();
  const icons = m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons;
  icons._Button.onRelease.call(icons._Button);
});
if (!(await waitRunning())) fail('coop room did not start');

// Deterministic crate scenario: p1 gets an uzi (13 rounds) + shotgun (2), dies for real; the crate lands on the
// death cell; p2 walks over it (teleport + one tick) and restores the loadout.
const setup = await page.evaluate(() => {
  const m = window.__game.main();
  const w = m.mcWorld;
  const P = window.__game.pkg.Thing.Math.CThing_Position;
  const [p1, p2] = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
  const grant = (p, name, ammo) => { p.NewWeapon(name); p.mWeapons[name].mThing.mAmmo = ammo; };
  grant(p1, 'uzi', 13);
  grant(p1, 'shotgun', 2);
  p1.SelectWeapon('uzi');
  // The teammate already holds the same guns with LESS ammo, so the pickup demonstrates best-of-both (13/2 kept).
  grant(p2, 'uzi', 5);
  grant(p2, 'shotgun', 1);
  const p2Spawn = p2.mPosition.Clone();
  // Move p2 to a free cell away from p1 so only the crate sits on the death cell.
  const cells = w.mMap.mCells;
  const SOLID = window.__game.pkg.World.Map.CMap_Cell.mCollide_StaticImpassable;
  let spot = null;
  outer: for (let cy = 0; cy < cells.length; cy++) {
    for (let cx = 0; cx < cells[cy].length; cx++) {
      if (cells[cy][cx].mCollide & SOLID) continue;
      if (Math.hypot(p1.mPosition.mX - (cx + 0.5), p1.mPosition.mY - (cy + 0.5)) >= 5
        && Math.hypot(p2.mPosition.mX - (cx + 0.5), p2.mPosition.mY - (cy + 0.5)) >= 5) { spot = { x: cx + 0.5, y: cy + 0.5 }; break outer; }
    }
  }
  p2.Move(new P(spot.x, spot.y, 0));
  const DEAD = window.__game.pkg.Thing.CThing.mFlag_DEAD;
  p1.mFlags |= DEAD;
  p1.SetState('State_Dying');
  return { p2Spawn: { x: p2Spawn.mX, y: p2Spawn.mY }, dead: p1.mFlags & DEAD };
});
await page.waitForTimeout(700); // the dying animation plays; the crate is already on the floor
await shot('crate_on_floor');
const crateInfo = await page.evaluate(() => {
  const w = window.__game.main().mcWorld;
  const crates = Object.values(w.mThing_Collection.mThings).filter((t) => t?._CLASSID_ === 'CThing_Object_WeaponCrate');
  return crates.map((c) => ({ x: c.mPosition.mX, y: c.mPosition.mY, payload: c.mPayload }));
});
if (crateInfo.length !== 1) fail('expected exactly one crate on the floor, got ' + crateInfo.length);
step('crate on the floor: ' + JSON.stringify(crateInfo[0]?.payload?.weapons));

// p2 picks it up: teleport onto the crate and run ticks until the collection processes it.
await page.evaluate(({ cx, cy }) => {
  const w = window.__game.main().mcWorld;
  const P = window.__game.pkg.Thing.Math.CThing_Position;
  const [p1, p2] = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
  p2.Move(new P(cx, cy, 0));
  p2.SelectWeapon('pistol');
}, { cx: crateInfo[0].x, cy: crateInfo[0].y });
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
  const w = window.__game.main().mcWorld;
  const [p1, p2] = Object.values(w.mThing_Collection.mPlayerThings).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex);
  const crates = Object.values(w.mThing_Collection.mThings).filter((t) => t?._CLASSID_ === 'CThing_Object_WeaponCrate');
  return {
    crates: crates.length,
    p2uzi: p2.mWeapons.uzi.mActive ? p2.mWeapons.uzi.mThing.mAmmo : null,
    p2shotgun: p2.mWeapons.shotgun.mActive ? p2.mWeapons.shotgun.mThing.mAmmo : null,
    p2current: p2.mWeapon_Current?.mNameID,
  };
});
if (after.crates !== 0) fail('crate not picked up (walk-over): ' + after.crates + ' left');
if (after.p2uzi !== 13 || after.p2shotgun !== 2) fail(`teammate restore wrong: uzi ${after.p2uzi} shotgun ${after.p2shotgun}`);
if (after.p2current !== 'uzi') fail('picker did not switch off the pistol: ' + after.p2current);
step(`crate picked up by the teammate: uzi ${after.p2uzi}, shotgun ${after.p2shotgun}, holding ${after.p2current}`);
await shot('crate_picked_hud');

// ---- Death Match: no cycler ---------------------------------------------------------------------------
await page.evaluate(() => window.__game.main().SetState('State_SelectWorld_DeathMatch'));
if (!(await waitScreen('State_SelectWorld_DeathMatch', 'Screen_SelectWorld'))) fail('no DeathMatch level selection');
await page.waitForTimeout(400);
await shot('select_dm');
const dmCycler = await page.evaluate(() => { const s = window.__game.main().mcScreen; return { exists: !!s.mcStartWave, visible: s.mcStartWave?._visible }; });
if (dmCycler.exists) fail('Death Match built a wave cycler: ' + JSON.stringify(dmCycler));

report.ok = report.errors.length === 0;
writeFileSync(join(OUT, 'v019_report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(report.ok ? 'v0.1.9 visual acceptance PASSED' : 'v0.1.9 visual acceptance FAILED');
process.exit(report.ok ? 0 : 1);
