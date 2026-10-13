/**
 * P1: for..in enumeration order (AVM1 Enumerate2) for every object shape the game creates.
 * Each result is the comma-joined key list in the order Flash enumerates it.
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

const lit40 = `{${Array.from({ length: 40 }, (_, i) => `p${i}:${i}`).join(',')}}`;

export const SRC = PRELUDE + `
// --- plain objects
P("initObject_abc", keysOf({a: 1, b: 2, c: 3}));
P("initObject_cba", keysOf({c: 1, b: 2, a: 3}));
P("initObject_40", keysOf(${lit40}));
var dup = {a: 1, b: 2, a: 3}; P("initObject_dupkey", keysOf(dup) + "|a=" + dup.a);
var s = new Object(); s.a = 1; s.b = 2; s.c = 3; P("setMember_abc", keysOf(s));
var d = new Object(); d.a = 1; d.b = 2; d.c = 3; delete d.b; P("delete_b", keysOf(d));
d.b = 4; P("delete_b_readd", keysOf(d));
d.a = 5; P("overwrite_a", keysOf(d));
var d2 = {a: 1, b: 2, c: 3}; delete d2.a; d2.a = 1; P("initObject_delete_a_readd", keysOf(d2));
var d3 = {a: 1, b: 2, c: 3}; delete d3.c; d3.c = 1; P("initObject_delete_c_readd", keysOf(d3));
var nk = new Object(); nk["3"] = 1; nk["1"] = 1; nk["2"] = 1; nk["10"] = 1; nk.x = 1; nk["0"] = 1; P("numericKeys", keysOf(nk));
var t = new Object(); for (var i = 1; i <= 12; i++) t["t" + i] = i; P("t1_t12", keysOf(t));
var big = new Object(); for (i = 0; i < 100; i++) big["k" + i] = i; P("k0_k99", keysOf(big));
delete big.k50; delete big.k0; big.k0 = 1; big.k100 = 1; P("k0_k99_mutated", keysOf(big));
var big2 = new Object(); for (i = 0; i < 300; i++) big2["t" + (i * 7 % 300)] = i; P("t_300_scrambled", keysOf(big2));
var vt = new Object(); vt.a = undefined; vt.b = null; vt.c = 0; P("undefinedValues", keysOf(vt));
var cs = new Object(); cs.B = 1; cs.b = 2; cs.A = 3; P("caseKeys", keysOf(cs));
// --- arrays
P("initArray_3", keysOf([10, 20, 30]));
var ap = new Array(); ap.push(1); ap.push(2); ap.push(3); P("push_3", keysOf(ap));
ap.foo = 1; ap.bar = 2; P("push_3_named", keysOf(ap));
var an = new Array(); an.foo = 1; an.push(5); an.bar = 2; an.push(6); P("named_interleaved", keysOf(an));
var sp = new Array(); sp[5] = 1; sp[2] = 1; sp[0] = 1; P("sparse_5_2_0", keysOf(sp) + "|len=" + sp.length);
var a4 = [1, 2, 3, 4]; a4.pop(); a4.push(9); P("pop_push", keysOf(a4));
a4.shift(); P("shift", keysOf(a4)); a4.unshift(0); P("unshift", keysOf(a4));
var spl = [1, 2, 3, 4, 5]; spl.splice(1, 2); P("splice", keysOf(spl));
var na3 = new Array(3); P("newArray3", keysOf(na3) + "|len=" + na3.length);
var al = [1, 2, 3]; al.length = 5; al[6] = 1; P("length_extend", keysOf(al) + "|len=" + al.length);
var au = [1, undefined, 3]; P("initArray_undefined", keysOf(au));
var ad = [1, 2, 3]; delete ad[1]; P("array_delete_1", keysOf(ad) + "|len=" + ad.length);
var aonly = new Array(); aonly.t5 = 1; aonly.t3 = 2; aonly.t9 = 3; P("array_named_only", keysOf(aonly) + "|len=" + aonly.length);
var a12 = new Array(); for (i = 0; i < 12; i++) a12.push(i); P("push_12", keysOf(a12));
var acc = new Array(); for (i = 0; i < 5; i++) acc[i] = i; P("index_assign_5", keysOf(acc));
var arev = new Array(); for (i = 4; i >= 0; i--) arev[i] = i; P("index_assign_rev_5", keysOf(arev));
// --- nested
var ne = {x: {p: 1, q: 2}, y: [1, 2], z: 3}; P("nested_outer", keysOf(ne)); P("nested_inner_obj", keysOf(ne.x)); P("nested_inner_arr", keysOf(ne.y));
// --- AS2 class instances (compiled-class pattern: prototype members hidden with ASSetPropFlags(proto, null, 1))
_global.C = function () { this.inst1 = 1; this.inst2 = 2; };
var cp = _global.C.prototype; cp.pm = function () {}; cp.pv = 5; cp._CLASSID_ = "C"; ASSetPropFlags(cp, null, 1);
var c = new C(); P("class_instance", keysOf(c));
c.pv = 6; P("class_instance_shadow_pv", keysOf(c));
c.later = 1; P("class_instance_added", keysOf(c));
_global.E = function () { super(); this.e1 = 1; }; __extends(_global.E, _global.C);
var ep = _global.E.prototype; ep.em = function () {}; ep.ev = 2; ASSetPropFlags(ep, null, 1);
var e = new E(); P("subclass_instance", keysOf(e));
function D() { this.i1 = 1; } D.prototype.dm = function () {}; D.prototype.dv = 1;
var dd = new D(); dd.i2 = 2; P("proto_visible", keysOf(dd));
dd.dv = 3; P("proto_visible_shadowed", keysOf(dd));
function F() { this.f1 = 1; } F.prototype = new D(); F.prototype.fp = 1;
var ff = new F(); P("proto_chain_visible", keysOf(ff));
var h = {a: 1, b: 2, c: 3}; ASSetPropFlags(h, "b", 1); P("assetpropflags_hide_b", keysOf(h));
Object.prototype.zz = 1; P("object_prototype_added", keysOf({a: 1})); delete Object.prototype.zz;
// --- movie clips (children + user variables)
var mc = _root.createEmptyMovieClip("mcA", 1); mc.v1 = 1; mc.createEmptyMovieClip("ch1", 1); mc.createEmptyMovieClip("ch2", 2);
mc.v2 = 2; mc.createEmptyMovieClip("ch0", 0); mc.createEmptyMovieClip("chNeg", -5);
P("movieclip", keysOf(mc));
mc.ch1.swapDepths(10); P("movieclip_swapDepths", keysOf(mc));
// --- enumeration while mutating
var mut = {a: 1, b: 2, c: 3}; var seen = ""; for (var k in mut) { seen += k; if (k == "a") { delete mut.b; mut.z = 1; } } P("mutate_during_delete_unvisited", seen);
var arc = new Array(1, 2, 3); P("arrayCtor_3", keysOf(arc));
var asl = [1, 2, 3].slice(0); P("slice", keysOf(asl));
var acn = [1, 2].concat([3, 4]); P("concat", keysOf(acn));
var arv = [1, 2, 3]; arv.reverse(); P("reverse", keysOf(arv));
var aso = [3, 1, 2]; aso.sort(); P("sort", keysOf(aso));
var asi = [1, 2, 3]; asi.splice(1, 0, 9, 8); P("splice_insert", keysOf(asi));
var alz = [1, 2, 3]; alz.length = 0; alz.push(4); alz.push(5); P("length0_push", keysOf(alz));
var aap = [1, 2]; aap[2] = 3; aap.push(4); P("index_then_push", keysOf(aap));
var omx = new Object(); omx.b = 1; omx[2] = 1; omx.a = 1; omx[1] = 1; P("object_mixed_numeric", keysOf(omx));
// --- functions and _global packages
var fo = function () {}; fo.s1 = 1; fo.s2 = 2; P("function_statics", keysOf(fo));
P("undefined", keysOf(undefined) + "|"); P("number", keysOf(5) + "|"); P("string", keysOf("abc") + "|");
trace("PROBE:END");
`;

const split = (v: string): string[] => (v === '' ? [] : v.split(','));

export const p1: ProbeDef = {
  id: 'p1_forin',
  title: 'for..in enumeration order (objects, arrays, class instances, movie clips)',
  build: () => singleFrameSwf(compileAS(SRC)),
  derive(r) {
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(r)) out[k] = split(v.split('|')[0]);
    return out;
  },
};
