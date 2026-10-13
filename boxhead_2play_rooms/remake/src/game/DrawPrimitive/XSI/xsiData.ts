// Lane F1 helper (no AS2 counterpart): rebuilds the AS2 objects of `_global.mXSI_Data` from public/assets/xsi.json.
//
// In the original, sprite 755's DoAction (export TMP2639qh3hat) evaluates a 4.6 MB literal script and ends with
//   _global.mXSI_Data = {mItems: mItems};   // 40 items, see generated/reports/xsi-summary.md
// Lane B2 executed that script offline; xsi.json stores every AS2 object as an ordered entry list `{$: [[k, v], ...]}`
// in property CREATION order and every array as a plain JSON array.
//
// PAINT ORDER (why xsiForIn exists). CDrawPrimitive_XSI_DI.Render enumerates `oFrame.Models` with for..in and gives
// the i-th enumerated model its own plane `mcGraphic._Plane<i>` at depth 10000 - i ([BC]
// generated/disasm/DrawPrimitive.XSI.CDrawPrimitive_XSI_DI.txt @247124..@247213), so the FIRST enumerated model ends
// up IN FRONT. Inside a model, polygons go into the same plane, so a later fill covers an earlier one.
// The data evidence (xsi-summary.md §6: 98% of model pairs are stored back-to-front; head/brim/cap rendering) requires
// the visual stacking "stored `$` order back-to-front" and "polygons painted from the LAST index to the first". With
// the per-model planes this means BOTH enumerations are newest-first:
//   - Models (InitObject-built): reverse creation order ($[n-1] first -> plane 0 -> front),
//   - arrays (InitArray-built): descending indices.
// (xsi-summary §6 assumed a single plane and therefore phrased the model order as "stored order"; the resulting
// on-screen stacking is the same.) This equals as2.ts forIn() in its default 'reverse-insertion' mode, but the XSI
// renderer is pinned to it through xsiForIn() so that a later global for..in decision (oracle probe P1) cannot flip
// the character paint order against the evidence.
import type { AsObject, AsValue, XsiJson } from '../../../shared/assetSchema.ts';
import { _global } from '../../../engine/runtime.ts';

function isAsObject(v: unknown): v is AsObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Array.isArray((v as AsObject).$);
}

/** Convert one AsValue to the plain JS/AS2 value (objects keep their `$` key order as insertion order). */
export function asValueToAS2(v: AsValue): any {
  if (v === null) return undefined; // array hole / undefined (none occur in xsi.json v1)
  if (Array.isArray(v)) {
    const a: any[] = new Array(v.length);
    for (let i = 0; i < v.length; i++) {
      const e = v[i]!;
      if (e !== null) a[i] = asValueToAS2(e);
    }
    return a;
  }
  if (isAsObject(v)) {
    const o: Record<string, any> = {};
    for (const [k, x] of v.$) {
      if (/^(0|[1-9]\d*)$/.test(k)) throw new Error(`xsiData: integer-like key "${k}" would break the $ order`);
      o[k] = asValueToAS2(x);
    }
    return o;
  }
  return v;
}

/** `_global.mXSI_Data.mItems` as built by the original DoAction (Array of 40 item objects, in push order). */
export function buildXsiItems(json: XsiJson): any[] {
  if (!json || json.v !== 1 || !Array.isArray(json.items)) throw new Error('xsiData: unexpected xsi.json format');
  const mItems: any[] = new Array();
  for (const it of json.items) mItems.push(asValueToAS2(it));
  return mItems;
}

/** Equivalent of the DoAction's `_global.mXSI_Data = {mItems: mItems}` (consumed and deleted by CMain). */
export function installXsiData(json: XsiJson): any {
  const mItems = buildXsiItems(json);
  _global.mXSI_Data = { mItems };
  return _global.mXSI_Data;
}

/** Browser/Electron: fetch public/assets/xsi.json (base URL configurable) and install it. */
export async function loadXsiData(url = 'assets/xsi.json'): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`xsiData: ${url}: HTTP ${res.status}`);
  return installXsiData((await res.json()) as XsiJson);
}

/**
 * for..in key order for XSI data inside CDrawPrimitive_XSI_DI.Render (see the header): arrays -> indices from high
 * to low; objects -> own keys newest-first (reverse insertion order). undefined/null -> no keys.
 */
export function xsiForIn(o: any): string[] {
  if (o == null) return [];
  if (Array.isArray(o)) {
    const keys: string[] = [];
    for (let i = o.length - 1; i >= 0; i--) if (i in o) keys.push(String(i));
    return keys;
  }
  if (typeof o === 'object') return Object.keys(o).reverse();
  return [];
}
