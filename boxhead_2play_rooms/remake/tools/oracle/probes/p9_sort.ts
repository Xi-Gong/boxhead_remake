/**
 * P9: Array sorting tie order.
 *
 *  nav.<k>     EXHAUSTIVE World/Map/CMap_Cell.Nav_Direction case: 8 objects, `sortOn("nDist", RETURNINDEXEDARRAY |
 *              NUMERIC | DESCENDING)`, every assignment of nDist ∈ {absent(undefined), 0, 1, 2} to the 8 elements
 *              (4^8 = 65536 inputs). Input number c: element i gets VALS[(c >> 2i) & 3] with VALS = [undefined, 0, 1, 2].
 *              Line k holds inputs c = 256k .. 256k+255; each result is the 8 returned indices as digits.
 *  objdesc.<k> same flags without RETURNINDEXEDARRAY (sorts the array of objects; result = element ids), inputs over
 *              {undefined, 0, 1} (3^8 = 6561; element i gets VALS3[floor(c / 3^i) % 3]).
 *  asc5        RETURNINDEXEDARRAY | NUMERIC (ascending) over 5 elements {undefined, 0, 1} (243 inputs).
 *  cmp8        Array.sort(compareFunction) with a CMap_Cell._SortOrder-style comparator (-1/0/1, descending by key) over
 *              8 objects with key ∈ {0, 1} (256 inputs; element i gets bit i of c).
 *  misc.*      default sort() of numbers/undefined/null, sort(NUMERIC), sorting an Array that only has named
 *              properties (CMap_Cell.mObjects), sortOn without NUMERIC.
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

export const SRC = PRELUDE + `
var VALS = [undefined, 0, 1, 2];
var VALS3 = [undefined, 0, 1];
var FLAGS = Array.RETURNINDEXEDARRAY | Array.NUMERIC | Array.DESCENDING;
P("flags", FLAGS + "|" + Array.RETURNINDEXEDARRAY + "," + Array.NUMERIC + "," + Array.DESCENDING + "," + Array.UNIQUESORT + "," + Array.CASEINSENSITIVE);
var objs = new Array(); var i;
for (i = 0; i < 8; i++) { var o = new Object(); o.id = i; objs.push(o); }
var c = 0;
function setNav(cc) { var x = cc; var k; for (k = 0; k < 8; k++) { var v = VALS[x & 3]; x = x >> 2; if (v === undefined) delete objs[k].nDist; else objs[k].nDist = v; } }
function set3(cc, n) { var x = cc; var k; for (k = 0; k < n; k++) { var v = VALS3[x % 3]; x = Math.floor(x / 3); if (v === undefined) delete objs[k].nDist; else objs[k].nDist = v; } }
function ids(arr) { var s = ""; var k; for (k = 0; k < arr.length; k++) s += arr[k].id; return s; }
function misc() {
  var a = [10, 9, 1, 100, 2]; a.sort(); P("misc.default_numbers", a.join(","));
  a = [3, undefined, 1, null, "a", 2, "B"]; a.sort(); P("misc.default_mixed", a.join(","));
  a = [10, 9, 1, 100, 2, undefined, -1]; a.sort(Array.NUMERIC); P("misc.numeric_with_undefined", a.join(","));
  a = [10, 9, 1, 100, 2]; a.sort(Array.NUMERIC | Array.DESCENDING); P("misc.numeric_desc", a.join(","));
  a = [10, 9, 1, 100, 2]; var r = a.sort(Array.NUMERIC | Array.RETURNINDEXEDARRAY); P("misc.numeric_indexed", r.join(",") + "|" + a.join(","));
  a = [1, 2, 2]; r = a.sort(Array.UNIQUESORT); P("misc.uniquesort_dup", r + "|" + a.join(","));
  var ob = [{v: 10}, {v: 9}, {v: 100}]; r = ob.sortOn("v"); P("misc.sortOn_string_compare", r[0].v + "," + r[1].v + "," + r[2].v);
  var mo = new Array(); mo.t5 = {y: 1}; mo.t3 = {y: 0}; mo.t9 = {y: 2};
  mo.sort(function (p, q) { return p.y < q.y ? 1 : (p.y > q.y ? -1 : 0); });
  P("misc.named_only_array_sort", keysOf(mo) + "|len=" + mo.length);
  var und = [{n: 1}, {}, {n: 0}, {}, {n: 2}];
  P("misc.sortOn_numeric_undefined_asc", und.sortOn("n", Array.NUMERIC | Array.RETURNINDEXEDARRAY).join(","));
  P("misc.sortOn_numeric_undefined_desc", und.sortOn("n", Array.NUMERIC | Array.RETURNINDEXEDARRAY | Array.DESCENDING).join(","));
  var nn = [{n: 1}, {n: NaN}, {n: 0}, {n: "5"}, {n: -1}, {n: null}];
  P("misc.sortOn_numeric_nan_str_null_asc", nn.sortOn("n", Array.NUMERIC | Array.RETURNINDEXEDARRAY).join(","));
  P("misc.sortOn_numeric_nan_str_null_desc", nn.sortOn("n", Array.NUMERIC | Array.RETURNINDEXEDARRAY | Array.DESCENDING).join(","));
  var big = [{n: 10}, {n: 9}, {n: 100}, {n: -5}, {n: 2.5}];
  P("misc.sortOn_numeric_desc_distinct", big.sortOn("n", FLAGS).join(","));
}
// Everything runs synchronously in frame 1: the FP32 projector's EOL kill-switch stops content ~100 ms after start,
// but cannot interrupt a running script (ScriptLimits raises the script timeout to 60 s).
var r; var line = "";
for (c = 0; c < 65536; c++) {
  setNav(c);
  r = objs.sortOn("nDist", FLAGS);
  line += r.join("");
  if ((c & 255) == 255) { P("nav." + (c >> 8), line); line = ""; }
}
for (c = 0; c < 6561; c++) {
  set3(c, 8);
  var cp = objs.slice(0);
  cp.sortOn("nDist", Array.NUMERIC | Array.DESCENDING);
  line += ids(cp);
  if ((c & 255) == 255 || c == 6560) { P("objdesc." + (c >> 8), line); line = ""; }
}
var five = objs.slice(0, 5);
for (c = 0; c < 243; c++) { set3(c, 5); line += five.sortOn("nDist", Array.NUMERIC | Array.RETURNINDEXEDARRAY).join(""); }
P("asc5", line); line = "";
var cmp = function (a, b) { var p = a.k; var q = b.k; return p <= q ? (p >= q ? 0 : 1) : -1; };
for (c = 0; c < 256; c++) {
  var k; var arr = new Array();
  for (k = 0; k < 8; k++) { var ob = new Object(); ob.id = k; ob.k = (c >> k) & 1; arr.push(ob); }
  arr.sort(cmp);
  line += ids(arr);
}
P("cmp8", line); line = "";
misc();
trace("PROBE:END");
`;

export const VALS = [undefined, 0, 1, 2] as const;
export const VALS3 = [undefined, 0, 1] as const;

export const p9: ProbeDef = {
  id: 'p9_sort',
  title: 'Array.sortOn / sort tie order (exhaustive CMap_Cell.Nav_Direction case)',
  timeoutMs: 180000,
  build: () => singleFrameSwf(compileAS(SRC)),
};
