import {flash,proto} from '../../engine/runtime.ts';
import {Thing,World,registerGameClass} from '../packages.ts';
import {CThing_Shot} from '../Thing/Shot/CThing_Shot.ts';
import {livingWavePlayers} from './TimedWaves.ts';
const art=new WeakMap<object,any>();
export class CThing_Shot_EnemyBullet extends CThing_Shot{
 declare mCombatBulletLife:number;
 constructor(position:any,angle:any,owner:any,damage:number,speed=.22){
  super(position,angle,owner,damage);this.mDelta=angle.__get__mDelta().ScaleN(speed);this.mCombatBulletLife=75;this.Process=this.Process_Init;
 }
 Process_Init():void{this.SetRadius(.1);this.mWorld.mMap.mMapwho.MoveThing(this);this.Process=this.Process_Normal;this.Process();}
 Process_Normal():void{
  if(--this.mCombatBulletLife<0){this.Delete();return;}
  const n=Math.max(1,Math.ceil(this.mDelta.__get__mLength()/.08));
  for(let i=0;i<n;i++){
   const x=this.mPosition.mX+this.mDelta.mX/n,y=this.mPosition.mY+this.mDelta.mY/n,c=this.mWorld.mMap.mCells[Math.floor(y)]?.[Math.floor(x)];
   if(!c||c.mCollide&World.Map.CMap_Cell.mCollide_Navigation){this.Delete();return;}
   const player=livingWavePlayers(this.mWorld).find(p=>Math.hypot(p.mPosition.mX-x,p.mPosition.mY-y)<=p.mRadius+.1);
   if(player){player.Affect(new Thing.Affect.CThing_Affect_Bullet(this.mParent,this,this.mDamage,this.mAngle));this.Delete();return;}
   this.Move(new Thing.Math.CThing_Position(x,y,this.mPosition.mZ));
  }
 }
 Draw():void{
  let mc=art.get(this.mWorld);if(!mc){mc=this.mWorld.createEmptyMovieClip('_EnemyBulletArt',this.mWorld.getNextHighestDepth());mc._visible=false;mc.lineStyle(1,0x6d2521,100);mc.beginFill(0xffb16a,100);mc.moveTo(-5,-2);mc.lineTo(3,-2);mc.lineTo(5,0);mc.lineTo(3,2);mc.lineTo(-5,2);mc.lineTo(-5,-2);mc.endFill();art.set(this.mWorld,mc);}
  const p=this.mWorld.GetScreenPosition(this.mPosition),a=this.mAngle.__get__mAngle();this.mWorld.bmCurrentDraw.draw(mc,new flash.geom.Matrix(Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),p.x,p.y),undefined,'normal',undefined,true);
 }
}
proto(CThing_Shot_EnemyBullet,{_CLASSID_:'CThing_Shot_EnemyBullet',_BASECLASSID_:'CThing_Shot'});
registerGameClass('Thing.Shot.CThing_Shot_EnemyBullet',CThing_Shot_EnemyBullet);
