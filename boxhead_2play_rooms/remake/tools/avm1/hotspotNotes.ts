/**
 * Hand-verified notes for hotspots.md, keyed by `<relative .as path>:<method name>`.
 * Every note was checked against the clean instruction listing (`node tools/disasm.ts --instructions`).
 */
export const HOTSPOT_NOTES: Record<string, string> = {
  'Thing/Math/CThing_Angle.as:Create_LookupTables':
    'VERIFIED (instructions): n runs 32 DOWN to 1 (`while (n)`), a runs 255 DOWN to 0 (`while (!(a < 0))`), value ' +
    '`Math.round(a / (256 / n)) % n` (two Divide ops: 256/n, then a/that). mLookup256[0] is never filled. Numerically ' +
    'identical to round(a*n/256)%n for all n=1..32, a=0..255 (checked), but port the exact expression.',
  'World/CWorld.as:InitThings':
    'VERIFIED: forward loop i = 0 .. mInitList.length-1 (`_loc4_`; length cached in `_loc6_` before the loop), ' +
    'item = mInitList[i], then the switch on item._CLASSID_. mInitList order = processing order.',
  'World/Map/CMap.as:InitCells':
    'VERIFIED: y = 0..mSize.y-1 (`_loc3_`), x = 0..mSize.x-1 (`_loc4_`), `mCells[y][x] = new CMap_Cell(x, y)`. ' +
    'Border loops: `_loc6_[x].mCollide = _loc5_[x].mCollide = flags` (inner assignment first) and ' +
    '`mCells[y][0].mCollide = mCells[y][mSize.x - 1].mCollide = flags`.',
  'World/Map/CMap.as:SetAdjacentCells':
    'VERIFIED: y, x over the map, d = 0..mDirection_Amount-1: `adj = mCells[y + Deltas[d].mY][x + Deltas[d].mX]`, ' +
    '`list[d] = adj == undefined ? mInvalidCell : adj`.',
  'DrawPrimitive/XSI/CDrawPrimitive_XSI_DI.as:LoadAnimation':
    'VERIFIED: d = 0..mDirections.length-1, f = 0..frameCount-1. Frame de-duplication test is ' +
    '`mFrameSequence && mFrameSequence[f] != f` (ffdec: `[0] != 0`), reusing `mDirections[d].mFrames[mFrameSequence[f]]`; ' +
    'new frames render source frame `_loc3_[f]`.',
  'DrawPrimitive/XSI/CDrawPrimitive_XSI_DI.as:RenderStack_Process':
    'VERIFIED: pops mRenderStack until empty; after each render it stops (EndRender, return true) when ' +
    '`getTimer() - timeStamp >= timeAmount`.',
  'DrawPrimitive/XSI/CDrawPrimitive_XSI_DI.as:Render':
    'VERIFIED: plane index `_loc9_` starts at -1 and is incremented per model before use (ffdec printed 0); polygon ' +
    'loops are `i = 2; while (i < len) { lineTo(v[i], v[i + 1]); i += 2; }`.',
  'Thing/Creature/CThing_Creature_Player.as:Process_Init':
    'VERIFIED: `for (i = 0; i < 10; i++) mControls["SELECT" + i] = CMain.mInput["KEY_SELECT" + i + mControl_PostFix];`',
  'Thing/Creature/CThing_Creature_Player.as:InitWeapons':
    'VERIFIED: i = 0..list.length-1, `mIndex: i`, `mKeyID: (i + 1) % 10` (weapon 0 -> key 1 ... weapon 9 -> key 0).',
  'Thing/Creature/CThing_Creature_Player.as:RandomPickup':
    'VERIFIED: chances are CUMULATIVE (`_loc5_ = _loc5_ + _loc8_`, ffdec `0 + _loc8_`); the pick is the first i with ' +
    '`rnd < list[i].mChanceIndex`; "life" refills mLife, otherwise AddWeapon; both paths return true.',
  'Thing/Creature/CThing_Creature_Player.as:NextWeapon':
    'VERIFIED: for k = 1..len-1: idx = (cur.mIndex + k) % len; first active non-empty weapon wins.',
  'Thing/Creature/CThing_Creature_Player.as:PrevWeapon':
    'VERIFIED: for k = 1..len-1: idx = (cur.mIndex + len - k) % len; first active non-empty weapon wins.',
  'Thing/Weapon/CThing_Weapon_Shotgun.as:Fire':
    'VERIFIED: centre bullet first; then step = 1.25 * (mWideShot + 1) degrees (boolean + 1), a = step; for ' +
    'i = 0 .. (mWideShot ? 1 : 0): two bullets at angle -a and +a, last ctor arg `i >= 1` (ffdec printed `false`), a += step.',
  'Thing/Creature/CThing_Creature.as:ProcessAffects':
    'VERIFIED structure (switch on mType inside for..in): Bullet: `if (player && !mDamageActive) break;` else FALLS ' +
    'THROUGH into FireBall (-> State_BulletHit). Explosion: `if (player && !mDamageActive) break;` otherwise AffectThing, ' +
    'knock-back and `SetState("State_ExplosionHit")` — ffdec shows that SetState as dead code after `continue`. ' +
    '(`break` == next affector here: nothing follows the switch inside the loop.)',
  'Thing/Creature/CThing_Creature.as:State_EnterMap_Init':
    'VERIFIED: `for (d = 0; d < 8; d += 2)` — first orthogonal neighbour that is defined and not StaticImpassable; ' +
    '`mAngle.mDirection = d`, `mDirectionCell = cell`, return.',
  'Thing/Creature/CThing_Creature.as:State_BulletHit':
    'VERIFIED: ffdec lost the `return;` ending the `if (!isNaN(pos.mX)) { ... }` block. The trailing ' +
    '`mFlags |= DEAD; mThingCounters.INVALIDPOSITION++; SetState("State_Dying")` runs ONLY when CreatureCollide returned ' +
    'NaN (invalid position) — NOT after every bullet hit.',
  'Thing/Shot/CThing_Shot_Grenade.as:Process_Normal':
    'VERIFIED: bounce flag `_loc2_` = false; set true on floor bounce (z < 0) and on wall bounce (BounceCollide); the ' +
    'bounce sound plays only if flag && mDelta.mLength > 0.06.',
  'Thing/CThing_Collection.as:GetClosestPlayer':
    'VERIFIED: the closest-player search compares against the running minimum `_loc3_` (starts at Number.MAX_VALUE); ' +
    'ffdec compared against the constant, which would pick the LAST living player.',
  'World/CWorld.as:Spawn_ValidPosition_Close':
    'VERIFIED: compares against the running best `_loc7_` (starts at Number.MAX_VALUE), not the constant.',
  'World/CWorld.as:Spawn_ValidPosition_Far':
    'VERIFIED: compares against the running best `_loc7_` (starts at 0), not the constant.',
  'World/Map/CMap_Cell.as:Nav_Update':
    'VERIFIED: "restart" and "resume" expand at most 5 BFS layers per call: `for (i = 0; i < 5 && nList.length; i++)` ' +
    '(ffdec dropped `i < 5`). "resume"/"continue" process batches of nInterations cells and stop with state "continue" ' +
    'when `getTimer() - nSTimer > nTimeOut`.',
  'CMain.as:ProcessFrames':
    'VERIFIED: every bare/odd number here is getTimer() (see gettimer.md); frame cap: `n > mFrameCap ? mFrameCap : n`.',
  'World/CUpgrades.as:InitLists':
    'VERIFIED: per level i = 1..100: Zombie_SpawnRate floor(z) with z = 1*mFPS then max(z-1, 1); Zombie_Count floor(c), ' +
    'c = (mCheat_OneZombie ? 1 : 10) then min(c+5, 60); Zombie_TotalCount t = 10 then t+5; SpeedUp min(1 + i/100*10, 5). ' +
    'Devils (if mDevilsActive): rate 10*mFPS then max(r-1, mFPS); count 0 then (i == 1 ? 1 : min(c+0.3, 5)); total 0 ' +
    'then (i == 1 ? 1 : t+0.25). Values are added BEFORE the update (level 1 uses the start values).',
  'World/CUpgrades.as:SetDifficulty':
    'VERIFIED: (level, multiplier) = DeathMatch ? (1, 200) : [(1,1), (10,10), (20,30), (35,50)][difficulty]; then ' +
    '`mLevel++` level-1 times and `mMultiplier++` multiplier-1 times with mHud.mSilentMessages = true.',
};

/** Hand-verified facts without an ffdec artifact, listed at the top of hotspots.md. */
export const HOTSPOT_GENERAL: string[] = [
  '`World.CUpgrades.prototype.GetTicks(index)` @548504: `index = 101 - min(index, 100)`; ticks = ' +
  '`Math.pow(index, 2.5) / 100000.00000000003 * (CMain.mFPS * 3 - 3) + 3` — the divisor in the bytecode is the double ' +
  '100000.00000000003, not 1e5.',
  'Bit masks such as `flags & (X ^ 4294967295)` in the bytecode are ffdec\'s `flags &= X ^ -1` (int32 semantics: same ' +
  'result in JS).',
  'Ternaries are printed in ffdec\'s orientation (`!c ? F : T`); `&&`/`||` are short-circuit values exactly as compiled.',
];
