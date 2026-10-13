/**
 * Read helpers for the XSI value model (`AsValue` / `AsObject` from src/shared/assetSchema.ts) plus the statistics
 * definitions used by xsi.json, the summary report and the tests.
 */
import type { AsObject, AsValue, XsiJson } from '../../src/shared/assetSchema.ts';

export function isAsObject(v: AsValue | undefined): v is AsObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Property names in stored (creation) order. */
export function asKeys(o: AsValue | undefined): string[] {
  return isAsObject(o) ? o.$.map((e) => e[0]) : [];
}

/** Property value (undefined when absent or when `o` is not an object). */
export function asGet(o: AsValue | undefined, key: string): AsValue | undefined {
  if (!isAsObject(o)) return undefined;
  for (const e of o.$) if (e[0] === key) return e[1];
  return undefined;
}

/** Follow a dotted path of property names / array indices. */
export function asPath(o: AsValue | undefined, path: string): AsValue | undefined {
  let cur: AsValue | undefined = o;
  for (const part of path.split('.')) {
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else cur = asGet(cur, part);
    if (cur === undefined) return undefined;
  }
  return cur;
}

export function asArray(v: AsValue | undefined): AsValue[] {
  return Array.isArray(v) ? v : [];
}

/** Typed view of one `_global.mXSI_Data.mItems[i]` entry. */
export interface XsiItemView {
  index: number;
  groupID: string;
  animID: string;
  /** `mGroupID + "_" + mAnimID` (as CDrawPrimitive_XSI_DI builds it). */
  id: string;
  renderPartner?: string;
  /** Note the original spelling `mFrameSquence`. */
  frameSequence?: number[];
  xsi: AsObject;
  /** mRotations[direction][frame] = { Models: { <modelName>: model } } */
  rotations: AsValue[][];
}

export function itemView(item: AsValue, index: number): XsiItemView {
  const groupID = asGet(item, 'mGroupID');
  const animID = asGet(item, 'mAnimID');
  const xsi = asGet(item, 'mXSI');
  if (typeof groupID !== 'string' || typeof animID !== 'string' || !isAsObject(xsi)) {
    throw new Error(`mItems[${index}] is not an XSI item`);
  }
  const partner = asGet(item, 'mRenderPartner');
  const seq = asGet(item, 'mFrameSquence');
  return {
    index, groupID, animID, id: `${groupID}_${animID}`, xsi,
    renderPartner: typeof partner === 'string' ? partner : undefined,
    frameSequence: Array.isArray(seq) ? seq.map((x) => x as number) : undefined,
    rotations: asArray(asGet(xsi, 'mRotations')).map((d) => asArray(d)),
  };
}

/** Models object of a direction-frame. */
export function frameModels(frame: AsValue): AsObject {
  const m = asGet(frame, 'Models');
  if (!isAsObject(m)) throw new Error('direction-frame without Models');
  return m;
}

/** A model whose `Empty` is truthy is a placeholder: the renderer substitutes the render partner's model. */
export function isEmptyModel(model: AsValue): boolean {
  return !!asGet(model, 'Empty');
}

/**
 * Statistics stored in xsi.json:
 *  - items: number of `mItems` entries;
 *  - directionFrames: sum over items of the frame count of every direction (`mRotations[d].length`);
 *  - polygons: number of `Shape_vList` entries of every non-Empty model of every direction-frame
 *    (Shadow and PEdge polygons are NOT counted);
 *  - vertices: sum over those polygons of `vList.length / 2` (each vList is a flat [x0,y0,x1,y1,...] list; a closing
 *    vertex repeated at the end, which a few polygons have, is counted as written).
 */
export function computeXsiStats(items: AsValue[]): XsiJson['stats'] {
  let directionFrames = 0, polygons = 0, vertices = 0;
  items.forEach((it, i) => {
    const v = itemView(it, i);
    for (const dir of v.rotations) {
      for (const frame of dir) {
        directionFrames++;
        for (const [, model] of frameModels(frame).$) {
          if (isEmptyModel(model)) continue;
          for (const poly of asArray(asGet(model, 'Shape_vList'))) {
            polygons++;
            vertices += asArray(poly).length / 2;
          }
        }
      }
    }
  });
  return { items: items.length, directionFrames, polygons, vertices };
}
