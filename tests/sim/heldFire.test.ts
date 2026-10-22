import {expect,it,vi} from 'vitest';
import {createHeadlessGame,KEYS} from './harness.ts';
import {noSpawn} from './fxkit.ts';
import {installGamepad} from '../../src/game/local/Gamepad.ts';
import {Key} from '../../src/engine/flash/input.ts';

it.each(['pistol','uzi','shotgun','railgun','rocket'])('%s keeps firing at its normal cadence while the keyboard stays down',name=>{
 const g=createHeadlessGame(),p=g.players()[0];try{
  noSpawn(g);p.NewWeapon(name);p.SelectWeapon(name);
  const gun=p.mWeapon_Current,fire=vi.spyOn(gun,'Fire');
  g.keyDown(KEYS.P1.FIRE);g.tick(1);const rate=gun.mFireRate;
  g.tick(rate*3);expect(fire).toHaveBeenCalledTimes(4);
  g.keyUp(KEYS.P1.FIRE);g.tick(rate*2);expect(fire).toHaveBeenCalledTimes(4);
  g.keyDown(KEYS.P1.FIRE);g.tick(1);expect(fire).toHaveBeenCalledTimes(5);
 }finally{g.quit();}
});

it.each(['xbox','nintendo'] as const)('%s B, LT and RT stay held across polls with a second idle pad connected',layout=>{
 const g=createHeadlessGame(),p=g.players()[0],buttons:number[][]=[[],[]];
 const provider=()=>buttons.map((pressed,index)=>({index,id:'test pad',connected:true,axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i)}))}));
 const gp=installGamepad({player:g.player,provider});try{
  noSpawn(g);gp.poll(false);gp.setLayout(0,layout);gp.poll(false);
  const fire=vi.spyOn(p.mWeapon_Current,'Fire'),rate=p.mWeapon_Current.mFireRate;
  for(const button of [layout==='nintendo'?0:1,6,7]){
   const before=fire.mock.calls.length;buttons[0]=[button];
   for(let n=0;n<=rate*3;n++){gp.poll(false);expect(Key.isDown(KEYS.P1.FIRE)).toBe(true);g.tick(1);}
   expect(fire.mock.calls.length-before).toBe(4);
   buttons[0]=[];gp.poll(false);g.tick(rate);expect(fire.mock.calls.length-before).toBe(4);
  }
 }finally{gp.dispose();g.quit();}
});

it('preserves charged grenade release and one-placement-per-press controls',()=>{
 const g=createHeadlessGame(),p=g.players()[0];try{
  noSpawn(g);
  for(const name of ['grenade','barrel','mine','chargepack','fakewall']){
   p.NewWeapon(name);p.SelectWeapon(name);const gun=p.mWeapon_Current,fire=vi.spyOn(gun,'Fire');
   g.keyDown(KEYS.P1.FIRE);g.tick(30);expect(fire).toHaveBeenCalledTimes(name==='grenade'?0:1);
   g.keyUp(KEYS.P1.FIRE);g.tick(1);expect(fire).toHaveBeenCalledTimes(1);
  }
 }finally{g.quit();}
});

it('keeps the original semi-automatic pistol for peers without held-fire support',()=>{
 const g=createHeadlessGame({classicFeatures:['held-fire-v1']}),p=g.players()[0];try{
  noSpawn(g);const fire=vi.spyOn(p.mWeapon_Current,'Fire');g.keyDown(KEYS.P1.FIRE);g.tick(30);expect(fire).toHaveBeenCalledTimes(1);
  g.keyUp(KEYS.P1.FIRE);g.keyDown(KEYS.P1.FIRE);g.tick(1);expect(fire).toHaveBeenCalledTimes(2);
 }finally{g.quit();}
});
