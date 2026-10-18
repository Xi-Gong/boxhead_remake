// Real clicks enter LAN; controlled transport confirms kills. Socket timing has separate gates.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launch, openGame, toMainMenu } from './lib.mjs';
const out = 'generated/reports/v029/floating-scores'; mkdirSync(out, { recursive: true });
const browser = await launch(), report = { ok: false, samples: [], shots: [] }; let g;
try {
  g = await openGame(browser, { init: () => {
    const q = window.__scoreQA = {};
    window.boxheadDesktop = { isElectron: true, versions: {}, toggleFullscreen() {}, quit() {}, isFullscreen: async () => false,
      lan: { onHosts() {}, onPeer() {}, onMessage(cb) { q.message = cb; }, discoverStart: async () => ({ ok: true }),
        discoverStop() {}, hostSetStatus() {}, shutdown() {}, addresses: async () => [],
        send(m) { if (m.t === 'in') setTimeout(() => q.message({ t: 'in', tick: m.tick, bits: 0 }), 0); } } };
  } });
  await toMainMenu(g); await g.clickClip('m.mcScreen.mcLanGame'); assert(await g.waitScreen('State_LanLobby', 'Screen_LanLobby'));
  await g.eval(() => window.__scoreQA.message({ t: 'start', mode: 'Coop', roomLink: 'ROOM_Single_0001', seed: 4242,
    netcode: 'rollback-v2', inputDelay: 0, cfg: { progression: 'personal-growth-v1', difficulty: 0, gameSpeed: 1,
      devils: true, collisions: true, damage: true, gameAmount: 0, detail: true, charP1: 3, charP2: 0 } }));
  assert(await g.waitExpr('g.state()==="State_RunWorld" && m.mcWorld?._LanGrowthHud'));
  await g.eval(() => {
    const q = window.__scoreQA, w = window.__game.main().mcWorld;
    w.Spawn_Zombie = () => false; w.Spawn_Devil = () => false;
    for (const thing of Object.values(w.mThing_Collection.mThings)) if (['CThing_Creature_Zombie','CThing_Creature_Devil'].includes(thing._CLASSID_)) thing.Delete();
    w.mHud.mSilentMessages = true; w.mHud.mMessages = [];
    const draw = w.mHud.DrawBMObject, ids = new WeakMap(); let next = 0;
    w.mHud.DrawBMObject = function(bm,p,alpha) {
      if (!ids.has(bm)) ids.set(bm, next++);
      if (q.rows) q.rows.push({ id: ids.get(bm), at: performance.now(), x: p.x + bm.mDisp.x + bm.sBMD.width / 2,
        y: p.y + bm.mDisp.y + bm.sBMD.height / 2, alpha });
      return draw.call(this,bm,p,alpha);
    };
    const process = w.Process;
    w.Process = function() {
      if (q.kill) {
        q.kill = false; q.rows = [];
        const P = window.__game.pkg;
        for (const player of Object.values(this.mThing_Collection.mPlayerThings)) {
          const owner = player.mPlayerIndex;
          this.mUpgrades.lanGrowth.players[owner].level = owner ? 84 : 85;
          const victim = new P.Thing.Creature.CThing_Creature_Zombie(player.mPosition.Clone(), player.mAngle.Clone());
          this.mThing_Collection.AddThing(victim); victim.Process_Init(); victim.mLife = 0; victim.lanFatalSlot = owner;
          this.mUpgrades.__set__mZombieCount(this.mUpgrades.__get__mZombieCount()+1);
          this.LogKill(victim); victim.Delete();
        }
      }
      return process.call(this);
    };
  });
  for (const [width,height] of [[640,480],[960,720],[1280,720],[640,889]]) {
    await g.page.setViewportSize({width,height}); await g.page.waitForTimeout(750);
    await g.eval(() => { window.__scoreQA.kill = true; });
    assert(await g.waitExpr('window.__scoreQA.rows?.length >= 2'));
    await g.page.waitForTimeout(160);
    const file = `${out}/${width}x${height}.png`; await g.shot(file,false); report.shots.push(file);
    const png = PNG.sync.read(readFileSync(file)); assert.equal(png.width,width); assert.equal(png.height,height);
    const pixels = await g.eval(() => {
      const w=window.__game.main().mcWorld,r=window.__game.platform.presenter.canvas.getBoundingClientRect();
      return { rows:window.__scoreQA.rows.slice(-2),left:r.left,top:r.top,scale:r.width/w.mScreenSize.x };
    });
    for (const row of pixels.rows) {
      let white=0,black=0; const x=pixels.left+row.x*pixels.scale,y=pixels.top+row.y*pixels.scale;
      for(let py=Math.max(0,Math.floor(y-20*pixels.scale));py<Math.min(height,y+20*pixels.scale);py++)
        for(let px=Math.max(0,Math.floor(x-40*pixels.scale));px<Math.min(width,x+40*pixels.scale);px++){
          const n=(py*width+px)*4, rgb=[png.data[n],png.data[n+1],png.data[n+2]];
          if(Math.min(...rgb)>240)white++; if(Math.max(...rgb)<30)black++;
        }
      assert(white>=5&&black>=5,'authored score glyphs and outline must be visible near the rendered flight');
    }
    await g.page.waitForTimeout(1000);
    const sample = await g.eval(() => {
      const w = window.__game.main().mcWorld, h = w._LanGrowthHud;
      return { rows: window.__scoreQA.rows, targets: [h._Player0._Score,h._Player1._Score].map(t => {
        const b = t.getBounds(w); return {x:(b.xMin+b.xMax)/2,y:(b.yMin+b.yMax)/2};
      }), legacyFlights: w.mHud.mScores.length };
    });
    assert.equal(sample.legacyFlights,0);
    const ids = [...new Set(sample.rows.map(r=>r.id))]; assert.equal(ids.length,2);
    const destinations = [];
    for (const id of ids) {
      const rows = sample.rows.filter(r=>r.id===id), first=rows[0], last=rows.at(-1);
      assert(rows.length>=10); assert(last.at-first.at>=800 && last.at-first.at<1000);
      const distances=sample.targets.map(t=>Math.hypot(t.x-last.x,t.y-last.y));
      assert(Math.min(...distances)<5); destinations.push(distances[0]<distances[1]?0:1);
      for(let n=1;n<rows.length;n++) assert(rows[n].y<=rows[n-1].y+.01,'display must not rewind');
    }
    assert.deepEqual(destinations.sort(),[0,1]); report.samples.push({width,height,...sample});
  }
  assert.deepEqual(await g.expr('g.errors'),[]); assert.deepEqual(g.log,[]); report.ok=true;
} finally {
  writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)); await g?.close(); await browser.close();
}
console.log('FLOATING SCORES PASSED');
