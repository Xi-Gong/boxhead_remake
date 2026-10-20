import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {launch,openGame,toMainMenu} from './lib.mjs';
const out='generated/reports/v032/gunner-'+Date.now();mkdirSync(out,{recursive:true});
const browser=await launch();let g;const report={ok:false,method:'Single 640x480 production browser, prepared four-skin scene and all gun/direction sheets'};
try{
 g=await openGame(browser);await toMainMenu(g);await g.clickClip('m.mcScreen.mcSinglePlay');assert(await g.waitScreen('State_SelectWorld_Single','Screen_SelectWorld'));
 await g.expr('(P.CMain.mSaveData.mLevelIndex_Single=0,m.mcScreen.mcSubScreen.mcLevel_Selection.mcLevelIcons.gotoAndStop(1),m.mcScreen.ChangeLevel(m.mcScreen.mcSubScreen.mcLevel_Selection,0))');
 await g.click(320,230);assert(await g.waitExpr('m.mcWorld?.mLoaded&&g.state()==="State_RunWorld"'));await g.page.waitForTimeout(700);
 const art=await g.eval(()=>{
  const P=window.__game.pkg,w=window.__game.main().mcWorld,at=(x,y)=>new P.Thing.Math.CThing_Position(x,y,0),p=Object.values(w.mThing_Collection.mPlayerThings)[0],enemies=[];
  w.mPaused=true;p.Move(at(10.5,8.5));p.mInvincible=0;p.mAlpha=100;
  const canvas=document.createElement('canvas');canvas.width=1150;canvas.height=12*85;const ctx=canvas.getContext('2d');ctx.fillStyle='#e7e2d9';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#242a2c';ctx.font='12px Arial';
  const metrics=[];
  for(let skin=0;skin<4;skin++){
   const e=new P.Thing.Creature.CThing_Creature_Zombie(at(6.5,5.5+skin*2));e.mCombatKind='gunner';e.mGunnerSkin=skin;e.mGunnerWeapon=['pistol','uzi','shotgun','pistol'][skin];w.mThing_Collection.AddThing(e);e.Process_Init();e.SetState('State_GotoPlayer');e.mCombatAimX=1;e.mCombatAimY=0;e.mCombatAimRange=4;e.SetState('State_CombatAim');enemies.push(e);
   const set=e.mXSI_Animation.mCollection;
   for(const [i,gun]of ['pistol','uzi','shotgun'].entries()){
    const row=skin*3+i,a=set.mItems[gun+'stand'].mAnimationObject;ctx.fillText('skin '+skin+' / '+gun,4,row*85+20);
    for(let d=0;d<16;d++){const f=a.mDirections[a.mLookup256[d*16]].mFrames[0];if(!f.sBMD)throw Error('not prebaked');ctx.drawImage(f.sBMD.toImageSource(),110+d*64+f.mDisp.x,row*85+72+f.mDisp.y,f.sBMD.width,f.sBMD.height);}
   }metrics.push({skin,hp:e.mMaxLife,gun:e.mGunnerWeapon,frames:set.mItems.walk.mAnimationObject.mFrameCount});
  }
  window.__gunnerQA=enemies;w.mPaused=false;w.Draw();w.mPaused=true;return {image:canvas.toDataURL(),metrics};
 });
 writeFileSync(out+'/all-skins-guns-directions.png',Buffer.from(art.image.split(',')[1],'base64'));report.metrics=art.metrics;assert(art.metrics.every(m=>m.hp===225&&m.frames===8));
 await g.page.waitForTimeout(100);await g.shot(out+'/aim-lines.png',false);
 report.bullets=await g.eval(()=>{const w=window.__game.main().mcWorld,e=window.__gunnerQA[1];for(let i=0;i<15;i++)e.State_CombatAim();const shots=Object.values(w.mThing_Collection.mThings).filter(t=>t._CLASSID_==='CThing_Shot_EnemyBullet'&&t.Process);for(const s of shots)s.Process_Init();w.mPaused=false;w.Draw();w.mPaused=true;return shots.map(s=>({speed:s.mDelta.__get__mLength(),life:s.mCombatBulletLife}));});
 assert.equal(report.bullets.length,1);assert(report.bullets[0].speed<.3);await g.page.waitForTimeout(100);await g.shot(out+'/projectile.png',false);
 assert.deepEqual(await g.scriptErrors(),[]);assert.deepEqual(g.log,[]);report.ok=true;
}finally{await g?.close();await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
console.log('GUNNER PASSED '+out);
