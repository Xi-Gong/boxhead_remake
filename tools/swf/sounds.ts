/**
 * DefineSound -> SoundDef + file bytes. MP3 (format 2): the 2-byte SeekSamples field is dropped and the raw MP3
 * frames are written as-is. Other formats are not used by this SWF and are rejected.
 */
import type { ByteReader } from './ByteReader.ts';

export const SOUND_RATES = [5512, 11025, 22050, 44100] as const;
const FORMAT_NAMES = ['pcm-native', 'adpcm', 'mp3', 'pcm-le', 'nellymoser16', 'nellymoser8', 'nellymoser', '7', '8', '9', '10', 'speex'];

export interface DecodedSound {
  id: number;
  format: 'mp3';
  rate: number;
  is16Bit: boolean;
  stereo: boolean;
  sampleCount: number;
  seekSamples: number;
  /** Raw MP3 frame data. */
  file: Uint8Array;
}

export function parseDefineSound(r: ByteReader): DecodedSound {
  const id = r.u16();
  const flags = r.u8();
  const format = flags >> 4;
  const rate = SOUND_RATES[(flags >> 2) & 3];
  const is16Bit = !!(flags & 2), stereo = !!(flags & 1);
  const sampleCount = r.u32();
  if (format !== 2) throw new Error(`DefineSound ${id}: unsupported format ${FORMAT_NAMES[format] ?? format}`);
  const seekSamples = r.s16();
  const file = r.bytes(r.remaining);
  return { id, format: 'mp3', rate, is16Bit, stereo, sampleCount, seekSamples, file };
}
