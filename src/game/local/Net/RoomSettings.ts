import type { RoomSettings } from './protocol.ts';

/** AS2 save switches can be numeric 0/1 or booleans. Missing values retain the original enabled default. */
export function savedSwitch(value: unknown, fallback = true): boolean {
  return value === 0 || value === false ? false : value === 1 || value === true ? true : fallback;
}
export function roomSettingsFromSave(save: any): RoomSettings {
  return { gameSpeed: [0,1,2].includes(save?.mGameSpeed) ? save.mGameSpeed : 1,
    devils: savedSwitch(save?.mDevilsActive), collisions: savedSwitch(save?.mCollisionsActive), damage: savedSwitch(save?.mDamageActive) };
}
