// Deterministic stress fixture: normal object/shot constructors and authored explosion paths, no damage caps.
import { Thing, World } from '../../src/game/packages.ts';

export function explosionBurst(world: any, count: number, level = 125): void {
  const players = Object.values(world.mThing_Collection.mPlayerThings) as any[];
  if (world.mUpgrades.lanGrowth) for (const p of world.mUpgrades.lanGrowth.players) p.level = level;
  else while (world.mUpgrades.mMultiplierIndex < level) world.mUpgrades.__set__mMultiplier(world.mUpgrades.mMultiplierIndex + 1);
  const cells: any[] = [];
  for (const row of world.mMap.mCells) for (const cell of row) {
    if (cell.mID.x >= 5 && cell.mID.y >= 5 && !(cell.mCollide & World.Map.CMap_Cell.mCollide_StaticImpassable)) cells.push(cell);
  }
  for (let n = 0; n < count; n++) {
    const cell = cells[n % cells.length], position = new Thing.Math.CThing_Position(cell.mID.x + .5, cell.mID.y + .5, 0);
    const owner = players[n % players.length], angle = new Thing.Math.CThing_Angle(0);
    let object: any;
    switch (n % 4) {
      case 0:
        object = new Thing.Object.CThing_Object_Barrel(position, angle, owner, 100);
        world.mThing_Collection.AddThing(object); object.Process_Init();
        object.mAffectors.push(new Thing.Affect.CThing_Affect_Bullet(owner, owner, 1, angle));
        object.Process = object.Process_Normal;
        break;
      case 1:
        object = new Thing.Object.CThing_Object_ChargePack(position, angle, owner, 100);
        world.mThing_Collection.AddThing(object); object.Process_Init(); object.mDetonateCounter = 0; object.Process = object.Process_Detonate;
        break;
      case 2:
        object = new Thing.Shot.CThing_Shot_Grenade(position, angle, owner, 100, 0);
        world.mThing_Collection.AddThing_Shot(object); object.Process_Init();
        object.mEffect.mBiggerBang = 2; object.mEffect.mClusterExplode = 1;
        object.mLife = 1;
        break;
      default:
        object = new Thing.Object.CThing_Object_Mine(position, angle, owner, 100);
        world.mThing_Collection.AddThing(object); object.Process_Init(); object.mDetonateCounter = 0; object.Process = object.Process_Detonate;
        break;
    }
  }
}
