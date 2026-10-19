import {random} from '../../engine/runtime.ts';
import {Thing,World} from '../packages.ts';
import {SUPPLY_KINDS,supplyIdentity} from './LootRules.ts';
import {CThing_Object_SupplyCrate} from './Supplies.ts';
export function priestLootKind(roll:number):'enchant'|'supply'{return roll<30?'enchant':'supply';}
export function dropPriestSupplies(world:any,death:any):void{
 const kind=priestLootKind(random(100))==='enchant'?'enchant':SUPPLY_KINDS[random(3)]!;
 const cells=world.mMap.mCells,cx=Math.floor(death.mX),cy=Math.floor(death.mY),occupied=new Set((Object.values(world.mThing_Collection.mThings)as any[]).filter(t=>t.Process&&t.mSupplyId).map(t=>`${Math.floor(t.mPosition.mX)},${Math.floor(t.mPosition.mY)}`));
 const available:any[]=[],shared:any[]=[];
 for(let r=0;r<=6;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
  const x=cx+dx,y=cy+dy,c=cells[y]?.[x];if(!c||c.mCollide&(World.Map.CMap_Cell.mCollide_StaticImpassable|World.Map.CMap_Cell.mCollide_Object))continue;
  const at=new Thing.Math.CThing_Position(x+.5,y+.5,0);shared.push(at);if(!occupied.has(`${x},${y}`))available.push(at);
 }
 // A narrow alcove may share an existing crate's cell, retaining an independent identity.
 if(!available.length)available.push(...shared);
 if(!available.length){for(const row of cells)for(const cell of row)if(!(cell.mCollide&(World.Map.CMap_Cell.mCollide_StaticImpassable|World.Map.CMap_Cell.mCollide_Object)))available.push(new Thing.Math.CThing_Position(cell.mPosition.x+.5,cell.mPosition.y+.5,0));}
 const at=available[0];if(at)world.mThing_Collection.AddThing(new CThing_Object_SupplyCrate(at.Clone(),kind,supplyIdentity(world,'s')));
}
