/**
 * Cross-player variants: the single-frame probes re-run in the release projectors Flash Player 8 (8.0.22, the
 * game's target player) and Flash Player 28 (28.0.0.126) through the SharedObject channel, to show whether the FP32
 * goldens also hold for the players the game was written for. Ids: x<player>_<probe> (e.g. x8_p2_numeric).
 * P5 is split into chunks (the local SharedObject quota is ~100 KB).
 */
import { resolve } from 'node:path';
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import { soPrelude } from '../sol.ts';
import { SRC as P1_SRC } from './p1_forin.ts';
import { SRC as P2_SRC } from './p2_numeric.ts';
import { SRC as P3_SRC } from './p3_bitmap.ts';
import { SRC as P4_SRC, buildP4 } from './p4_bounds.ts';
import { FILTER_CASES, buildP5, makeSrc } from './p5_filters.ts';
import { P6_SRC, P7_SRC } from './p6_p7_numbers.ts';
import { FP28 } from './p8_game.ts';
import type { ProbeDef } from './index.ts';

export const PLAYERS = { 8: resolve(FP28, '..', 'FlashPlayer8.exe'), 28: FP28 } as const;

/** Convert a trace-channel probe source into a SharedObject-channel source. */
export function toSO(src: string, soName: string): string {
  if (!src.startsWith(PRELUDE)) throw new Error('probe source must start with PRELUDE');
  const body = src.slice(PRELUDE.length);
  if (!body.includes('trace("PROBE:END");')) throw new Error('probe source must end with trace("PROBE:END")');
  return soPrelude(soName) + body.replace('trace("PROBE:END");', 'END();');
}

const P5_CHUNKS = 10;

function variants(ver: 8 | 28): ProbeDef[] {
  const player = PLAYERS[ver];
  const so = (id: string, title: string, build: (soName: string) => Uint8Array): ProbeDef => ({
    id: `x${ver}_${id}`, title: `${title} — Flash Player ${ver}`, channel: 'so', player, timeoutMs: 60000,
    soName: `oracle_x${ver}_${id}`, build: () => build(`oracle_x${ver}_${id}`),
  });
  const single = (id: string, src: string, title: string): ProbeDef => so(id, title, (n) => singleFrameSwf(compileAS(toSO(src, n))));
  const out = [
    single('p1_forin', P1_SRC, 'for..in order'),
    single('p2_numeric', P2_SRC, 'MovieClip numeric storage'),
    single('p3_bitmap', P3_SRC, 'BitmapData addressing'),
    so('p4_bounds', 'getBounds / draw semantics', (n) => buildP4(toSO(P4_SRC, n))),
    single('p6_numtostr', P6_SRC, 'Number to String'),
    single('p7_math', P7_SRC, 'Math / conversions'),
  ];
  const per = Math.ceil(FILTER_CASES.length / P5_CHUNKS);
  for (let c = 0; c <= P5_CHUNKS; c++) {
    // chunks 0..P5_CHUNKS-1: the applyFilter cases; last chunk: the extent/in-place/normalisation/display-list extras
    const cases = c < P5_CHUNKS ? FILTER_CASES.slice(c * per, (c + 1) * per) : [];
    out.push(so(`p5_filters_${c}`, `Filter goldens chunk ${c}`, (n) => buildP5(toSO(makeSrc(cases, c === P5_CHUNKS), n))));
  }
  return out;
}

export const XPLAYER: ProbeDef[] = [...variants(8), ...variants(28)];
