// Gallery screenshots (lane E dev tool, not a unit test):
//   node tests/unit/swf-runtime/gallery-shots.ts [filter]
// Starts a Vite dev server, opens gallery.html deep links in the installed Chrome (playwright-core) and saves PNGs
// of the rendered symbol into generated/reports/gallery/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '../../..');
const out = resolve(root, 'generated/reports/gallery');
mkdirSync(out, { recursive: true });

interface Shot { name: string; q: string }
const shots: Shot[] = [
  { name: 'Screen_Main', q: 'id=Screen_Main&scale=1&bg=black' },
  { name: 'Screen_Main_2x', q: 'id=Screen_Main&scale=2&bg=black' },
  { name: 'Screen_Main_nofilters', q: 'id=Screen_Main&scale=1&filters=0&bg=black' },
  { name: 'Screen_SelectWorld', q: 'id=Screen_SelectWorld&scale=1&bg=black' },
  { name: 'SubScreen_Single', q: 'id=SubScreen_Single&scale=1&bg=black' },
  { name: 'SubScreen_Coop', q: 'id=SubScreen_Coop&scale=1&bg=black' },
  { name: 'LevelIcons_Single_f1', q: 'id=LevelIcons_Single&scale=1&bg=black' },
  { name: 'LevelIcons_Single_f7', q: 'id=LevelIcons_Single&frame=7&scale=1&bg=black' },
  { name: 'Screen_Debrief', q: 'id=Screen_Debrief&scale=1&bg=black' },
  { name: 'Screen_Debrief_Winner', q: 'id=Screen_Debrief_Winner&scale=1&bg=black' },
  { name: 'Screen_LoadingWorld', q: 'id=Screen_LoadingWorld&scale=1&bg=black' },
  { name: 'Screen_Intro', q: 'id=Screen_Intro&scale=1&bg=black' },
  { name: 'Logo_SeanCooper_f60', q: 'id=194&frame=60&scale=1&bg=black' },
  { name: 'Logo_SeanCooper_f200', q: 'id=194&frame=200&scale=1&bg=black' },
  { name: 'ROOM_Single_0001', q: 'id=ROOM_Single_0001&scale=1&bg=black' },
  { name: 'ROOM_Single_0008', q: 'id=ROOM_Single_0008&scale=1&bg=black&bounds=1' },
  { name: 'World', q: 'id=World&scale=1&bg=black&bounds=1' },
  { name: 'Piece.Wall1', q: 'id=Piece.Wall1&scale=2&bounds=1' },
  { name: 'Piece.Column', q: 'id=Piece.Column&scale=2' },
  { name: 'Object.Wall_f1', q: 'id=Object.Wall&scale=2' },
  { name: 'Object.Wall_f5', q: 'id=Object.Wall&frame=5&scale=2' },
  { name: 'Object.Barrel', q: 'id=Object.Barrel&scale=2' },
  { name: 'Object.Pickup', q: 'id=Object.Pickup&scale=2' },
  { name: 'Effect.Explosion_f3', q: 'id=Effect.Explosion&frame=3&scale=2&bg=black' },
  { name: 'Effect.Explosion_f8', q: 'id=Effect.Explosion&frame=8&scale=2&bg=black' },
  { name: 'Effect.Explosion_f14', q: 'id=Effect.Explosion&frame=14&scale=2&bg=black' },
  { name: 'Effect.BloodSplat', q: 'id=Effect.BloodSplat&scale=2' },
  { name: 'Pistol.MuzzleFlash', q: 'id=Pistol.MuzzleFlash&scale=4&bg=black' },
  { name: 'HUD.Player', q: 'id=HUD.Player&scale=2&bg=black' },
  { name: 'Hud.ScoreTotal', q: 'id=Hud.ScoreTotal&scale=1&bg=black' },
  { name: 'Hud.Message', q: 'id=Hud.Message&scale=1&bg=black' },
  { name: 'Hud_PlayerFrags', q: 'id=Hud_PlayerFrags&scale=1&bg=black' },
  { name: 'HUD.Paused', q: 'id=HUD.Paused&scale=1&bg=black' },
  { name: 'Head_Front_MC', q: 'id=Head_Front_MC&scale=4' },
  { name: 'Body_Front_MC', q: 'id=Body_Front_MC&scale=4' },
  { name: 'font_25_Calibri_bold', q: 'id=25&scale=1&bg=white' },
  { name: 'font_370_ArialRounded', q: 'id=370&scale=1&bg=white&text=PLAYER%201%20WINS%20%3CENTER%20NAME%3E' },
  { name: 'static_text_337_4x', q: 'id=337&scale=4&bg=white' },
  { name: 'static_text_337_1x', q: 'id=337&scale=1&bg=white' },
  { name: 'morph_610_f6', q: 'id=610&frame=6&scale=4&bg=black' },
  { name: 'morph_626_f8', q: 'id=626&frame=8&scale=2&bg=black' },
  { name: 'Effect.SmokeCloud_f5', q: 'id=Effect.SmokeCloud&frame=5&scale=2' },
  { name: 'Effect.RocketSmoke_f3', q: 'id=Effect.RocketSmoke&frame=3&scale=4' },
  { name: 'morph_20_f50', q: 'id=20&frame=50&scale=1&bg=black' },
  { name: 'static_text_28', q: 'id=28&scale=2&bg=black' },
  { name: 'mask_sprite_41_f50', q: 'id=41&frame=50&scale=2&bg=black' },
  { name: 'mask_sprite_520', q: 'id=520&scale=2&bg=black' },
];

const filter = process.argv[2];
const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const port = (server.httpServer?.address() as { port: number }).port;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let ok = 0;
try {
  for (const s of shots) {
    if (filter && !s.name.includes(filter)) continue;
    await page.goto(`http://localhost:${port}/gallery.html?${s.q}`);
    await page.waitForFunction(() => (window as any).__gallery?.ready === true || !!(window as any).__gallery?.error, null, { timeout: 60000 });
    const err = await page.evaluate(() => (window as any).__gallery?.error);
    if (err) { console.error(`${s.name}: ${err}`); continue; }
    const dataUrl = await page.evaluate(() => (document.getElementById('canvas') as HTMLCanvasElement).toDataURL('image/png'));
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    writeFileSync(resolve(out, `${s.name}.png`), png);
    const info = await page.locator('#stats').textContent();
    console.log(`${s.name.padEnd(28)} ${info}`);
    ok++;
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) console.error('page errors:\n' + [...new Set(errors)].join('\n'));
console.log(`${ok} screenshots -> ${out}`);
