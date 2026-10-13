/** ExportAssets (56): linkage name -> character id. */
import type { ByteReader } from './ByteReader.ts';

export function parseExportAssets(r: ByteReader): { id: number; name: string }[] {
  const n = r.u16();
  const out: { id: number; name: string }[] = [];
  for (let i = 0; i < n; i++) {
    const id = r.u16();
    out.push({ id, name: r.string() });
  }
  return out;
}
