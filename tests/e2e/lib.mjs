// Lane X1: helpers for the browser UI suites (playwright-core + the installed Chrome, HEADLESS: never takes focus).
// The game runs from a production build served by `vite preview` (GAME_URL); window.__game (src/main.ts) exposes
// main() (the CMain clip) and state() for assertions. Stage coordinates are the 640x480 logical Flash stage.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const URL = process.env.GAME_URL ?? 'http://localhost:5311/';

export async function launch({ autoplay = true } = {}) {
  const args = ['--force-color-profile=srgb'];
  if (autoplay) args.push('--autoplay-policy=no-user-gesture-required');
  return chromium.launch({ channel: 'chrome', headless: true, args });
}

/** Open the game in a fresh context. `init` runs before any page script (e.g. to seed localStorage). */
export async function openGame(browser, { viewport = { width: 640, height: 480 }, init, initArg, query = '', storageState, deviceScaleFactor = 1 } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, storageState });
  if (init) await ctx.addInitScript(init, initArg);
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  await page.goto(URL + query);
  const g = new Game(page, ctx, log);
  await g.waitFor(() => window.__game && (window.__game.stage === 'audio' || window.__game.ready || window.__game.stage === 'failed'), null, 120000);
  if (!(await page.evaluate(() => window.__game.ready))) await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await g.waitFor(() => window.__game.ready || window.__game.stage === 'failed', null, 30000);
  return g;
}

export class Game {
  constructor(page, ctx, log) { this.page = page; this.ctx = ctx; this.log = log; }
  async close() { await this.ctx.close(); }
  eval(fn, arg) { return this.page.evaluate(fn, arg); }
  /** Evaluate an expression string with `m` = CMain._this, `g` = window.__game, `P` = package namespaces. */
  expr(code) { return this.page.evaluate((code) => { const g = window.__game; const m = g.main(); const P = g.pkg; return new Function('m', 'g', 'P', `return (${code});`)(m, g, P); }, code); }
  async waitFor(fn, arg, timeout = 30000) {
    try { await this.page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
  }
  async waitExpr(code, timeout = 30000) {
    return this.waitFor((code) => { try { const g = window.__game; const m = g.main(); const P = g.pkg; return !!new Function('m', 'g', 'P', `return (${code});`)(m, g, P); } catch { return false; } }, code, timeout);
  }
  state() { return this.page.evaluate(() => window.__game.state()); }
  async waitScreen(st, id, timeout = 30000) {
    return this.waitFor(([st, id]) => {
      const m = window.__game?.main?.();
      return window.__game?.state?.() === st && m?.mcScreen?.idScreen === id && m.mcScreen.mNormal === true;
    }, [st, id], timeout);
  }
  async canvasBox() {
    return this.page.evaluate(() => { const b = document.querySelector('canvas.game-canvas').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  }
  async stageToPage(x, y) {
    const r = await this.canvasBox();
    return [r.x + (x / 640) * r.w, r.y + (y / 480) * r.h];
  }
  async move(x, y) { const [px, py] = await this.stageToPage(x, y); await this.page.mouse.move(px, py, { steps: 2 }); }
  async click(x, y, { button = 'left' } = {}) {
    const [px, py] = await this.stageToPage(x, y);
    await this.page.mouse.move(px, py, { steps: 2 });
    await this.page.waitForTimeout(50);
    await this.page.mouse.down({ button });
    await this.page.waitForTimeout(50);
    await this.page.mouse.up({ button });
    await this.page.waitForTimeout(60);
  }
  /** Centre (stage coords) of a clip given by a JS path from CMain (`m....`); null if missing / empty. */
  centreOf(expr) {
    return this.page.evaluate((expr) => {
      const m = window.__game.main();
      const mc = new Function('m', `return ${expr};`)(m);
      if (!mc) return null;
      const root = m._parent;
      const b = mc.getBounds(root);
      if (!(b.xMax < 10000)) return null;
      return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2, w: b.xMax - b.xMin, h: b.yMax - b.yMin };
    }, expr);
  }
  async clickClip(expr) {
    const c = await this.centreOf(expr);
    if (!c) throw new Error(`no clip ${expr}`);
    await this.click(c.x, c.y);
    return c;
  }
  async shot(path, clip = true) {
    mkdirSync(dirname(path), { recursive: true });
    if (!clip) return this.page.screenshot({ path });
    const r = await this.canvasBox();
    return this.page.screenshot({ path, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
  }
  scriptErrors() { return this.page.evaluate(() => window.__game?.errors ?? []); }
}

/** Boot to the main menu (intro included). */
export async function toMainMenu(g, timeout = 90000) {
  if (!(await g.waitScreen('State_Main', 'Screen_Main', timeout))) throw new Error(`no main menu (state ${await g.state()})`);
}

export const MENU_Y = { Single: 226, Coop: 259, DeathMatch: 292, Instructions: 325 };
