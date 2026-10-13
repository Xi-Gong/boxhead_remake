/**
 * Locate and evaluate the XSI DoAction (sprite 755, export `TMP2639qh3hat`) with the AVM1 data VM.
 * Shared by extractXsi.ts (xsi.json) and xsiSummary.ts (report).
 */
import type { AsValue } from '../../src/shared/assetSchema.ts';
import { SwfFile, TAG } from '../swf/SwfFile.ts';
import { AsArr, AsObj, runDataScript, toAsValue } from '../avm1/dataVm.ts';
import type { DataVmResult } from '../avm1/dataVm.ts';

/** Export name of the sprite holding the XSI DoAction. */
export const XSI_EXPORT_NAME = 'TMP2639qh3hat';

export interface XsiScript {
  spriteId: number;
  /** Offset of the DoAction body in the decompressed SWF, and its length. */
  offset: number;
  length: number;
  bytes: Uint8Array;
}

/** Locate the XSI DoAction: ExportAssets name -> DefineSprite -> its (single) DoAction tag. */
export function findXsiScript(swf: SwfFile): XsiScript {
  let spriteId: number | undefined;
  for (const t of swf.tags()) {
    if (t.code !== TAG.ExportAssets) continue;
    const r = swf.reader(t);
    const n = r.u16();
    for (let i = 0; i < n; i++) {
      const id = r.u16();
      if (r.string() === XSI_EXPORT_NAME) spriteId = id;
    }
  }
  if (spriteId === undefined) throw new Error(`export ${XSI_EXPORT_NAME} not found`);
  for (const t of swf.tags()) {
    if (t.code !== TAG.DefineSprite || SwfFile.spriteId(t) !== spriteId) continue;
    const actions = [...swf.spriteTags(t)].filter((st) => st.code === TAG.DoAction);
    if (actions.length !== 1) throw new Error(`sprite ${spriteId}: expected 1 DoAction, found ${actions.length}`);
    const a = actions[0];
    return { spriteId, offset: a.offset, length: a.length, bytes: a.body };
  }
  throw new Error(`DefineSprite ${spriteId} not found`);
}

export interface XsiEvaluation {
  script: XsiScript;
  vm: DataVmResult;
  /** `_global.mXSI_Data.mItems` as VM objects (identity preserved; used for reports). */
  vmItems: AsObj[];
  /** `_global.mXSI_Data.mItems` converted to the xsi.json value model. */
  items: AsValue[];
  /** Number of objects/arrays referenced from more than one place (each is serialized as a copy). */
  sharedRefs: number;
}

/** Run the XSI script and return `_global.mXSI_Data.mItems`, validated against the script's own trace. */
export function evaluateXsi(swf: SwfFile): XsiEvaluation {
  const script = findXsiScript(swf);
  const vm = runDataScript(script.bytes);
  const data = vm.global.get('mXSI_Data');
  const mItems = data instanceof AsObj ? data.get('mItems') : undefined;
  if (!(mItems instanceof AsArr)) throw new Error('script did not define _global.mXSI_Data.mItems');
  const m = /^IMPORTED XSI DATA! No\. Items = (\d+)$/.exec(vm.traces.at(-1) ?? '');
  if (!m || Number(m[1]) !== mItems.items.length) {
    throw new Error(`unexpected trace output ${JSON.stringify(vm.traces)} for ${mItems.items.length} items`);
  }
  if (vm.warnings.length) throw new Error(`XSI script warnings:\n${vm.warnings.join('\n')}`);
  const vmItems = mItems.items.map((x, i) => {
    if (!(x instanceof AsObj)) throw new Error(`mItems[${i}] is not an object`);
    return x;
  });
  const conv = { sharedRefs: 0 };
  const items = toAsValue(mItems, conv) as AsValue[];
  return { script, vm, vmItems, items, sharedRefs: conv.sharedRefs };
}
