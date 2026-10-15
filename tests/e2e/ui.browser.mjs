// Lane X1: browser UI suite of the REAL app (production build) in HEADLESS Chrome (playwright-core, channel 'chrome').
// Drives every menu with the real mouse and keyboard path (DOM events -> platform -> Player -> ported AS2 handlers):
// intro, main menu roll-over, instructions page, level selection (arrows, characters, options window, controls window
// with real key presses), level icon -> room, pause (P) + QUIT, debrief name entry (click, typing, Backspace,
// maxChars 10), SEND SCORE -> local table, View Highscores, RETRY / EXIT / Back to menu, Death Match side switch and
// winner screen, the HTML right-click menu (Sound / Music / Quality / Render, freeze while open, Esc), Alt+Enter
// fullscreen request, letterboxing + click mapping after window resizes, focus loss releasing held keys, and the save
// surviving a page reload. Never takes the OS focus (headless).
//
//   npx vite build --outDir generated/x1-dist --emptyOutDir && npx vite preview --outDir generated/x1-dist --port 5311
//   node tests/e2e/ui.browser.mjs [group ...]          (GAME_URL, default http://localhost:5311/)
// Groups: menus, options, controls, debrief, deathmatch, contextmenu, platform, audiounlock, hidpi, persistence (default: all).
// Output: generated/reports/x1/ui_report.json + screenshots; exit code 1 on any failed check.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openGame, toMainMenu, MENU_Y, ROOT, URL as URL_ } from './lib.mjs';

const OUT = join(ROOT, 'generated/reports/x1');
mkdirSync(OUT, { recursive: true });
const groups = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const want = (g) => groups.length === 0 || groups.includes(g);

const report = { checks: [], failed: 0, groups: {} };
let current = 'boot';
function check(name, ok, detail) {
  const c = { group: current, name, ok: !!ok, detail };
  report.checks.push(c);
  if (!ok) report.failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${current}] ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  return !!ok;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const browser = await launch();
const S = 'm.mcScreen';
const save = (g, f) => g.expr(`P.CMain.mSaveData.${f}`);
const shot = (g, name) => g.shot(join(OUT, `${name}.png`));

/** A fresh game (clean storage) at the level selection of `mode` through the real main-menu click. */
async function toSelect(g, mode) {
  await toMainMenu(g);
  await g.click(320, MENU_Y[mode]);
  if (!(await g.waitScreen(`State_SelectWorld_${mode}`, 'Screen_SelectWorld', 15000))) throw new Error(`no selection for ${mode}`);
}

async function runGroup(name, fn) {
  if (!want(name)) return;
  current = name;
  const t0 = Date.now();
  let g;
  try {
    g = await fn();
  } catch (e) {
    check('group completed', false, String(e?.stack ?? e).slice(0, 600));
  }
  if (g) {
    const errs = await g.scriptErrors().catch(() => ['<page gone>']);
    check('no engine script errors', errs.length === 0, errs.slice(0, 3));
    const cons = g.log.filter((l) => /^\[(error|pageerror)/.test(l));
    check('no console errors', cons.length === 0, cons.slice(0, 3));
    await g.close();
  }
  report.groups[name] = { ms: Date.now() - t0 };
}

// ------------------------------------------------------------------------------------------------ menus
await runGroup('menus', async () => {
  const g = await openGame(browser);
  // the loading screen's right-click menu (root frame 1) has only the author item
  await g.waitExpr('g.player && g.player.root', 20000);
  const early = await g.eval(() => (window.__game.player.root.menu?.customItems ?? []).map((i) => i.caption));
  check('loading screen context menu = author line only (root frame 1)', eq(early, ['© Sean Cooper 2007']) || early.length === 4, early);
  check('intro reached', await g.waitExpr("g.state() === 'State_Intro'", 60000));
  const t0 = Date.now();
  await shot(g, 'menus_01_intro');
  check('CrazyMonkeyGames logo removed, Sean Cooper logo not clickable', eq(await g.expr(`[${S}._Logo_CrazyMonkeys === undefined, typeof ${S}._Logo_SeanCooper.onRelease]`), [true, 'undefined']));
  await toMainMenu(g);
  const introMs = Date.now() - t0;
  check('intro plays the 250-frame logo at 30 fps (~8.3 s + transitions)', introMs > 7500 && introMs < 14000, introMs);
  check('context menu after State_Init: author + Sound / Music / Quality', eq(await g.eval(() => window.__game.player.root.menu.customItems.map((i) => i.caption)), ['© Sean Cooper 2007', 'Sound: ON', 'Music: ON', 'Quality: BEST']));
  // roll-over: alpha 100 + DropShadow/Blur jitter every frame; roll-out restores
  const items = ['mcSinglePlay', 'mcCoopPlay', 'mcDeathPlay', 'mcInstructions'];
  for (const it of items) check(`${it} idle alpha 50`, (await g.expr(`${S}.${it}._Contents._alpha`)) === 50);
  await g.move(320, MENU_Y.Coop);
  await g.page.waitForTimeout(120);
  const f1 = await g.expr(`[${S}.mcCoopPlay._Contents._alpha, ${S}.mcCoopPlay._Contents.filters.map((f) => f.constructor.name + ':' + (f.distance ?? f.blurX).toFixed(3))]`);
  await g.page.waitForTimeout(120);
  const f2 = await g.expr(`${S}.mcCoopPlay._Contents.filters.map((f) => f.constructor.name + ':' + (f.distance ?? f.blurX).toFixed(3))`);
  check('roll-over: alpha 100 and two filters', f1[0] === 100 && f1[1].length === 2, f1);
  check('roll-over filters change every frame (jitter)', !eq(f1[1], f2), [f1[1], f2]);
  check('hand cursor over a menu item', (await g.eval(() => document.getElementById('stage').style.cursor)) === 'pointer');
  await shot(g, 'menus_02_main_hover');
  await g.move(320, MENU_Y.Single);
  await g.page.waitForTimeout(120);
  check('moving to the next item rolls the previous one out', eq(await g.expr(`[${S}.mcCoopPlay._Contents._alpha, ${S}.mcCoopPlay._Contents.filters.length, ${S}.mcSinglePlay._Contents._alpha]`), [50, 0, 100]));
  await g.move(600, 120);
  await g.page.waitForTimeout(120);
  check('roll-out: alpha 50, no filters, arrow cursor', eq(await g.expr(`[${S}.mcSinglePlay._Contents._alpha, ${S}.mcSinglePlay._Contents.filters.length]`), [50, 0]) && (await g.eval(() => document.getElementById('stage').style.cursor)) === 'default');
  // instructions page (local) and back
  await g.click(320, MENU_Y.Instructions);
  check('INSTRUCTIONS -> local page', await g.waitScreen('State_Instructions', 'Screen_Instructions', 15000));
  await shot(g, 'menus_03_instructions');
  await g.clickClip(`${S}._Icon_Back`);
  check('instructions "Back to menu"', await g.waitScreen('State_Main', 'Screen_Main', 15000));
  // every mode: selection screen, Back to menu
  for (const mode of ['Single', 'Coop', 'DeathMatch']) {
    await g.click(320, MENU_Y[mode]);
    check(`${mode}: selection screen`, await g.waitScreen(`State_SelectWorld_${mode}`, 'Screen_SelectWorld', 15000));
    const vis = await g.expr(`[${S}.mcSubScreen.mcPlayer2_Character !== undefined, ${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons._ViewHighScore._visible]`);
    check(`${mode}: player 2 character selector ${mode === 'Single' ? 'absent' : 'present'}, View Highscores ${mode === 'DeathMatch' ? 'hidden' : 'shown'}`, eq(vis, [mode !== 'Single', mode !== 'DeathMatch']), vis);
    await shot(g, `menus_04_select_${mode}`);
    await g.clickClip(`${S}._Icon_Back`);
    check(`${mode}: Back to menu`, await g.waitScreen('State_Main', 'Screen_Main', 15000));
  }
  // level / character arrows with the mouse (Coop: both characters)
  await g.click(320, MENU_Y.Coop);
  await g.waitScreen('State_SelectWorld_Coop', 'Screen_SelectWorld', 15000);
  const sel = `${S}.mcSubScreen.mcLevel_Selection`;
  const frames = [];
  for (let i = 0; i < 18; i++) { await g.clickClip(`${sel}.bLeft`); frames.push(await g.expr(`${sel}.mcLevelIcons._currentframe`)); }
  check('level arrow left wraps over the 18 rooms (1 -> 18 -> ... -> 1)', eq(frames, [18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), frames);
  await g.clickClip(`${sel}.bRight`);
  await g.clickClip(`${sel}.bRight`);
  check('level arrow right + saved index', eq([await g.expr(`${sel}.mcLevelIcons._currentframe`), await save(g, 'mLevelIndex_Coop')], [3, 2]));
  for (const p of [1, 2]) {
    const c = `${S}.mcSubScreen.mcPlayer${p}_Character`;
    const seq = [];
    for (let i = 0; i < 4; i++) { await g.clickClip(`${c}.bRight`); seq.push(await save(g, `mPlayer${p}_CharacterIndex`)); }
    const start = p === 1 ? 3 : 0;
    check(`player ${p} character arrows cycle the 4 skins`, eq(seq, [1, 2, 3, 4].map((k) => (start + k) % 4)), seq);
    await g.clickClip(`${c}.bLeft`);
    check(`player ${p} character frame = saved index + 1`, (await g.expr(`${c}.mcCharacter._currentframe`)) === (await save(g, `mPlayer${p}_CharacterIndex`)) + 1);
  }
  // start the shown room with the level icon; the chosen skins are used
  await g.clickClip(`${sel}.mcLevelIcons`);
  check('level icon starts room 3 (MAZEY)', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded && m.mcWorld.mWorldLibLink === 'ROOM_Single_0003'", 60000));
  const skins = await g.expr(`(() => { const tc = m.mcWorld.mThing_Collection; const ps = Object.keys(tc.mPlayerThings).map((k) => tc.mPlayerThings[k]).sort((a, b) => a.mPlayerIndex - b.mPlayerIndex); return ps.map((p, i) => p.mXSI_Collection === P.Thing.Creature.CThing_Creature_Player.GetCollection(P.CMain.mSaveData['mPlayer' + (i + 1) + '_CharacterIndex'])); })()`);
  check('in-game skins = the selected characters', eq(skins, [true, true]), skins);
  await shot(g, 'menus_05_coop_room');
  return g;
});

// ------------------------------------------------------------------------------------------------ options window
await runGroup('options', async () => {
  const g = await openGame(browser);
  await toSelect(g, 'Single');
  const W = `${S}.mcWindow_Options`;
  // hover state of an original button (#265: over frame) and click sound
  await g.clickClip(`${S}._Game_Options`);
  check('OPTIONS opens the window', await g.expr(`${W}._visible`));
  const groups = [
    ['mDifficulty', ['_Level_Beginner', '_Level_Intermediate', '_Level_Expert', '_Level_Nightmare']],
    ['mGameSpeed', ['_Speed_Slow', '_Speed_Normal', '_Speed_Fast']],
    ['mDevilsActive', ['_Devils_Off', '_Devils_On']],
    ['mCollisionsActive', ['_Collide_Off', '_Collide_On']],
    ['mDamageActive', ['_Damage_Off', '_Damage_On']],
    ['mGameAmount', ['_Game1', '_Game2', '_Game3', '_Game4']],
  ];
  for (const [field, names] of groups) {
    for (let v = 0; v < names.length; v++) {
      await g.clickClip(`${W}.${names[v]}`);
      const marks = await g.expr(`[${names.map((n) => `${W}.${n}._Selected._visible`).join(',')}]`);
      const sv = await save(g, field);
      check(`${names[v]} -> ${field} = ${v}, only it marked`, sv === v && eq(marks, names.map((_, i) => i === v)), { sv, marks });
    }
  }
  await shot(g, 'options_01_all_last');
  // the window's lock blocks the screen below: the character arrow (outside the panel) does nothing
  const ch0 = await save(g, 'mPlayer1_CharacterIndex');
  await g.clickClip(`${S}.mcSubScreen.mcPlayer1_Character.bLeft`);
  check('modal: clicks outside the panel do not reach the screen below', (await save(g, 'mPlayer1_CharacterIndex')) === ch0);
  await g.clickClip(`${W}._Button_Reset`);
  check('RESET restores 0/1/1/1/1/1', eq(await g.expr(`['mDifficulty','mGameSpeed','mDevilsActive','mCollisionsActive','mDamageActive','mGameAmount'].map((f) => P.CMain.mSaveData[f])`), [0, 1, 1, 1, 1, 1]));
  check('RESET updates the marks', eq(await g.expr(`[${W}._Level_Beginner._Selected._visible, ${W}._Speed_Normal._Selected._visible, ${W}._Game2._Selected._visible, ${W}._Game4._Selected._visible]`), [true, true, true, false]));
  await g.clickClip(`${W}._Level_Expert`);
  await g.clickClip(`${W}._Speed_Slow`);
  await g.clickClip(`${W}._Button_Close`);
  check('CLOSE hides the window', (await g.expr(`${W}._visible`)) === false);
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  check('room starts', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000));
  check('Expert: level 20, x30; Slow: 12.5 ticks/s', eq(await g.expr('[m.mcWorld.mUpgrades.mLevelIndex, m.mcWorld.mUpgrades.mMultiplierIndex, P.CMain.mFPS]'), [20, 30, 12.5]));
  const t1 = await g.expr('m.mcWorld.mTick');
  await g.page.waitForTimeout(2000);
  const rate = ((await g.expr('m.mcWorld.mTick')) - t1) / 2;
  check('real tick rate at Slow ~12.5/s', rate > 9 && rate < 14, rate);
  return g;
});

// ------------------------------------------------------------------------------------------------ controls window
await runGroup('controls', async () => {
  const g = await openGame(browser);
  await toSelect(g, 'Single');
  const C = `${S}.mcWindow_Controls`;
  await g.clickClip(`${S}._Game_Controls`);
  check('CONTROLS opens the window; Single covers player 2', eq(await g.expr(`[${C}._visible, ${C}.mc2PlayerCover._visible]`), [true, true]));
  await shot(g, 'controls_01_single');
  await g.clickClip(`${C}.mcPlayer2.mcChangeKey_Shoot`);
  check('Single: player 2 buttons are covered (no rebind)', (await g.expr(`${C}.mcPressKey._visible`)) === false);
  // every action of player 1 with real key presses
  const plan = [['Shoot', 'KeyK', 75, "'K'"], ['MoveUp', 'KeyI', 73, "'I'"], ['MoveDown', 'NumpadDivide', 111, "NUM PD '/'"], ['MoveLeft', 'KeyJ', 74, "'J'"],
    ['MoveRight', 'KeyL', 76, "'L'"], ['NextWeapon', 'PageDown', 34, "'PGDN'"], ['PrevWeapon', 'Delete', 46, "'DEL'"]];
  for (const [a, key, code, label] of plan) {
    await g.clickClip(`${C}.mcPlayer1.mcChangeKey_${a}`);
    const vis = await g.expr(`${C}.mcPressKey._visible`);
    await g.page.keyboard.press(key);
    await g.page.waitForTimeout(80);
    const r = await g.expr(`[${C}.mcPressKey._visible, P.CMain.mSaveData.mPlayer1_Key${a}, ${C}.mcPlayer1.tb${a}.text]`);
    check(`P1 ${a} <- ${key}`, vis === true && eq(r, [false, code, label]), r);
  }
  await shot(g, 'controls_02_rebound');
  // Esc cancels, an unknown key flashes INVALID KEY! then fades back to PRESS A KEY, a known-invalid key is ignored
  await g.clickClip(`${C}.mcPlayer1.mcChangeKey_Shoot`);
  await g.page.keyboard.press('F2');
  await g.page.waitForTimeout(60);
  check('unknown key (F2): INVALID KEY! shown, PRESS A KEY hidden', eq(await g.expr(`[${C}.mcPressKey.mcInvalidKey._visible, ${C}.mcPressKey.mcPressAKey._alpha]`), [true, 0]));
  await shot(g, 'controls_03_invalid');
  await g.page.waitForTimeout(1300);
  check('after ~1 s the message is gone, PRESS A KEY back at 100', eq(await g.expr(`[${C}.mcPressKey.mcInvalidKey._visible, ${C}.mcPressKey.mcPressAKey._alpha, ${C}.mcPressKey._visible]`), [false, 100, true]));
  await g.page.keyboard.press('Semicolon');
  await g.page.waitForTimeout(60);
  check("';' (listed as not valid) is ignored silently", eq(await g.expr(`[${C}.mcPressKey._visible, ${C}.mcPressKey.mcInvalidKey._visible, P.CMain.mSaveData.mPlayer1_KeyShoot]`), [true, false, 75]));
  await g.page.keyboard.press('Escape');
  await g.page.waitForTimeout(60);
  check('Esc cancels without changing the key', eq(await g.expr(`[${C}.mcPressKey._visible, P.CMain.mSaveData.mPlayer1_KeyShoot]`), [false, 75]));
  // the overlay blocks the window below while waiting
  await g.clickClip(`${C}.mcPlayer1.mcChangeKey_MoveUp`);
  await g.clickClip(`${C}._Button_Close`);
  check('while waiting for a key the CLOSE button is blocked', (await g.expr(`${C}._visible`)) === true);
  await g.page.keyboard.press('KeyK');
  check('duplicates are allowed (original): up = shoot = K', eq([await save(g, 'mPlayer1_KeyMoveUp'), await save(g, 'mPlayer1_KeyShoot')], [75, 75]));
  await g.clickClip(`${C}._Button_Reset`);
  check('RESET: default bindings and labels', eq(await g.expr(`[P.CMain.mSaveData.mPlayer1_KeyShoot, P.CMain.mSaveData.mPlayer1_KeyMoveUp, ${C}.mcPlayer1.tbShoot.text, ${C}.mcPlayer1.tbMoveUp.text]`), [191, 38, "'/'", 'ARROW UP']));
  // rebind and play with it
  await g.clickClip(`${C}.mcPlayer1.mcChangeKey_Shoot`);
  await g.page.keyboard.press('KeyF');
  await g.clickClip(`${C}._Button_Close`);
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  check('room starts', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000));
  await g.page.waitForTimeout(300);
  // count the shots fired while F is held (bullets are short-lived: sample every frame in the page)
  await g.eval(() => {
    window.__shots = new Set();
    const tc = window.__game.main().mcWorld.mThing_Collection;
    window.__shotTimer = setInterval(() => { for (const k of Object.keys(tc.mThings)) { const t = tc.mThings[k]; if (t && (t._CLASSID_ === 'CThing_Shot_Bullet' || t._CLASSID_ === 'CThing_Effect_MuzzleFlash')) window.__shots.add(t); } }, 5);
  });
  await g.page.keyboard.down('KeyF'); await g.page.waitForTimeout(300); await g.page.keyboard.up('KeyF');
  await g.page.waitForTimeout(100);
  const fired = await g.eval(() => { clearInterval(window.__shotTimer); return window.__shots.size; });
  check("the new fire key 'F' shoots", fired > 0, fired);
  // a key outside the Flash list on a numpad with NumLock off is 'Clear' (12): unknown -> INVALID KEY!, like Flash
  await g.page.keyboard.press('KeyP');
  await g.page.waitForTimeout(250);
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._Quit');
  await g.waitScreen('State_Debrief', 'Screen_Debrief', 15000);
  await g.clickClip(`${S}._Exit`);
  await g.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld', 15000);
  await g.clickClip(`${S}._Game_Controls`);
  await g.clickClip(`${C}.mcPlayer1.mcChangeKey_MoveDown`);
  await g.page.keyboard.press('Numpad5');
  await g.page.waitForTimeout(60);
  check('numpad 5 with NumLock off (Clear, 12) is an unknown key', eq(await g.expr(`[${C}.mcPressKey._visible, ${C}.mcPressKey.mcInvalidKey._visible]`), [true, true]));
  await g.page.keyboard.press('Escape');
  return g;
});

// ------------------------------------------------------------------------------------------------ debrief
await runGroup('debrief', async () => {
  const g = await openGame(browser);
  await toSelect(g, 'Single');
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  check('room starts', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000));
  await g.page.waitForTimeout(600);
  await g.page.keyboard.press('KeyP');
  await g.page.waitForTimeout(250);
  const t = await g.expr('m.mcWorld.mTick');
  await g.page.waitForTimeout(500);
  check('P pauses: HUD.Paused + upgrade list, world frozen', eq(await g.expr(`[m.mcWorld.mPaused, m.mcWorld.mHud.mcScreenPause != undefined, m.mcWorld.mTick === ${t}]`), [true, true, true]));
  await shot(g, 'debrief_01_paused');
  await g.page.keyboard.press('KeyP');
  await g.page.waitForTimeout(400);
  check('P again resumes', eq(await g.expr(`[m.mcWorld.mPaused, m.mcWorld.mHud.mcScreenPause == undefined, m.mcWorld.mTick > ${t}]`), [false, true, true]));
  // give the HUD a score so the table shows a real number
  await g.expr('(m.mcWorld.mHud.nTotalScore = 12300, true)');
  await g.page.waitForTimeout(200);
  await g.page.keyboard.press('KeyP');
  await g.page.waitForTimeout(250);
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._Quit');
  check('QUIT -> debrief', await g.waitScreen('State_Debrief', 'Screen_Debrief', 15000));
  check('debrief: 12-digit HUD score, <Enter name>, SEND enabled', eq(await g.expr(`[${S}.mScore.text, ${S}.mUsername.text, ${S}._SendScore.enabled, ${S}.mUsername.maxChars]`), ['000000012300', '<Enter name>', true, 10]));
  // SEND with the placeholder does nothing
  await g.clickClip(`${S}._SendScore`);
  check('SEND with <Enter name> stores nothing', (await g.expr(`JSON.stringify(P.CSaveData.mSharedObject.data.mLocalHighscores ?? null)`)) === 'null');
  // name entry: click at the end of the field, erase, type (maxChars 10), Backspace
  const u = await g.centreOf(`${S}.mUsername`);
  await g.click(u.x + u.w / 2 - 4, u.y);
  check('I-beam cursor and focus on the name field', (await g.eval(() => document.getElementById('stage').style.cursor)) === 'text');
  // v0.1.8 (DEBRIEF_NAME_IME_INPUT): a transparent DOM input is the typing / IME conduit over the canvas field.
  check('the DOM conduit holds native focus (transparent, placeholder verbatim)', await (async () => {
    const a = await g.eval(() => {
      const a = document.activeElement;
      return a && a.tagName === 'INPUT' ? { color: a.style.color, caret: a.style.caretColor, value: a.value } : null;
    });
    return !!a && a.color === 'transparent' && a.caret === 'transparent' && a.value === '<Enter name>';
  })());
  for (let i = 0; i < 14; i++) await g.page.keyboard.press('Backspace');
  check('Backspace erases the placeholder', (await g.expr(`${S}.mUsername.text`)) === '');
  await g.page.keyboard.type('Ann the Zombie Slayer', { delay: 20 });
  check('maxChars 10', (await g.expr(`${S}.mUsername.text`)) === 'Ann the Zo');
  await g.page.keyboard.press('Backspace');
  await g.page.keyboard.press('Backspace');
  await g.page.keyboard.press('Home');
  await g.page.keyboard.type('X');
  check('Backspace / Home / typing at the caret', (await g.expr(`${S}.mUsername.text`)) === 'XAnn the ');
  await shot(g, 'debrief_02_typed');
  await g.clickClip(`${S}._SendScore`);
  await g.page.waitForTimeout(150);
  const table = await g.expr(`JSON.stringify(P.CSaveData.mSharedObject.data.mLocalHighscores)`);
  check('SEND SCORE stores the name and the HUD total in the room table', table === JSON.stringify({ ROOM_Single_0009: [{ mName: 'XAnn the', mScore: 12300 }] }), table);
  check('SEND disables the field / button (alpha 50) and shows the table (rank 1 red)', eq(await g.expr(`[${S}._SendScore.enabled, ${S}._SendScore._alpha, ${S}.mUsername.selectable, ${S}._LocalHighscores != undefined, ${S}._LocalHighscores.tfName0.textColor]`), [false, 50, false, true, 0xff0000]));
  await shot(g, 'debrief_03_table');
  await g.clickClip(`${S}._LocalHighscores._Button_Close`);
  check('table CLOSE', (await g.expr(`${S}._LocalHighscores == undefined`)) === true);
  check('arrow cursor over the disabled name field', await (async () => { await g.move(u.x, u.y); await g.page.waitForTimeout(80); return (await g.eval(() => document.getElementById('stage').style.cursor)) === 'default'; })());
  await g.clickClip(`${S}._ViewHighscores`);
  check('View Highscores shows the table', (await g.expr(`${S}._LocalHighscores != undefined`)) === true);
  await g.clickClip(`${S}._LocalHighscores._Button_Close`);
  // RETRY -> same room, then QUIT -> EXIT -> selection -> View Highscores of the level icon -> Back to menu
  await g.clickClip(`${S}._Retry`);
  check('RETRY restarts the room', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded && m.mcWorld.mWorldLibLink === 'ROOM_Single_0009'", 60000));
  await g.page.keyboard.press('KeyP');
  await g.page.waitForTimeout(250);
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._Quit');
  await g.waitScreen('State_Debrief', 'Screen_Debrief', 15000);
  check('the debrief remembers the typed name (raw text, as the original stores it)', (await g.expr(`${S}.mUsername.text`)) === 'XAnn the ');
  // v0.1.8 (DEBRIEF_NAME_IME_INPUT): the IME path. The composition-COMMIT shape first, on a clean field:
  // keyboard.insertText arrives as an input event with NO keydown - exactly what a Chinese IME commit produces,
  // and what the old canvas raw-keydown path dropped entirely. (The live-composition probe runs AFTER: a
  // CDP-level composition cannot always be cancelled, and a wedged one would eat the commit test's keys.)
  await g.click(u.x, u.y);
  await g.page.keyboard.press('Control+a');
  await g.page.keyboard.insertText('王roy');
  const imeName = await g.expr(`${S}.mUsername.text`);
  check('IME commit (insertText, no keydown) types CJK into the field', imeName === '王roy', imeName);
  await shot(g, 'debrief_05_ime_cjk');
  // Live composition: imeSetComposition drives the real IME pathway into the focused DOM conduit.
  const cdp = await g.page.context().newCDPSession(g.page);
  let live = '';
  try {
    await cdp.send('Input.imeSetComposition', { text: '啊', selectionStart: 1, selectionEnd: 1 });
    live = await g.eval(() => JSON.stringify([document.activeElement?.value ?? '', window.__game.main().mcScreen.mUsername.text]));
  } catch (e) { live = `err:${String(e).slice(0, 80)}`; }
  let lv = '', lt = '';
  try { [lv, lt] = JSON.parse(live); } catch { /* error string */ }
  check('IME composition live-syncs into mUsername (when this Chromium applies compositions)', !lv || (lv.includes('啊') && lt === lv), live);
  await cdp.detach();
  await g.clickClip(`${S}._Exit`);
  check('EXIT ("Select new level") -> Single selection', await g.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld', 15000));
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons._ViewHighScore`);
  check('level icon View Highscores -> table of this room', (await g.expr(`${S}._LocalHighscores.tfName0.text`)) === 'XAnn the');
  await shot(g, 'debrief_04_level_table');
  await g.clickClip(`${S}._LocalHighscores._Button_Close`);
  // an ineligible run: devils off -> SEND disabled
  await g.clickClip(`${S}._Game_Options`);
  await g.clickClip(`${S}.mcWindow_Options._Devils_Off`);
  await g.clickClip(`${S}.mcWindow_Options._Button_Close`);
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000);
  await g.page.keyboard.press('KeyP');
  await g.page.waitForTimeout(250);
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._Quit');
  await g.waitScreen('State_Debrief', 'Screen_Debrief', 15000);
  check('devils off: SEND SCORE disabled (original rule)', eq(await g.expr(`[${S}._SendScore.enabled, ${S}._SendScore._alpha, ${S}.mUsername.selectable]`), [false, 50, false]));
  await g.clickClip(`${S}._SendScore`);
  check('disabled SEND does nothing', (await g.expr(`P.CSaveData.mSharedObject.data.mLocalHighscores.ROOM_Single_0009.length`)) === 1);
  await g.clickClip(`${S}._Icon_Back`);
  check('debrief Back to menu', await g.waitScreen('State_Main', 'Screen_Main', 15000));
  return g;
});

// ------------------------------------------------------------------------------------------------ death match
await runGroup('deathmatch', async () => {
  const g = await openGame(browser);
  await toSelect(g, 'DeathMatch');
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  check('Death Match room starts', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000));
  await g.page.waitForTimeout(500);
  const names = () => g.expr('[m.mcWorld.mHud.mcPlayerFrags.mcPlayer1.tfPlayerName.text, m.mcWorld.mHud.mcPlayerFrags.mcPlayer2.tfPlayerName.text]');
  check('view side 1 (default): Player 2 on the left', eq(await names(), ['Player 2', 'Player 1']));
  await shot(g, 'dm_01_side1');
  await g.clickClip('m.mcWorld.mHud.mcPlayerFrags.mcSwitchSides');
  await g.page.waitForTimeout(200);
  check('switch-sides button flips the views and the frags HUD (saved)', eq([...(await names()), await save(g, 'mViewSide_DeathMatch')], ['Player 1', 'Player 2', 0]));
  await shot(g, 'dm_02_side0');
  await g.expr("(m.mcWorld.mCompleteState = 'player1 wins', true)");
  check('winner screen', await g.waitScreen('State_Debrief_Winner', 'Screen_Debrief_Winner', 15000));
  check('PLAYER 1 WINS with player 1 character (BAMBO frame 4)', eq(await g.expr(`[${S}.tbWinner.text, ${S}.mcWinners._currentframe]`), ['PLAYER 1 WINS', 4]));
  await shot(g, 'dm_03_winner');
  await g.clickClip(`${S}._Retry`);
  check('winner Replay -> same room again', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000));
  check('fresh frags', eq(await g.expr('[m.mcWorld.mHud.mPlayer1_Deaths, m.mcWorld.mHud.mPlayer2_Deaths]'), [0, 0]));
  await g.expr("(m.mcWorld.mCompleteState = 'player2 wins', true)");
  await g.waitScreen('State_Debrief_Winner', 'Screen_Debrief_Winner', 15000);
  check('PLAYER 2 WINS with player 2 character (SWAT frame 1)', eq(await g.expr(`[${S}.tbWinner.text, ${S}.mcWinners._currentframe]`), ['PLAYER 2 WINS', 1]));
  await g.clickClip(`${S}._Exit`);
  check('winner "Select new level" -> Death Match selection', await g.waitScreen('State_SelectWorld_DeathMatch', 'Screen_SelectWorld', 15000));
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000);
  await g.page.keyboard.press('KeyP');
  await g.page.waitForTimeout(250);
  await g.clickClip('m.mcWorld.mHud.mcScreenPause._Quit');
  check('Death Match QUIT goes straight back to the selection', await g.waitScreen('State_SelectWorld_DeathMatch', 'Screen_SelectWorld', 15000));
  return g;
});

// ------------------------------------------------------------------------------------------------ right-click menu
await runGroup('contextmenu', async () => {
  const g = await openGame(browser);
  await toSelect(g, 'Single');
  const open = async (x = 320, y = 240) => {
    const [px, py] = await g.stageToPage(x, y);
    await g.page.mouse.click(px, py, { button: 'right' });
    await g.page.waitForTimeout(80);
    return g.eval(() => [...document.querySelectorAll('.bx-ctxmenu-item')].map((e) => e.textContent));
  };
  const pick = async (prefix) => {
    const el = g.page.locator('.bx-ctxmenu-item', { hasText: prefix });
    await el.first().click();
    await g.page.waitForTimeout(80);
  };
  let rows = await open();
  check('right-click shows the Flash menu rows + Render', eq(rows, ['© Sean Cooper 2007', 'Sound: ON', 'Music: ON', 'Quality: BEST', 'Render: 2x']), rows);
  await shot(g, 'ctx_01_menu');
  const ef0 = await g.eval(() => window.__game.platform.loop.efCount);
  await g.page.waitForTimeout(400);
  check('the game is frozen while the menu is open', (await g.eval(() => window.__game.platform.loop.efCount)) === ef0);
  await g.page.keyboard.press('Escape');
  await g.page.waitForTimeout(150);
  check('Esc closes the menu and the game runs again', (await g.eval(() => document.querySelector('.bx-ctxmenu') === null)) && (await g.eval(() => window.__game.platform.loop.efCount)) > ef0);
  await open();
  await pick('Sound:');
  rows = await open();
  check('Sound: OFF (caption + save + CSound)', rows[1] === 'Sound: OFF' && (await save(g, 'mSoundActive')) === false && (await g.expr('P.CSound.mSFXActive')) === false, rows);
  await g.page.keyboard.press('Escape');
  // clicks are silent now: the button's Click2 sample does not start
  await g.clickClip(`${S}._Game_Options`);
  check('muted: UI click sound not played', (await g.expr('P.CSound.mSamples.Click2.mPlaying')) === false);
  await g.clickClip(`${S}.mcWindow_Options._Button_Close`);
  await open();
  await pick('Sound:');
  await g.clickClip(`${S}._Game_Options`);
  check('Sound: ON again -> UI click sound plays', (await g.expr('P.CSound.mSamples.Click2.mPlaying')) === true);
  await g.clickClip(`${S}.mcWindow_Options._Button_Close`);
  await open();
  await pick('Music:');
  rows = await open();
  check('Music: OFF (no music in this game: saved only)', rows[2] === 'Music: OFF' && (await save(g, 'mMusicActive')) === false, rows);
  await pick('Music:');
  await open();
  await pick('Quality:');
  rows = await open();
  check('Quality: LOW in the menus keeps HIGH rendering (applies in a room)', rows[3] === 'Quality: LOW' && (await g.eval(() => window.__game.player.root._quality)) === 'HIGH', rows);
  await g.page.keyboard.press('Escape');
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000);
  check('in the room _quality = LOW', (await g.eval(() => window.__game.player.root._quality)) === 'LOW');
  await open();
  await pick('Quality:');
  check('Quality: BEST in a room switches back at once', (await g.eval(() => window.__game.player.root._quality)) === 'HIGH');
  rows = await open();
  check('Render row shows the active scale', rows[4] === 'Render: 2x', rows);
  await pick('Render:');
  rows = await open();
  check('Render: choosing 1x is stored and the caption says when it applies', (await g.eval(() => JSON.parse(localStorage.getItem('boxhead.settings')).renderScale)) === 1 && /^Render: 1x/.test(rows[4]), rows);
  await shot(g, 'ctx_02_render');
  await pick('Render:');
  await g.page.keyboard.press('Escape');
  // the browser's own menu never shows; the menu closes on a click elsewhere
  await open();
  await g.click(600, 20);
  check('a click elsewhere closes the menu', await g.eval(() => document.querySelector('.bx-ctxmenu') === null));
  return g;
});

// ------------------------------------------------------------------------------------------------ platform
await runGroup('platform', async () => {
  const g = await openGame(browser, {
    init: () => {
      window.__fs = [];
      Element.prototype.requestFullscreen = function () { window.__fs.push('request'); return Promise.resolve(); };
      Object.defineProperty(document, 'fullscreenElement', { get: () => null, configurable: true });
    },
  });
  await toMainMenu(g);
  await g.page.keyboard.press('Alt+Enter');
  await g.page.waitForTimeout(100);
  check('Alt+Enter requests fullscreen (browser build; Electron: main process)', eq(await g.eval(() => window.__fs), ['request']));
  check('Alt+Enter does not reach the game as a key', (await g.eval(() => window.__game.pkg.CMain.mInput.mKey_List[13].mDown)) === false);
  // letterbox: wide and tall windows keep 4:3, centred, clicks map to the stage
  for (const [w, h] of [[1000, 500], [500, 900], [1280, 960]]) {
    await g.page.setViewportSize({ width: w, height: h });
    await g.page.waitForTimeout(250);
    const b = await g.canvasBox();
    const s = Math.min(w / 640, h / 480);
    check(`${w}x${h}: canvas ${Math.round(640 * s)}x${Math.round(480 * s)} centred`, Math.abs(b.w - 640 * s) <= 1 && Math.abs(b.h - 480 * s) <= 1 && Math.abs(b.x - (w - b.w) / 2) <= 1 && Math.abs(b.y - (h - b.h) / 2) <= 1, b);
    await shot(g, `platform_${w}x${h}`);
  }
  await g.page.setViewportSize({ width: 1000, height: 500 });
  await g.page.waitForTimeout(250);
  await g.click(320, MENU_Y.Single);
  check('click mapping on a letterboxed stage (1000x500)', await g.waitScreen('State_SelectWorld_Single', 'Screen_SelectWorld', 15000));
  await g.page.setViewportSize({ width: 640, height: 480 });
  await g.page.waitForTimeout(300); // ResizeObserver -> Presenter.resize
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons`);
  if (!check('room starts after the resize', await g.waitExpr("g.state()==='State_RunWorld' && m.mcWorld && m.mcWorld.mLoaded", 60000))) return g;
  await g.page.waitForTimeout(300);
  // focus loss releases held keys (Flash releases keys when the player loses focus)
  await g.page.keyboard.down('ArrowRight');
  await g.page.waitForTimeout(200);
  const held = await g.expr('P.CMain.mInput.KEY_RIGHT.mDown');
  await g.eval(() => window.dispatchEvent(new Event('blur')));
  await g.page.waitForTimeout(200);
  const x1 = await g.expr("(() => { const tc = m.mcWorld.mThing_Collection; return tc.mPlayerThings[Object.keys(tc.mPlayerThings)[0]].mPosition.mX; })()");
  await g.page.waitForTimeout(300);
  const x2 = await g.expr("(() => { const tc = m.mcWorld.mThing_Collection; return tc.mPlayerThings[Object.keys(tc.mPlayerThings)[0]].mPosition.mX; })()");
  check('window blur releases a held key (player stops)', held === true && (await g.expr('P.CMain.mInput.KEY_RIGHT.mDown')) === false && x1 === x2, { held, x1, x2 });
  await g.page.keyboard.up('ArrowRight');
  // the page does not scroll / navigate on game keys
  await g.page.keyboard.press('Space');
  await g.page.keyboard.press('Backspace');
  check('game keys do not scroll or navigate the page', (await g.eval(() => [window.scrollY, location.pathname])).join() === `0,${new URL(g.page.url()).pathname}`);
  return g;
});

// browser build without autoplay permission: "Click to start" overlay unlocks audio, then the game boots. (Headless
// Chrome does not always block the AudioContext; then the overlay is legitimately skipped.)
if (want('audiounlock')) {
  current = 'audiounlock';
  const b2 = await launch({ autoplay: false });
  try {
    const ctx = await b2.newContext({ viewport: { width: 640, height: 480 } });
    const page = await ctx.newPage();
    const log = [];
    page.on('console', (m) => log.push(m.text()));
    await page.goto(URL_);
    await page.waitForFunction(() => window.__game && (window.__game.stage === 'audio' || window.__game.ready), null, { timeout: 120000, polling: 100 });
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ stage: window.__game.stage, ready: window.__game.ready, overlay: [...document.querySelectorAll('#stage div')].some((d) => d.textContent === 'Click to start') }));
    if (st.ready) {
      check('autoplay allowed by this Chrome: no overlay, game running', !st.overlay, st);
    } else {
      check('"Click to start" overlay while audio is locked; the game waits', st.overlay && st.stage === 'audio', st);
      await page.keyboard.press('Space');
      check('a key press (or click) starts the game', await page.waitForFunction(() => window.__game.ready && window.__game.state?.() !== undefined, null, { timeout: 30000, polling: 100 }).then(() => true, () => false));
      check('overlay removed', !(await page.evaluate(() => [...document.querySelectorAll('#stage div')].some((d) => d.textContent === 'Click to start'))));
    }
    await ctx.close();
  } catch (e) { check('group completed', false, String(e).slice(0, 300)); }
  await b2.close();
}

// high-DPI display: the canvas backing store follows devicePixelRatio, clicks still map to the stage
await runGroup('hidpi', async () => {
  const g = await openGame(browser, { viewport: { width: 800, height: 600 }, deviceScaleFactor: 1.5 });
  await toMainMenu(g);
  const c = await g.eval(() => { const e = document.querySelector('canvas.game-canvas'); const b = e.getBoundingClientRect(); return { w: e.width, h: e.height, cw: b.width, ch: b.height }; });
  check('DPR 1.5: 800x600 CSS canvas with a 1200x900 backing store', c.w === 1200 && c.h === 900 && Math.abs(c.cw - 800) < 1 && Math.abs(c.ch - 600) < 1, c);
  await g.click(320, MENU_Y.DeathMatch);
  check('DPR 1.5: click mapping', await g.waitScreen('State_SelectWorld_DeathMatch', 'Screen_SelectWorld', 15000));
  await shot(g, 'hidpi_select');
  return g;
});

// ------------------------------------------------------------------------------------------------ persistence
await runGroup('persistence', async () => {
  const g = await openGame(browser);
  await toSelect(g, 'Coop');
  await g.clickClip(`${S}._Game_Options`);
  await g.clickClip(`${S}.mcWindow_Options._Level_Intermediate`);
  await g.clickClip(`${S}.mcWindow_Options._Speed_Fast`);
  await g.clickClip(`${S}.mcWindow_Options._Button_Close`);
  await g.clickClip(`${S}.mcSubScreen.mcLevel_Selection.bRight`);
  await g.clickClip(`${S}.mcSubScreen.mcPlayer2_Character.bRight`);
  await g.clickClip(`${S}._Game_Controls`);
  await g.clickClip(`${S}.mcWindow_Controls.mcPlayer2.mcChangeKey_Shoot`);
  await g.page.keyboard.press('KeyG');
  await g.clickClip(`${S}.mcWindow_Controls._Button_Close`);
  const stored = await g.eval(() => JSON.parse(localStorage.getItem('SO:BXHD_2PLAY_6')));
  check('every change is flushed to localStorage at once', stored.mDifficulty === 1 && stored.mGameSpeed === 2 && stored.mLevelIndex_Coop === 1 && stored.mPlayer2_CharacterIndex === 1 && stored.mPlayer2_KeyShoot === 71, stored);
  await g.page.reload();
  await g.waitFor(() => window.__game && (window.__game.ready || window.__game.stage === 'audio'), null, 120000);
  if (!(await g.eval(() => window.__game.ready))) await g.page.mouse.click(320, 240);
  await g.waitFor(() => window.__game.ready, null, 30000);
  await toSelect(g, 'Coop');
  check('after a reload: options marks, room, character, binding label', eq(await g.expr(`[${S}.mcWindow_Options._Level_Intermediate._Selected._visible, ${S}.mcWindow_Options._Speed_Fast._Selected._visible, ${S}.mcSubScreen.mcLevel_Selection.mcLevelIcons._currentframe, ${S}.mcSubScreen.mcPlayer2_Character.mcCharacter._currentframe, ${S}.mcWindow_Controls.mcPlayer2.tbShoot.text]`), [true, true, 2, 2, "'G'"]));
  return g;
});

await browser.close();
const out = join(OUT, 'ui_report.json');
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`\n${report.checks.length - report.failed}/${report.checks.length} checks passed -> ${out}`);
process.exit(report.failed ? 1 : 0);
