/**
 * DefineButton2 -> ButtonDef. Button records come from records.ts; BUTTONCONDACTIONs are located and recorded as
 * ActionRef kind 'button' (spriteId = button character id, `cond` = the 16-bit condition flags).
 */
import type { ActionRef, ButtonDef } from '../../src/shared/assetSchema.ts';
import type { ByteReader } from './ByteReader.ts';
import { readButtonRecords } from './records.ts';

export function parseDefineButton2(r: ByteReader, actions: ActionRef[]): ButtonDef {
  const id = r.u16();
  const flags = r.u8();
  const actionOffsetPos = r.pos;
  const actionOffset = r.u16();
  const records = readButtonRecords(r, true);
  const def: ButtonDef = { t: 'button', id, ver: 2, trackAsMenu: !!(flags & 1), records };
  if (actionOffset) {
    let p = actionOffsetPos + actionOffset;
    def.actions = [];
    for (;;) {
      r.pos = p;
      const size = r.u16();
      const cond = r.u16();
      const start = r.pos;
      const end = size ? p + size : r.end;
      def.actions.push(actions.length);
      actions.push({ kind: 'button', spriteId: id, offset: start, length: end - start, cond });
      if (!size) break;
      p += size;
    }
  }
  return def;
}
