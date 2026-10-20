// TIMED_WAVES: pure rules shared by simulation, menus and deterministic tests.
export const TIMED_WAVES_RULE = 'timed-waves-v1';
export type MapSize = 'small' | 'medium' | 'large';
export const ROOM_DIMENSIONS: readonly (readonly [number, number])[] = [
  [22,17],[25,21],[34,38],[25,25],[46,17],[22,41],[33,30],[30,25],[41,33],
  [58,17],[41,33],[40,33],[38,34],[58,47],[84,17],[58,50],[84,22],[87,87],
];
export function mapSize(width: number, height: number): MapSize {
  const longest = Math.max(width, height), area = width * height;
  return longest >= 64 || area > 2000 ? 'large' : area <= 800 && longest <= 40 ? 'small' : 'medium';
}
export function waveSeconds(width: number, height: number, boss = false): number {
  return ({small:180,medium:240,large:300}[mapSize(width,height)]) + (boss ? 60 : 0);
}
export function spawnIntervalSeconds(difficulty: number, wave: number, progress: number): number {
  const base = Math.max(.2, [.8,.65,.5,.4][Math.max(0,Math.min(3,Math.floor(difficulty)))]! - .01 * Math.max(0,wave-1));
  return Math.max(.2, base * (progress < .2 ? 1.15 : progress < .7 ? 1 : .85));
}
export function clockLabel(ticks: number, fps = 25): string {
  const seconds = Math.ceil(Math.max(0,ticks) / fps);
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
