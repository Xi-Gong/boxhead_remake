/** Quick SWF tag inventory (debug CLI): node tools/inventory.ts [swfPath] */
import { SwfFile, TAG, TAG_NAMES } from './swf/SwfFile.ts';
import { SWF_PATH, isMain } from './paths.ts';

export function inventory(swf: SwfFile) {
  const top: Record<string, number> = {};
  const inner: Record<string, number> = {};
  for (const t of swf.tags()) {
    const n = TAG_NAMES[t.code] ?? `tag${t.code}`;
    top[n] = (top[n] ?? 0) + 1;
    if (t.code === TAG.DefineSprite) {
      for (const s of swf.spriteTags(t)) {
        const m = TAG_NAMES[s.code] ?? `tag${s.code}`;
        inner[m] = (inner[m] ?? 0) + 1;
      }
    }
  }
  return { header: swf.header, sha256: swf.sha256, top, inner };
}

if (isMain(import.meta.url)) {
  const swf = SwfFile.fromPath(process.argv[2] ?? SWF_PATH);
  console.log(JSON.stringify(inventory(swf), null, 2));
}
