// Lane Q: must be the FIRST import of the sim harness — switches BitmapData to pixel-less backings before any game
// module evaluates (static initializers may create BitmapData objects).
import { BitmapData } from '../../src/engine/flash/BitmapData.ts';

BitmapData.headless = true;
