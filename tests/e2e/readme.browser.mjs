// Current-build screenshots. Prepared normal-value scenes illustrate features, not balance/win rates.
import assert from 'node:assert/strict';
import {mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {launch,openGame,toMainMenu} from './lib.mjs';
import {verifyV034Candidate} from './v034-candidate.browser.mjs';
const out=process.env.README_OUT??`generated/reports/v034/readme-${Date.now()}`,dest='assets/readme';mkdirSync(out,{recursive:true});mkdirSync(dest,{recursive:true});
const browser=await launch(),report={ok:false,version:JSON.parse(readFileSync('package.json','utf8')).version,method:'Current production build, one headless 640x480 context at a time, real menu clicks, normal-value prepared UI scenes',images:[]};let g;
const save=async(name)=>{const file=join(out,name);await g.shot(file,false);copyFileSync(file,join(dest,name));report.images.push({name,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')});};
async function boot(mode='Single'){
 await g?.close();g=await openGame(browser);await toMainMenu(g);await g.page.waitForTimeout(700);
 if(mode==='Single')await save('menu.png');await g.clickClip(mode==='Single'?'m.mcScreen.mcSinglePlay':'m.mcScreen.mcCoopPlay');assert(await g.waitScreen('State_SelectWorld_'+mode,'Screen_SelectWorld'));
 await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button');if(!await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded',5000)){await g.clickClip('m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons._Button');assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));}await g.page.waitForTimeout(700);
}
try{
 await boot();await verifyV034Candidate(g,join(out,'single'));
 for(const [from,to]of [['gameplay.png','gameplay.png'],['cards.png','upgrade-cards.png'],['bosses.png','boss.png']]){copyFileSync(join(out,'single',from),join(dest,to));report.images.push({name:to,source:join('single',from),sha256:createHash('sha256').update(readFileSync(join(dest,to))).digest('hex')});}
 await boot('Coop');
 await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,players=Object.values(w.mThing_Collection.mPlayerThings).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex);players[0].Move(new P.Thing.Math.CThing_Position(8.5,8.5,0));players[1].Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));const p=players[0];p.NewWeapon('uzi');p.NewWeapon('shotgun');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=24;p.mLife=0;w.LogKill(p);p.SetState('State_Dying');});
 assert(await g.waitExpr('Object.values(m.mcWorld.mThing_Collection.mThings).some(t=>t._CLASSID_==="CThing_Object_WeaponCrate"&&t.Process)'));await g.page.waitForTimeout(300);await save('coop-crate.png');
 await boot('Coop');
 await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,players=Object.values(w.mThing_Collection.mPlayerThings).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex),p=players[0],q=players[1];
  p.Move(new P.Thing.Math.CThing_Position(10.5,8.5,0));q.Move(new P.Thing.Math.CThing_Position(13.5,8.5,0));p.NewWeapon('uzi');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=28;p.mWeapon_Current.mEnchantDurability=80;p.mWeapon_Current.mEnchantMaximum=120;p.mArmor=20;q.NewWeapon('shotgun');q.SelectWeapon('shotgun');q.mWeapon_Current.mAmmo=12;w.mUpgrades.weaponBindings[0].A='uzi';w.mUpgrades.weaponBindings[1].Y='shotgun';
  for(const [i,kind]of ['medical','armor','enchant','ammo'].entries()){const box=new P.Thing.Object.CThing_Object_SupplyCrate(new P.Thing.Math.CThing_Position(8.5+i*2,11.5,0),kind,'s'+w.mUpgrades.supplyState.nextId++);w.mThing_Collection.AddThing(box);box.Process_Init();}
 });await g.page.waitForTimeout(200);await save('devil-supplies.png');
 await g.expr(`(()=>{const u=m.mcWorld.mUpgrades;u.FinishTimedWave();u.waveDraft.round.offers=[['haste','health','endurance'],['damage','armor','scavenging']];})()`);assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible&&m.mcWorld._WaveDraftHud._Player1._Stats._visible'));await g.page.waitForTimeout(300);await save('coop-stats.png');
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log('README SCREENSHOTS PASSED '+out);
