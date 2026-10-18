import {expect,it} from 'vitest';
import {createHeadlessGame} from './harness.ts';
import {CMain,Thing} from '../../src/game/packages.ts';
import {ARMOR_MAX,armorValue,CThing_Object_SupplyCrate,refillArmor,suppliesEnabled} from '../../src/game/local/Supplies.ts';
import {capture,applyToWorld} from '../../src/game/local/Resume.ts';
import {captureWorldSnap,makeSnapCtx,restoreWorldSnap} from '../../src/game/local/Net/WorldSnap.ts';
import {getRandomState,setRandomState} from '../../src/engine/flash/rng.ts';
import {random} from '../../src/engine/runtime.ts';

it('absorbs damage first, spills only excess into health, and never heals on armor pickup',()=>{
  const g=createHeadlessGame({mode:'Single',room:1}),p=g.players()[0],w=g.world();expect(suppliesEnabled(w)).toBe(true);
  p.mLife=137;refillArmor(p);
  new Thing.Affect.CThing_Affect_Bullet(p,p,30,p.mAngle).AffectThing(p);
  expect(p.mArmor).toBe(70);expect(p.mLife).toBe(137);
  new Thing.Affect.CThing_Affect_Bullet(p,p,100,p.mAngle).AffectThing(p);
  expect(p.mArmor).toBe(0);expect(p.mLife).toBe(107);
  for(const armor of [0,25,100]){p.mArmor=armor;refillArmor(p);expect(p.mArmor).toBe(ARMOR_MAX);expect(p.mLife).toBe(107);}
  g.quit();
});

it('keeps original health regeneration at the same rate while armor is full, partial, empty or refilled',()=>{
  const g=createHeadlessGame({mode:'Single',room:1}),p=g.players()[0];
  const step=p.mMaxLife/(CMain.mFPS*30);
  for(const amount of [undefined,0,45,100]){
    p.mArmor=amount;p.mLife=137;
    for(let n=0;n<20;n++)p.State_PlayerControl();
    expect(p.mLife).toBeCloseTo(137+20*step,10);expect(p.mArmor).toBe(amount);
  }
  p.mLife=137;p.mArmor=10;refillArmor(p);p.State_PlayerControl();
  expect(p.mLife).toBeCloseTo(137+step,10);expect(p.mArmor).toBe(100);
  p.mLife=199.99;p.State_PlayerControl();expect(p.mLife).toBe(200);g.quit();
});

it('uses actual explosion falloff and preserves the original hit return values',()=>{
  const g=createHeadlessGame({mode:'Single',room:1}),p=g.players()[0];p.mLife=100;refillArmor(p);
  const affector={mPosition:p.mPosition.Add(new Thing.Math.CThing_Position(2,0,0))};
  expect(new Thing.Affect.CThing_Affect_Explosion(p,affector,40,2).AffectThing(p)).toBe(20);
  expect(p.mArmor).toBe(80);expect(p.mLife).toBe(100);
  for(const affect of [new Thing.Affect.CThing_Affect_FireBall(p,p,10),new Thing.Affect.CThing_Affect_ZombieAttack(p,10),new Thing.Affect.CThing_Affect_DevilAttack(p,p,10)]){
    expect(affect.AffectThing(p)).toBe(10);
  }
  expect(p.mArmor).toBe(50);expect(p.mLife).toBe(100);g.quit();
});

it('picks armor up once without changing health and overlays the original life bar geometry',()=>{
  const g=createHeadlessGame({mode:'Single',room:1}),w=g.world(),p=g.players()[0];p.mLife=73;
  const crate=w.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(p.mPosition.Clone()));
  crate.Process_DeleteCounter_Init();crate.PickedUp();expect(p.mArmor).toBe(100);expect(p.mLife).toBe(73);
  p.mArmor=17;crate.PickedUp();expect(p.mArmor).toBe(17);
  w.mHud.UpdatePlayer(p,{x:320,y:240});const head=w.mHud.mcPlayers[0];
  expect(head.mcLife._visible).toBe(true);expect(head._ArmorBar._visible).toBe(true);
  expect(head._ArmorBar.getBounds(head)).toEqual(head.mcLife.getBounds(head));
  p.mArmor=100;w.mHud.UpdatePlayer(p,{x:320,y:240});
  const width=()=>{const b=head._ArmorBar.getInstanceAtDepth(3).getBounds(head._ArmorBar);return b.xMax-b.xMin;};
  const full=width();p.mArmor=60;w.mHud.UpdatePlayer(p,{x:320,y:240});expect(width()).toBeLessThan(full*.65);
  p.mArmor=45;w.mHud.UpdatePlayer(p,{x:320,y:240});expect(width()).toBeLessThan(full*.5);
  p.mArmor=0;w.mHud.UpdatePlayer(p,{x:320,y:240});expect(head.mcLife._visible).toBe(true);expect(head._ArmorBar._visible).toBe(false);g.quit();
});

it('restores armor in rollback and v2 saves while old v2 saves start without armor',()=>{
  const g=createHeadlessGame({mode:'Single',room:1}),w=g.world(),p=g.players()[0];p.mLife=77;p.mArmor=63;
  const ctx=makeSnapCtx(w),data=captureWorldSnap(w,ctx,false),slot={tRel:0,data,instances:ctx.instances,sharedObjs:ctx.sharedObjs};
  p.mArmor=0;p.mLife=4;restoreWorldSnap(w,slot,ctx);expect(p.mArmor).toBe(63);expect(p.mLife).toBe(77);
  const snap=capture(w);p.mArmor=2;expect(applyToWorld(w,snap)).toBe(true);expect(p.mArmor).toBe(63);expect(p.mLife).toBe(77);
  delete snap.players[0].armor;expect(applyToWorld(w,snap)).toBe(true);expect(armorValue(p.mArmor)).toBe(0);expect(p.mLife).toBe(77);g.quit();
});

it('rolls armor only for devils, deterministically, and never rolls a corpse twice',()=>{
  const g=createHeadlessGame({mode:'Single',room:1}),w=g.world(),p=g.players()[0];
  let seed=1;for(;seed<10000;seed++){setRandomState(seed);if(random(100)<20)break;}
  setRandomState(seed);const ordinary={_CLASSID_:'CThing_Creature_Zombie',mPosition:p.mPosition.Clone(),mScore:100};
  w.LogKill(ordinary);expect(g.things().some(t=>t._CLASSID_==='CThing_Object_SupplyCrate')).toBe(false);
  setRandomState(seed);const devil={_CLASSID_:'CThing_Creature_Devil',mPosition:p.mPosition.Clone(),mScore:1000};
  w.LogKill(devil);expect(g.things().filter(t=>t._CLASSID_==='CThing_Object_SupplyCrate')).toHaveLength(1);
  const after=getRandomState();w.LogKill(devil);expect(getRandomState()).toBe(after);
  expect(g.things().filter(t=>t._CLASSID_==='CThing_Object_SupplyCrate')).toHaveLength(1);g.quit();
});
