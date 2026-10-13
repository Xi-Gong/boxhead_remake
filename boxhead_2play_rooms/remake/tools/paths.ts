import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** remake/ root */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The original game SWF (in-repo). */
export const SWF_PATH = resolve(ROOT, '..', 'boxhead_2play_rooms.swf');
/** Expected sha256 of the original SWF. */
export const SWF_SHA256 = '34ff145d96891ddea20278700c8b1fb6fd6273ca0e71b73d8bdf0df183fdbece';
/** Decompiled AS2 sources and FLA (reference only). */
export const AS2_DIR = resolve(ROOT, '..', '..', 'projects', 'boxhead4');
export const FLA_PATH = resolve(AS2_DIR, 'boxhead2play.fla');
export const AUDIO_REF_DIR = resolve(ROOT, '..', '..', 'ClassicResources', 'Audios', 'boxhead4');
export const ASSETS_OUT = resolve(ROOT, 'public', 'assets');
export const GENERATED = resolve(ROOT, 'generated');

/** True when the module with this import.meta.url is the Node entry point. */
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  return !!entry && resolve(fileURLToPath(metaUrl)) === resolve(entry);
}
