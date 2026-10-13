/**
 * P0: tool-chain self tests.
 *  - p0_hello: raw assembler (no compiler) — trace, int/double pushes, a branch.
 *  - p0_as1c: the mini compiler (as1c) — every construct the other probes use, with expected values that hold in
 *    AVM1 (the unit test checks `results[k] === expected[k]`). Note AVM1 `typeof null` is "null" (not "object").
 */
import { Asm } from '../avm1asm.ts';
import { compileAS, PRELUDE } from '../as1c.ts';
import { singleFrameSwf } from '../swfWrite.ts';
import type { ProbeDef } from './index.ts';

export const p0: ProbeDef = {
  id: 'p0_hello',
  title: 'Smoke test: raw assembler trace + double/int push round-trip',
  build() {
    const a = new Asm();
    a.traceProbe('$version', (x) => x.push('$version').op('GetVariable'));
    a.traceLine('PROBE:hello=1');
    a.traceProbe('double', (x) => x.push(0.1));
    a.traceProbe('int', (x) => x.push(-123456));
    a.traceProbe('sum', (x) => x.push(1, 2).op('Add2'));
    const l = a.newLabel();
    a.push(true).op('Not').if(l).traceLine('PROBE:branch=taken').label(l);
    a.traceLine('PROBE:END');
    return singleFrameSwf(a.assemble({ end: true }));
  },
};

/** Expected results of p0_as1c (shared with tests/unit/oracle). */
export const AS1C_EXPECTED: Record<string, string> = {
  arith: '17', prec: '-7', str: 'ab3', cmp: 'true,false,true,true,false', eq: 'true,false,true,false',
  logic: '0,5,x,7', cond: 'big', loopSum: '45', whileSum: '10', doCount: '3', breakCont: '0,1,3,4',
  closure: '3', fnRet: '42', method: '12', newObj: '7,8', arrLit: '3,30', objLit: '2', compound: '13,26,2',
  incdec: '5,6,6,5', member: '9', nested: '5', typeofs: 'number,string,boolean,undefined,null,function,movieclip',
  deleted: 'undefined', forInBreak: '1', forInReturn: 'found', forInNested: '4', bitops: '1,7,6,-8,4,1073741823',
  unary: '-5,true,-4', args: '3', applyCall: '6', ext: 'base,sub,true', getTimerType: 'number', intr: '3,-3',
  strEsc: 'a"b\'c\\d', regs: '11', recursion: '120',
};

export const p0b: ProbeDef = {
  id: 'p0_as1c',
  title: 'Compiler self-test (as1c constructs)',
  build() {
    const src = PRELUDE + `
P("arith", 2 + 3 * 5);
P("prec", 1 - 2 * 4);
P("str", "a" + "b" + 3);
P("cmp", (1 < 2) + "," + (2 < 1) + "," + (2 <= 2) + "," + (3 >= 2) + "," + (1 > 2));
P("eq", (1 == 1) + "," + (1 != 1) + "," + ("a" === "a") + "," + (1 === "1"));
P("logic", (0 && 5) + "," + (1 && 5) + "," + (0 || "x") + "," + (7 || 8));
P("cond", 10 > 5 ? "big" : "small");
var s = 0; for (var i = 0; i < 10; i++) { s += i; } P("loopSum", s);
var w = 0; var j = 0; while (j < 5) { w = w + j; j++; } P("whileSum", w);
var dc = 0; do { dc++; } while (dc < 3); P("doCount", dc);
var bc = ""; for (i = 0; i < 10; i++) { if (i == 2) continue; if (i == 5) break; bc += (bc == "" ? "" : ",") + i; } P("breakCont", bc);
function mk() { var n = 0; return function () { n++; return n; }; }
var ctr = mk(); ctr(); ctr(); P("closure", ctr());
function f42() { return 42; } P("fnRet", f42());
var o = new Object(); o.k = 4; o.m = function (x) { return this.k * x; }; P("method", o.m(3));
function Pt(x, y) { this.x = x; this.y = y; } var pt = new Pt(7, 8); P("newObj", pt.x + "," + pt.y);
var ar = [10, 20, 30]; P("arrLit", ar.length + "," + ar[2]);
var ol = {a: 1, b: 2}; P("objLit", ol.b);
var c1 = 10; c1 += 3; var c2 = new Object(); c2.v = 13; c2.v *= 2; var c3 = 7; c3 %= 5; P("compound", c1 + "," + c2.v + "," + c3);
var u = 5; var r1 = u++; var r2 = u; var r3 = u--; var r4 = u; P("incdec", r1 + "," + r2 + "," + r3 + "," + r4);
var mo = new Object(); mo.inner = new Object(); mo.inner["v"] = 9; P("member", mo["inner"].v);
var nest = {p: {q: [1, {r: 5}]}}; P("nested", nest.p.q[1].r);
P("typeofs", typeof 1 + "," + typeof "s" + "," + typeof true + "," + typeof undefined + "," + typeof null + "," + typeof f42 + "," + typeof _root);
var dd = new Object(); dd.z = 1; delete dd.z; P("deleted", dd.z);
function fib() { var o2 = {a: 1, b: 2, c: 3}; var n = 0; for (var k in o2) { n++; if (n == 1) break; } return n; }
P("forInBreak", fib());
function fir() { var o3 = {a: 1, b: 2, c: 3}; for (var k in o3) { if (k == "b") return "found"; } return "no"; }
P("forInReturn", fir());
function fin() { var n = 0; var o4 = {a: 1, b: 2}; for (var k in o4) { for (var k2 in o4) { n++; } } return n; }
P("forInNested", fin());
P("bitops", (5 & 3) + "," + (5 | 3) + "," + (5 ^ 3) + "," + (~7) + "," + (1 << 2) + "," + (-1 >>> 2));
var un = 5; P("unary", (-un) + "," + (!0) + "," + (~3));
function cnt() { return arguments.length; } P("args", cnt(1, 2, 3));
function add3(a, b, c) { return a + b + c; } P("applyCall", add3.apply(null, [1, 2, 3]));
function Base() { this.b = "base"; } Base.prototype.who = function () { return "base"; };
function Sub() { super(); } __extends(Sub, Base); Sub.prototype.who = function () { return "sub"; };
var sb = new Sub(); P("ext", sb.b + "," + sb.who() + "," + (sb instanceof Base));
P("getTimerType", typeof getTimer());
P("intr", int(3.7) + "," + int(-3.7));
P("strEsc", "a\\"b'c\\\\d");
var rg = 1; rg = rg + (rg = 10); P("regs", rg);
function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); } P("recursion", fact(5));
trace("PROBE:END");
`;
    return singleFrameSwf(compileAS(src));
  },
};
