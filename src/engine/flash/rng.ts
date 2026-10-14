/**
 * Random numbers for the AS2 port. ALL randomness in src/game must go through here (never Math.random directly),
 * so headless simulations are reproducible with a seed.
 *
 *   Math.random()  ->  mathRandom()
 *   random(n)      ->  random(n)        (AS2 global function: integer in [0, n))
 */

let state = (Math.random() * 0xffffffff) >>> 0;
let seeded = false;

/** sfc32-style 32-bit generator split into a mulberry32 for simplicity and speed. */
function next32(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Seed the generator (tests). */
export function seedRandom(seed: number): void {
  state = seed >>> 0;
  seeded = true;
}

export function isSeeded(): boolean { return seeded; }

/**
 * Raw generator state access for the resume feature (local/Resume.ts): capture before quitting a run, restore when
 * rebuilding it so the wave replays with the same randomness. Pure u32 in/out, independent of seedRandom. (The
 * optional mathRandomSource override is never installed by the game itself, only by dev visual scenes, so the game's
 * randomness all flows through `state`.)
 */
export function getRandomState(): number { return state; }
export function setRandomState(s: number): void { state = s >>> 0; }

/**
 * Optional replacement source for `Math.random()` ONLY (dev visual scenes, lane X2: src/dev/fxScenes.ts installs the
 * same Park-Miller LCG the injected AS1 driver installs as Math.random in the original). `random(n)` keeps using the
 * internal generator, exactly like Flash, where the AVM1 random opcode does not go through Math.random.
 */
let mathRandomSource: (() => number) | undefined;

export function setMathRandomSource(fn: (() => number) | undefined): void {
  mathRandomSource = fn;
}

/** Replacement for AS2 Math.random(): float in [0, 1). */
export function mathRandom(): number {
  return mathRandomSource ? mathRandomSource() : next32() / 4294967296;
}

/** AS2 global `random(n)`: integer in [0, n) (0 when n <= 0). */
export function random(n: number): number {
  if (!(n > 0)) return 0;
  return Math.floor((next32() / 4294967296) * Math.floor(n));
}
