import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {pathToFileURL} from 'node:url';
import {launch,openGame,toMainMenu} from './lib.mjs';
export async function verifyBindingSpacing(g,out){
 mkdirSync(out,{recursive:true});const report={ok:false,cases:[],method:'Visible glyph pixel gaps in the actual Canvas2D render; prepared inventory, one 640x480 game'};
 try{
  assert(await g.waitExpr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];if(p.mInvincible&&p.mInvincible%2)return false;window.qaSpacingProcess=w.Process;w.Process=()=>{};w.Draw();return true;})()'));
  for(const [name,ammo,key]of [['pistol',999999,'A'],['uzi',0,'Y'],['shotgun',30,'A'],['railgun',999999,'Y']]){
   const bounds=await g.eval(({name,ammo,key})=>{const w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];if(name!=='pistol')p.NewWeapon(name);p.SelectWeapon(name);p.mWeapon_Current.mAmmo=ammo;w.mUpgrades.weaponBindings[0]={[key]:name};w.Draw();const h=w.mHud.mcPlayers[0],root=window.__game.main()._parent;return {ammo:h.mcAmmo.tfAmount.getBounds(root),letter:h._WeaponBinding.getBounds(root)};},{name,ammo,key});
   await g.page.waitForTimeout(150);const path=`${out}/${name}.png`;await g.shot(path,false);const png=PNG.sync.read(readFileSync(path));
   const top=Math.ceil(Math.max(bounds.ammo.yMin,bounds.letter.yMin)),bottom=Math.floor(Math.min(bounds.ammo.yMax,bounds.letter.yMax));
   const ink=x=>{for(let y=top;y<bottom;y++){const n=(y*png.width+x)*4;if(png.data[n]<110&&png.data[n+1]<110&&png.data[n+2]<110)return true;}return false;};
   let last=-1,first=-1;for(let x=Math.ceil(bounds.ammo.xMin);x<Math.floor(bounds.letter.xMin);x++)if(ink(x))last=x;
   for(let x=Math.ceil(bounds.letter.xMin);x<Math.min(bounds.letter.xMax,bounds.letter.xMin+12);x++)if(ink(x)){first=x;break;}
   const gap=first-last-1;report.cases.push({name,ammo,key,bounds,last,first,gap});assert(last>=0&&first>last,`${name} separate visible glyphs`);assert(gap>=1&&gap<=7,`${name} gap ${gap}px`);
  }
  assert.deepEqual(await g.scriptErrors(),[]);report.ok=true;
 }finally{await g.expr('(m.mcWorld.Process=window.qaSpacingProcess,delete window.qaSpacingProcess,true)').catch(()=>{});writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const out=process.env.BOXHEAD_QA_OUT??'generated/reports/v035/spacing-ui',browser=await launch();let g;
 try{g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));await g.page.waitForTimeout(700);await verifyBindingSpacing(g,out);console.log('BINDING GLYPH SPACING PASSED');}finally{await g?.close();await browser.close();}
}
