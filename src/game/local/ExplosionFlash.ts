import { World } from '../packages.ts';

/** Soften the full-screen wash, keeping the original animation, fade cadence and simulation state. */
export const EXPLOSION_FLASH_STRENGTH = 0.08;
export function installExplosionFlash(): void {
  const proto = World.CWorld.prototype as any, brightness = proto.Process_Brightness;
  proto.Process_Brightness = function(this: any): any[] {
    const filters = brightness.call(this);
    // Original brightness allocates a fresh identity matrix with RGB offsets. Scale that returned
    // display filter only; never scale mBrightness (which would alter the original fade duration).
    for (const filter of filters) for (const index of [4,9,14]) {
      if (filter.matrix[index] > 0) filter.matrix[index] *= EXPLOSION_FLASH_STRENGTH;
    }
    return filters;
  };
}
