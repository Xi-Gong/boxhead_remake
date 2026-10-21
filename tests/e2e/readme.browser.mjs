// Current-build screenshots. Prepared normal-value scenes illustrate features, not balance/win rates.
import assert from 'node:assert/strict';
import {mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {join} from 'node:path';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out=process.env.README_OUT??`generated/reports/v034/readme-${Date.now()}`,dest='assets/readme';mkdirSync(out,{recursive:true});mkdirSync(dest,{recursive:true});
const browser=await launch(),report={ok:false,version:JSON.parse(readFileSync('package.json','utf8')).version,method:'Current production build, one headless 640x480 context at a time, real menu clicks, normal-value prepared UI scenes',images:[]};let g;
const save=async(name)=>{const file=join(out,name);await g.shot(file,false);copyFileSync(file,join(dest,name));report.images.push({name,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')});};
async function holdVisible(){
 assert(await g.waitExpr('(()=>{const w=m.mcWorld,players=Object.values(w.mThing_Collection.mPlayerThings).filter(p=>p.mLife>0);if(players.some(p=>p.mInvincible&&p.mInvincible%2))return false;w.Process=()=>{};w.Draw();return true;})()'));
 await g.page.waitForTimeout(150);
}
async function boot(mode='Single',wave=3){
 await g?.close();g=await openGame(browser);await toMainMenu(g);await g.page.waitForTimeout(700);
 if(mode==='Single'&&wave===3)await save('menu.png');await g.expr(`P.CSaveData.mSharedObject.data.mMaxWaveReached=25`);await g.clickClip(mode==='Single'?'m.mcScreen.mcSinglePlay':'m.mcScreen.mcCoopPlay');assert(await g.waitScreen('State_SelectWorld_'+mode,'Screen_SelectWorld'));
 const field=g.page.getByRole('textbox',{name:'Start wave'});await field.click();await g.page.keyboard.press('Control+A');await g.page.keyboard.type(String(wave));await g.page.keyboard.press('Enter');await g.click(210,400);
 // Committing/blurring the field can already start the authored map button; use a real coordinate click
 // rather than dereferencing a screen clip that may have been removed by that transition.
 await g.click(380,230);if(!await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded',5000)){await g.click(320,230);assert(await g.waitExpr('g.state()==="State_RunWorld"&&m.mcWorld?.mLoaded'));}await g.page.waitForTimeout(700);
}
try{
 await boot();await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=0;p.mArmor=20;w.mUpgrades.weaponBindings[0].A='uzi';const box=new P.Thing.Object.CThing_Object_SupplyCrate(p.mPosition.Clone(),'enchant','s'+w.mUpgrades.supplyState.nextId++);w.mThing_Collection.AddThing(box);box.Process_Init();});
 await g.page.waitForTimeout(3200);await holdVisible();report.combat=await g.expr('(()=>{const w=m.mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0],h=w.mHud.mcPlayers[0],t=h._WeaponBinding;return {visible:p.mVisible,weapon:p.mWeapon_Current.mNameID,binding:t.text,bounds:t.getBounds(m._parent),ammo:p.mWeapon_Current.mAmmo,durability:p.mWeapon_Current.mEnchantDurability};})()');assert(report.combat.visible);assert.equal(report.combat.binding,'A');await save('gameplay.png');
 const png=PNG.sync.read(readFileSync(join(out,'gameplay.png'))),bounds=report.combat.bounds;let ink=0;for(let y=Math.ceil(bounds.yMin);y<bounds.yMax;y++)for(let x=Math.ceil(bounds.xMin);x<Math.min(bounds.xMax,bounds.xMin+12);x++){const n=(y*png.width+x)*4;if(png.data[n]<100&&png.data[n+1]<100&&png.data[n+2]<100)ink++;}assert(ink>4,'the shortcut glyph must have visible ink');report.combat.glyphPixels=ink;
 await g.expr(`(()=>{const u=m.mcWorld.mUpgrades;u.FinishTimedWave();u.waveDraft.round.offers=[['health','armor','endurance']];})()`);assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));await g.page.waitForTimeout(300);await save('upgrade-cards.png');
 await boot('Single',25);assert(await g.waitExpr('m.mcWorld.mUpgrades.timedWave.boss.members.every(member=>member.id&&typeof m.mcWorld.mThing_Collection.mThings[member.id]?.mNativeBossAttackStep==="number")'));
 await holdVisible();
 await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,p=Object.values(w.mThing_Collection.mPlayerThings)[0];p.Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));w.TrackThing(p);w.mTrackPosition=p.mPosition.Clone();w.lTrackPosition=p.mPosition.Clone();w.mUpgrades.timedWave.boss.members.forEach((member,i)=>w.mThing_Collection.mThings[member.id].Move(new P.Thing.Math.CThing_Position(8.5+i*3,11.5,0)));w.Process=()=>{};w.Draw();});await g.page.waitForTimeout(150);await save('boss.png');
 await boot('Coop');
 await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,players=Object.values(w.mThing_Collection.mPlayerThings).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex);players[0].Move(new P.Thing.Math.CThing_Position(8.5,8.5,0));players[1].Move(new P.Thing.Math.CThing_Position(11.5,8.5,0));const p=players[0];p.NewWeapon('uzi');p.NewWeapon('shotgun');p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=24;p.mLife=0;w.LogKill(p);p.SetState('State_Dying');});
 assert(await g.waitExpr('Object.values(m.mcWorld.mThing_Collection.mThings).some(t=>t._CLASSID_==="CThing_Object_WeaponCrate"&&t.Process)'));await g.page.waitForTimeout(300);await holdVisible();await save('coop-crate.png');
 await boot('Coop');
 await g.eval(()=>{const P=window.__game.pkg,w=window.__game.main().mcWorld,players=Object.values(w.mThing_Collection.mPlayerThings).sort((a,b)=>a.mPlayerIndex-b.mPlayerIndex),p=players[0],q=players[1];
  p.Move(new P.Thing.Math.CThing_Position(10.5,8.5,0));q.Move(new P.Thing.Math.CThing_Position(13.5,8.5,0));p.SelectWeapon('uzi');p.mWeapon_Current.mAmmo=28;p.mArmor=20;q.SelectWeapon('shotgun');q.mWeapon_Current.mAmmo=12;w.mUpgrades.weaponBindings[0].A='uzi';w.mUpgrades.weaponBindings[1].Y='shotgun';const enchant=new P.Thing.Object.CThing_Object_SupplyCrate(p.mPosition.Clone(),'enchant','s'+w.mUpgrades.supplyState.nextId++);w.mThing_Collection.AddThing(enchant);enchant.Process_Init();
  for(const [i,kind]of ['medical','armor','enchant','ammo'].entries()){const box=new P.Thing.Object.CThing_Object_SupplyCrate(new P.Thing.Math.CThing_Position(8.5+i*2,11.5,0),kind,'s'+w.mUpgrades.supplyState.nextId++);w.mThing_Collection.AddThing(box);box.Process_Init();}
 });await g.page.waitForTimeout(200);await holdVisible();await save('devil-supplies.png');
 await g.expr(`(()=>{const u=m.mcWorld.mUpgrades;u.FinishTimedWave();u.waveDraft.round.offers=[['haste','health','endurance'],['damage','armor','scavenging']];})()`);assert(await g.waitExpr('m.mcWorld._WaveDraftHud?._visible'));await g.page.keyboard.press('Tab');assert(await g.waitExpr('m.mcWorld._WaveDraftHud._Player0._Stats._visible&&m.mcWorld._WaveDraftHud._Player1._Stats._visible'));await g.page.waitForTimeout(300);await save('coop-stats.png');
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log('README SCREENSHOTS PASSED '+out);
