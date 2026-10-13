// Port of projects/boxhead4/World/Init/CWorld_Init_Wall.as
// Room-timeline marker (MovieClip subclass); its constructor only calls super() (registration with the CWorld).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CWorld_Init } from './CWorld_Init.ts';

export class CWorld_Init_Wall extends CWorld_Init {
  override ctor(): void {
    super.ctor();
  }
}
proto(CWorld_Init_Wall, { _CLASSID_: 'CWorld_Init_Wall' });

registerGameClass('World.Init.CWorld_Init_Wall', CWorld_Init_Wall);
