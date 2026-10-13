// Port of projects/boxhead4/World/Init/CWorld_Init_Zombie.as
// Room-timeline marker (MovieClip subclass); its constructor only calls super() (registration with the CWorld).
import { proto } from '../../../engine/runtime.ts';
import { registerGameClass } from '../../packages.ts';
import { CWorld_Init } from './CWorld_Init.ts';

export class CWorld_Init_Zombie extends CWorld_Init {
  override ctor(): void {
    super.ctor();
  }
}
proto(CWorld_Init_Zombie, { _CLASSID_: 'CWorld_Init_Zombie' });

registerGameClass('World.Init.CWorld_Init_Zombie', CWorld_Init_Zombie);
