/** Registry of oracle probes (see ../runProbe.ts). */
import { p0, p0b } from './p0_hello.ts';
import { p1 } from './p1_forin.ts';
import { p2 } from './p2_numeric.ts';
import { p3 } from './p3_bitmap.ts';
import { p3b } from './p3b_premul.ts';
import { p4 } from './p4_bounds.ts';
import { p5 } from './p5_filters.ts';
import { p6, p7 } from './p6_p7_numbers.ts';
import { p9 } from './p9_sort.ts';
import { p8a, p8b, p8c, p8d, p8e } from './p8_game.ts';
import { p11, p11fp28, p11fp8 } from './p11_construct.ts';
import { XPLAYER } from './xplayer.ts';

export interface ProbeDef {
  /** File-name id, e.g. 'p1_forin' (golden: tests/goldens/flash/<id>.json). */
  id: string;
  title: string;
  /** Build the probe SWF bytes. */
  build(): Uint8Array;
  timeoutMs?: number;
  /** Keep results even if PROBE:END never appeared. */
  allowPartial?: boolean;
  notes?: string[];
  /** Output channel: 'trace' (debug projector + flashlog.txt, default) or 'so' (release projector + SharedObject). */
  channel?: 'trace' | 'so';
  /** SharedObject name for the 'so' channel (default oracle_<id>; must start with oracle_). */
  soName?: string;
  /** Projector executable (default: FP32 debug for 'trace', FlashPlayer28.exe for 'so'). */
  player?: string;
  /** Optional structured view of the raw results stored as `derived` in the golden. */
  derive?(results: Record<string, string>): unknown;
}

export const PROBES: ProbeDef[] = [p0, p0b, p1, p2, p3, p3b, p4, p5, p6, p7, p8a, p8b, p8c, p8e, p8d, p9, p11, p11fp28, p11fp8, ...XPLAYER];
