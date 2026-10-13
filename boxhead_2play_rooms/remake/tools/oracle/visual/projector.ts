/**
 * Background-safe Flash projector control (lane V): start a projector minimized WITHOUT activation (its restore
 * position off-screen), capture its stage with PrintWindow after restoring it without activation at that off-screen
 * position, kill it by PID. Never raises a window, never steals the focus, never sends input (projector.ps1).
 *                                                                                    OWNER: lane V (visual)
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../../paths.ts';

const PS1 = join(dirname(fileURLToPath(import.meta.url)), 'projector.ps1');
export const FLASH_DIR = resolve(ROOT, '..', '..', 'flash_player');
export const projectorExe = (version: '8' | '28' | string): string => resolve(FLASH_DIR, version === '8' ? 'FlashPlayer8.exe' : 'FlashPlayer28.exe');

function ps(args: string[]): string {
  try {
    return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args], { encoding: 'utf8' }).trim();
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return `error ${(err.stdout ?? '').trim()} ${(err.stderr ?? '').trim()}`.trim();
  }
}

/** Start `exe swf` minimized and not activated. Returns the PID (throws if the projector could not be started). */
export function launchProjector(exe: string, swf: string): { pid: number; focusKept: boolean } {
  const out = ps(['-Action', 'launch', '-Exe', exe, '-Swf', swf]);
  const m = /^pid (\d+) hwnd (\d+) fg-unchanged=(\w+)/.exec(out);
  if (!m) throw new Error(`projector launch failed: ${out}`);
  return { pid: Number(m[1]), focusKept: m[3] === 'True' };
}

/** Capture the projector's client area (the stage) to `png`. Returns the helper's status line ("ok 640x480 ..."). */
export function captureProjector(pid: number, png: string): string {
  return ps(['-Action', 'capture', '-ProcessId', String(pid), '-Out', png]);
}

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function killProjector(pid: number): void {
  try { execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' }); } catch { /* already gone */ }
}
