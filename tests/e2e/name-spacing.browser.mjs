// Focused render-only acceptance for the compact name/durability rows. No balance/stress run.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {PNG} from 'pngjs';
import {launch,openGame,toMainMenu} from './lib.mjs';
export async function verifyNameSpacing(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false,cases:[],method:'Single hidden/headless game; actual Canvas pixels, compact geometry and real menu/pause input; prepared ordinary inventory'};
 try{
  assert(await g.waitExpr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];if(p.mInvincible&&p.mInvincible%2)return false;window.qaNameProcess=w.Process;w.Process=()=>{};return true;})()'));
  for(const [width,height]of [[640,480],[960,540],[480,720]]){
   await g.page.setViewportSize({width,height});await g.page.waitForTimeout(100);
   for(const enchanted of [false,true,false]){
    const state=await g.eval(enchanted=>{const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mArmor=20;p.mWeapon_Current.mEnchantDurability=enchanted?60:0;w.mUpgrades.weaponBindings[0].A='uzi';w.Draw();const h=w.mHud.mcPlayers[0],root=window.__game.main()._parent;return {y:h.mcAmmo._y,ammo:h.mcAmmo.getBounds(h),life:h.mcLife.getBounds(h),armor:h._ArmorBar.getBounds(h),enchant:h._EnchantBar.getBounds(h),visible:h._EnchantBar._visible,rootLife:h.mcLife.getBounds(root),rootEnchant:h._EnchantBar.getBounds(root)};},enchanted);
    assert.deepEqual(state.armor,state.life);assert.equal(state.visible,enchanted);
    if(enchanted){assert(Math.abs(state.enchant.yMin-state.ammo.yMax-.5)<.001);assert(Math.abs(state.life.yMin-state.enchant.yMax-1)<.001);}else assert.equal(state.y,-65.9);
    const file=`${out}/${width}x${height}-${enchanted?'enchanted':'normal'}.png`;await g.page.waitForTimeout(100);await g.shot(file,false);
    const png=PNG.sync.read(readFileSync(file));let blue=0,purple=0;const scan=async(bounds,kind)=>{const a=await g.stageToPage(bounds.xMin,bounds.yMin),b=await g.stageToPage(bounds.xMax,bounds.yMax);for(let y=Math.floor(a[1]);y<Math.ceil(b[1]);y++)for(let x=Math.floor(a[0]);x<Math.ceil(b[0]);x++){const n=(y*png.width+x)*4,r=png.data[n],c=png.data[n+1],d=png.data[n+2];if(kind==='armor'&&d>r+50&&d>c+20)blue++;if(kind==='enchant'&&r>c+25&&d>c+25)purple++;}};
    await scan(state.rootLife,'armor');assert(blue>0);if(enchanted){await scan(state.rootEnchant,'enchant');assert(purple>0);}report.cases.push({width,height,enchanted,...state,blue,purple});
   }
  }
  await g.page.setViewportSize({width:640,height:480});await g.expr('(m.mcWorld.Process=window.qaNameProcess,delete window.qaNameProcess,true)');
  await g.page.keyboard.press('KeyP');assert(await g.waitExpr('m.mcWorld.mPaused'));await g.page.waitForTimeout(700);await g.page.keyboard.press('KeyP');assert(await g.waitExpr('!m.mcWorld.mPaused'));
  assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
 }finally{await g.expr('(()=>{if(window.qaNameProcess){m.mcWorld.Process=window.qaNameProcess;delete window.qaNameProcess;}return true;})()').catch(()=>{});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const browser=await launch();let g;try{g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await verifyNameSpacing(g,process.env.BOXHEAD_QA_OUT??'generated/reports/v035-name-spacing/browser');console.log('COMPACT NAME SPACING PASSED');}finally{await g?.close();await browser.close();}
}
