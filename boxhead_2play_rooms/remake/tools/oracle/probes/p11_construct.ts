/**
 * P11: MovieClip construction order (AS2 registered classes) — what lane E's DisplayObject/attachMovie must mimic.
 *
 * Library (all sprites empty except for their children / frame scripts):
 *   B  (class CB)  frame 1 script logs "B.f1 <name>"
 *   D  (class CD)  frame 1 script logs "D.f1"
 *   C  (no class)  places D as "d"
 *   A  (class CA)  frame 1 places B as "b1" (depth 1), B as "b2" (depth 2), C as "c" (depth 3); frame 1 script "A.f1";
 *                  frame 2 places B as "b3" (depth 4) and logs "A.f2"
 *   R  (no class)  places B as "rb" — attached from inside CA2's constructor (the CWorld pattern)
 *   A2 (class CA2) constructor: this.attachMovie("R", "r", 1) and logs what it sees
 * Root timeline: frame 1 attaches A ("a1", with initObject {initProp: 7}) and A2 ("a2"); frame 2 places A as
 * "placedA" (PlaceObject2, depth 20) and logs "root.f2"; frame 4 dumps the log.
 * Every constructor logs: whether its parent's constructor already finished, whether its own children exist / were
 * constructed, and initObject visibility; onLoad handlers log too; "tick" lines mark enterFrame boundaries. On tick 1
 * the root onEnterFrame handler attaches A ("h1") and A2 ("h2") — the way CMain attaches "World" — and counts
 * constructor calls (_global.__n) during each attachMovie.
 * Result: log.<n> = event (in order).
 */
import { compileAS, PRELUDE } from '../as1c.ts';
import { SwfBuilder, doActionTag, placeObject2 } from '../swfWrite.ts';
import { soPrelude } from '../sol.ts';
import { FP28 } from './p8_game.ts';
import { resolve } from 'node:path';
import type { ProbeDef } from './index.ts';

const LIB = `
_global.__log = new Array();
function L(s) { _global.__log.push(s); }
function st(o) { return o == undefined ? "undef" : (o.__ctorDone ? "built" : "raw"); }
_global.CB = function () { _global.__n++; L("ctor CB " + this._name + " parent=" + st(this._parent) + " init=" + this.initProp); this.__ctorDone = true; };
_global.CB.prototype = new MovieClip();
_global.CB.prototype.onLoad = function () { L("onLoad " + this._name); };
_global.CD = function () { _global.__n++; L("ctor CD " + this._name + " parent=" + st(this._parent) + " grandparent=" + st(this._parent._parent)); this.__ctorDone = true; };
_global.CD.prototype = new MovieClip();
_global.CD.prototype.onLoad = function () { L("onLoad " + this._name); };
_global.CA = function () {
  _global.__n++;
  L("ctor CA " + this._name + " init=" + this.initProp + " b1=" + st(this.b1) + " b2=" + st(this.b2) + " c=" + typeof this.c + " c.d=" + st(this.c.d) + " frame=" + this._currentframe);
  this.__ctorDone = true;
};
_global.CA.prototype = new MovieClip();
_global.CA.prototype.onLoad = function () { L("onLoad " + this._name + " b1=" + st(this.b1)); };
_global.CA2 = function () {
  _global.__n++;
  L("ctor CA2 begin " + this._name);
  var r = this.attachMovie("R", "r", 1);
  L("ctor CA2 after attach R: r=" + typeof r + " r.rb=" + st(r.rb));
  this.__ctorDone = true;
};
_global.CA2.prototype = new MovieClip();
Object.registerClass("A", _global.CA);
Object.registerClass("A2", _global.CA2);
Object.registerClass("B", _global.CB);
Object.registerClass("D", _global.CD);
var __tick = 0;
_global.__n = 0;
_root.onEnterFrame = function () {
  __tick++;
  L("tick " + __tick + " frame=" + _root._currentframe + " ctors=" + _global.__n + " a1.b1=" + st(_root.a1.b1) + " a1.b3=" + st(_root.a1.b3) + " a2.r.rb=" + st(_root.a2.r.rb) + " placedA=" + st(_root.placedA) + " h2.r.rb=" + st(_root.h2.r.rb) + " h1.b1=" + st(_root.h1.b1));
  if (__tick == 1) {
    // attachMovie from an onEnterFrame handler (how CMain attaches "World")
    var n0 = _global.__n;
    var h1 = _root.attachMovie("A", "h1", 30);
    var n1 = _global.__n;
    var h2 = _root.attachMovie("A2", "h2", 31);
    var n2 = _global.__n;
    L("handler attach: ctors during A=" + (n1 - n0) + " during A2=" + (n2 - n1));
    L("handler attach: h1=" + st(h1) + " h1.b1=" + st(h1.b1) + " ctors=" + _global.__n);
    L("handler attach: h2=" + st(h2) + " h2.r=" + typeof h2.r + " h2.r.rb=" + st(h2.r.rb) + " ctors=" + _global.__n);
  }
};
L("attach A begin");
var a1 = _root.attachMovie("A", "a1", 1, {initProp: 7});
L("attach A returned: a1=" + st(a1) + " b1=" + st(a1.b1) + " b2=" + st(a1.b2) + " c.d=" + st(a1.c.d) + " init=" + a1.initProp);
L("access again: b1=" + st(a1.b1));
var a2 = _root.attachMovie("A2", "a2", 2);
L("attach A2 returned: a2=" + st(a2) + " r.rb=" + st(a2.r.rb));
var e = _root.createEmptyMovieClip("e", 3); var eb = e.attachMovie("B", "eb", 1);
L("attach B into empty clip returned: eb=" + st(eb));
L("frame1 script end");
`;

const FRAME2 = `L("root.f2 placedA=" + st(_root.placedA) + " placedA.b1=" + st(_root.placedA.b1));`;

function dumpCode(end: string): string {
  return `L("root.f4"); var i; for (i = 0; i < _global.__log.length; i++) P("log." + i, _global.__log[i]); delete _root.onEnterFrame; stop(); ${end}`;
}

function build(prelude: string, end: string, frameRate: number): Uint8Array {
  const b = new SwfBuilder({ width: 400, height: 300, frameRate }).fileAttributes(0).backgroundColor(0xffffff).scriptLimits(1000, 60);
  b.doAction(compileAS(prelude, { end: true }));
  b.defineSprite(10, [[doActionTag(compileAS('_global.__log.push("B.f1 " + this._name);'))]]);
  b.defineSprite(11, [[doActionTag(compileAS('_global.__log.push("D.f1 " + this._name);'))]]);
  b.defineSprite(12, [[placeObject2({ depth: 1, charId: 11, name: 'd' })]]);
  b.defineSprite(13, [
    [placeObject2({ depth: 1, charId: 10, name: 'b1' }), placeObject2({ depth: 2, charId: 10, name: 'b2' }), placeObject2({ depth: 3, charId: 12, name: 'c' }),
      doActionTag(compileAS('_global.__log.push("A.f1 " + this._name + " b1=" + (this.b1.__ctorDone ? "built" : "raw"));'))],
    [placeObject2({ depth: 4, charId: 10, name: 'b3' }), doActionTag(compileAS('_global.__log.push("A.f2 " + this._name); stop();'))],
  ]);
  b.defineSprite(14, [[placeObject2({ depth: 1, charId: 10, name: 'rb' })]]);
  b.defineSprite(15, [[]]);
  b.exportAssets([{ id: 13, name: 'A' }, { id: 15, name: 'A2' }, { id: 14, name: 'R' }, { id: 10, name: 'B' }, { id: 11, name: 'D' }, { id: 12, name: 'C' }]);
  b.doAction(compileAS(LIB)).showFrame();
  b.placeObject2({ depth: 20, charId: 13, name: 'placedA' }).doAction(compileAS(FRAME2)).showFrame();
  b.showFrame();
  b.doAction(compileAS(dumpCode(end))).showFrame();
  return b.build();
}

export const p11: ProbeDef = {
  id: 'p11_construct',
  title: 'Construction order of registered-class clips (attachMovie, nested attach in ctor, timeline placement)',
  notes: ['FP32 debug projector: frames 1-4 run at 60 fps inside the ~100 ms window before the EOL kill switch.'],
  build: () => build(PRELUDE, 'trace("PROBE:END");', 60),
};

/** Same probe in the release projectors that have no kill switch (SharedObject channel). */
export const p11fp28: ProbeDef = {
  id: 'p11_construct_fp28', title: 'P11 in FlashPlayer28 (SharedObject channel)', channel: 'so', player: FP28,
  build: () => build(soPrelude('oracle_p11_construct_fp28'), 'END();', 30),
};
export const p11fp8: ProbeDef = {
  id: 'p11_construct_fp8', title: 'P11 in Flash Player 8 (SharedObject channel)', channel: 'so', player: resolve(FP28, '..', 'FlashPlayer8.exe'),
  build: () => build(soPrelude('oracle_p11_construct_fp8'), 'END();', 30),
};
