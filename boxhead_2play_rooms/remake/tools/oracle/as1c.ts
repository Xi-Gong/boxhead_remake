/**
 * as1c — a tiny ActionScript 1/2-subset compiler emitting AVM1 bytecode through ./avm1asm.ts.  OWNER: oracle lane
 *
 * Purpose: keep oracle probes readable. It mirrors the code shapes of the Macromedia Flash 8 compiler where that is
 * observable (object literal pairs pushed in source order before InitObject, array literal elements pushed in reverse
 * before InitArray, `a <= b` → Greater+Not, for..in via Enumerate2 + null sentinel, `var` in functions →
 * DefineLocal, functions via SWF5 DefineFunction so `this`/`arguments` are plain variables).
 *
 * Supported: var, function declarations/expressions (closures), if/else, while, do..while, for(;;), for..in (with
 * break/continue/return draining the enumeration stack), return, break, continue, blocks; expressions: literals
 * (number, string, true/false/null/undefined, object, array), identifiers, this, member/index access, calls, method
 * calls, new, assignment (=, op=), ++/--, unary - + ! ~ typeof delete void, binary arithmetic/bitwise/comparison/
 * equality (== != === !==), instanceof, && ||, ?:.
 * Intrinsics: trace(x) → Trace, getTimer() → GetTime, int(x) → ToInteger, random(n) → RandomNumber,
 * stop()/play() → Stop/Play, __double(n) → Push type 6 even for integers, __extends(Sub, Base) → Extends (what the
 * AS2 compiler emits for `class Sub extends Base`).
 * Not supported: switch, try/catch, with, labels, regex, class syntax, comma operator outside for(;;) headers.
 */
import { Asm, asDouble, reg } from './avm1asm.ts';

// ------------------------------------------------------------------------------------------------ lexer

type Tok =
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'p'; v: string; pos: number }
  | { t: 'eof'; pos: number };

const PUNCT = [
  '>>>=', '===', '!==', '>>>', '<<=', '>>=', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=',
  '%=', '&=', '|=', '^=', '<<', '>>', '{', '}', '(', ')', '[', ']', ';', ',', '.', '?', ':', '+', '-', '*', '/', '%',
  '&', '|', '^', '!', '~', '<', '>', '=',
];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const err = (m: string): never => { throw new Error(`as1c lex error at ${i}: ${m}\n${src.slice(Math.max(0, i - 40), i + 40)}`); };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) err('unterminated comment'); i = e + 2; continue; }
    const pos = i;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
      if (!m) err('bad number');
      out.push({ t: 'num', v: Number(m![1]), pos });
      i += m![1].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let s = '';
      i++;
      while (src[i] !== c) {
        if (i >= src.length) err('unterminated string');
        if (src[i] === '\\') {
          const e = src[i + 1];
          i += 2;
          if (e === 'n') s += '\n';
          else if (e === 't') s += '\t';
          else if (e === 'r') s += '\r';
          else if (e === 'x') { s += String.fromCharCode(parseInt(src.slice(i, i + 2), 16)); i += 2; }
          else if (e === 'u') { s += String.fromCharCode(parseInt(src.slice(i, i + 4), 16)); i += 4; }
          else s += e;
        } else s += src[i++];
      }
      i++;
      out.push({ t: 'str', v: s, pos });
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0], pos });
      i += m[0].length;
      continue;
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (!p) err(`unexpected character ${c}`);
    out.push({ t: 'p', v: p!, pos });
    i += p!.length;
  }
  out.push({ t: 'eof', pos: i });
  return out;
}

// ------------------------------------------------------------------------------------------------ AST

type Expr =
  | { k: 'num'; v: number; forceDouble?: boolean }
  | { k: 'str'; v: string }
  | { k: 'lit'; v: boolean | null | undefined }
  | { k: 'id'; name: string }
  | { k: 'member'; obj: Expr; prop: Expr }
  | { k: 'call'; callee: Expr; args: Expr[] }
  | { k: 'new'; callee: Expr; args: Expr[] }
  | { k: 'unary'; op: string; arg: Expr }
  | { k: 'update'; op: '++' | '--'; prefix: boolean; target: Expr }
  | { k: 'binary'; op: string; l: Expr; r: Expr }
  | { k: 'logical'; op: '&&' | '||'; l: Expr; r: Expr }
  | { k: 'cond'; test: Expr; cons: Expr; alt: Expr }
  | { k: 'assign'; op: string; target: Expr; value: Expr }
  | { k: 'func'; name: string; params: string[]; body: Stmt[] }
  | { k: 'object'; props: [string, Expr][] }
  | { k: 'array'; elems: Expr[] };

type Stmt =
  | { k: 'expr'; e: Expr }
  | { k: 'var'; decls: [string, Expr | null][] }
  | { k: 'if'; test: Expr; cons: Stmt; alt: Stmt | null }
  | { k: 'while'; test: Expr; body: Stmt }
  | { k: 'do'; body: Stmt; test: Expr }
  | { k: 'for'; init: Stmt | null; test: Expr | null; update: Expr[]; body: Stmt }
  | { k: 'forin'; isVar: boolean; name: string; obj: Expr; body: Stmt }
  | { k: 'return'; arg: Expr | null }
  | { k: 'break' }
  | { k: 'continue' }
  | { k: 'block'; body: Stmt[] }
  | { k: 'funcdecl'; f: Extract<Expr, { k: 'func' }> };

// ------------------------------------------------------------------------------------------------ parser

class Parser {
  private toks: Tok[];
  private i = 0;
  private src: string;
  constructor(src: string) { this.src = src; this.toks = lex(src); }

  private peek(o = 0): Tok { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  private next(): Tok { return this.toks[this.i++]; }
  private isP(v: string, o = 0): boolean { const t = this.peek(o); return t.t === 'p' && t.v === v; }
  private isId(v: string, o = 0): boolean { const t = this.peek(o); return t.t === 'id' && t.v === v; }
  private err(m: string): never {
    const pos = this.peek().pos;
    const line = this.src.slice(0, pos).split('\n').length;
    throw new Error(`as1c parse error line ${line}: ${m} near ${JSON.stringify(this.src.slice(pos, pos + 40))}`);
  }
  private eatP(v: string): void { if (!this.isP(v)) this.err(`expected '${v}'`); this.i++; }
  private ident(): string { const t = this.next(); if (t.t !== 'id') { this.i--; this.err('expected identifier'); } return (t as { v: string }).v; }
  private semi(): void { if (this.isP(';')) this.i++; }

  program(): Stmt[] {
    const body: Stmt[] = [];
    while (this.peek().t !== 'eof') body.push(this.statement());
    return body;
  }

  private block(): Stmt[] {
    this.eatP('{');
    const body: Stmt[] = [];
    while (!this.isP('}')) body.push(this.statement());
    this.eatP('}');
    return body;
  }

  private statement(): Stmt {
    if (this.isP('{')) return { k: 'block', body: this.block() };
    if (this.isP(';')) { this.i++; return { k: 'block', body: [] }; }
    if (this.isId('var')) { const s = this.varDecl(); this.semi(); return s; }
    if (this.isId('function') && this.peek(1).t === 'id') {
      this.i++;
      const name = this.ident();
      return { k: 'funcdecl', f: this.funcRest(name) };
    }
    if (this.isId('if')) {
      this.i++; this.eatP('(');
      const test = this.expression(); this.eatP(')');
      const cons = this.statement();
      let alt: Stmt | null = null;
      if (this.isId('else')) { this.i++; alt = this.statement(); }
      return { k: 'if', test, cons, alt };
    }
    if (this.isId('while')) {
      this.i++; this.eatP('(');
      const test = this.expression(); this.eatP(')');
      return { k: 'while', test, body: this.statement() };
    }
    if (this.isId('do')) {
      this.i++;
      const body = this.statement();
      if (!this.isId('while')) this.err('expected while');
      this.i++; this.eatP('(');
      const test = this.expression(); this.eatP(')'); this.semi();
      return { k: 'do', body, test };
    }
    if (this.isId('for')) {
      this.i++; this.eatP('(');
      if (this.isId('var') && this.peek(1).t === 'id' && this.isId('in', 2)) {
        this.i++;
        const name = this.ident(); this.i++;
        const obj = this.expression(); this.eatP(')');
        return { k: 'forin', isVar: true, name, obj, body: this.statement() };
      }
      if (this.peek().t === 'id' && this.isId('in', 1)) {
        const name = this.ident(); this.i++;
        const obj = this.expression(); this.eatP(')');
        return { k: 'forin', isVar: false, name, obj, body: this.statement() };
      }
      let init: Stmt | null = null;
      if (this.isId('var')) init = this.varDecl();
      else if (!this.isP(';')) {
        const es: Stmt[] = [{ k: 'expr', e: this.assignment() }];
        while (this.isP(',')) { this.i++; es.push({ k: 'expr', e: this.assignment() }); }
        init = es.length === 1 ? es[0] : { k: 'block', body: es };
      }
      this.eatP(';');
      const test = this.isP(';') ? null : this.expression();
      this.eatP(';');
      const update: Expr[] = [];
      if (!this.isP(')')) {
        update.push(this.assignment());
        while (this.isP(',')) { this.i++; update.push(this.assignment()); }
      }
      this.eatP(')');
      return { k: 'for', init, test, update, body: this.statement() };
    }
    if (this.isId('return')) {
      this.i++;
      const arg = this.isP(';') || this.isP('}') ? null : this.expression();
      this.semi();
      return { k: 'return', arg };
    }
    if (this.isId('break')) { this.i++; this.semi(); return { k: 'break' }; }
    if (this.isId('continue')) { this.i++; this.semi(); return { k: 'continue' }; }
    const e = this.expression();
    this.semi();
    return { k: 'expr', e };
  }

  private varDecl(): Stmt {
    this.i++; // var
    const decls: [string, Expr | null][] = [];
    do {
      if (decls.length) this.i++;
      const name = this.ident();
      let init: Expr | null = null;
      if (this.isP('=')) { this.i++; init = this.assignment(); }
      decls.push([name, init]);
    } while (this.isP(','));
    return { k: 'var', decls };
  }

  private funcRest(name: string): Extract<Expr, { k: 'func' }> {
    this.eatP('(');
    const params: string[] = [];
    while (!this.isP(')')) {
      if (params.length) this.eatP(',');
      params.push(this.ident());
      if (this.isP(':')) { this.i++; this.ident(); } // ignore AS2 type annotations
    }
    this.eatP(')');
    if (this.isP(':')) { this.i++; this.ident(); }
    return { k: 'func', name, params, body: this.block() };
  }

  expression(): Expr { return this.assignment(); }

  private assignment(): Expr {
    const l = this.conditional();
    const t = this.peek();
    if (t.t === 'p' && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>='].includes(t.v)) {
      if (l.k !== 'id' && l.k !== 'member') this.err('invalid assignment target');
      this.i++;
      return { k: 'assign', op: t.v, target: l, value: this.assignment() };
    }
    return l;
  }

  private conditional(): Expr {
    const test = this.binary(0);
    if (!this.isP('?')) return test;
    this.i++;
    const cons = this.assignment();
    this.eatP(':');
    return { k: 'cond', test, cons, alt: this.assignment() };
  }

  private static LEVELS: string[][] = [
    ['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>=', 'instanceof'],
    ['<<', '>>', '>>>'], ['+', '-'], ['*', '/', '%'],
  ];

  private binary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let l = this.binary(level + 1);
    for (;;) {
      const t = this.peek();
      const op = t.t === 'p' || t.t === 'id' ? t.v : '';
      if (!Parser.LEVELS[level].includes(op) || (t.t === 'id' && op !== 'instanceof')) return l;
      this.i++;
      const r = this.binary(level + 1);
      l = op === '&&' || op === '||' ? { k: 'logical', op, l, r } : { k: 'binary', op, l, r };
    }
  }

  private unary(): Expr {
    const t = this.peek();
    if (t.t === 'p' && ['-', '+', '!', '~'].includes(t.v)) {
      this.i++;
      const arg = this.unary();
      if (t.v === '-' && arg.k === 'num') return { k: 'num', v: -arg.v, forceDouble: arg.forceDouble };
      return { k: 'unary', op: t.v, arg };
    }
    if (t.t === 'p' && (t.v === '++' || t.v === '--')) {
      this.i++;
      return { k: 'update', op: t.v, prefix: true, target: this.unary() };
    }
    if (t.t === 'id' && ['typeof', 'delete', 'void'].includes(t.v)) {
      this.i++;
      return { k: 'unary', op: t.v, arg: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Expr {
    const e = this.callMember();
    if (this.isP('++') || this.isP('--')) {
      const op = this.next() as { v: '++' | '--' };
      return { k: 'update', op: op.v, prefix: false, target: e };
    }
    return e;
  }

  private args(): Expr[] {
    this.eatP('(');
    const a: Expr[] = [];
    while (!this.isP(')')) {
      if (a.length) this.eatP(',');
      a.push(this.assignment());
    }
    this.eatP(')');
    return a;
  }

  private callMember(): Expr {
    let e: Expr;
    if (this.isId('new')) {
      this.i++;
      let callee = this.primary();
      while (this.isP('.') || this.isP('[')) callee = this.memberSuffix(callee);
      const args = this.isP('(') ? this.args() : [];
      e = { k: 'new', callee, args };
    } else e = this.primary();
    for (;;) {
      if (this.isP('.') || this.isP('[')) e = this.memberSuffix(e);
      else if (this.isP('(')) e = { k: 'call', callee: e, args: this.args() };
      else return e;
    }
  }

  private memberSuffix(obj: Expr): Expr {
    if (this.isP('.')) {
      this.i++;
      return { k: 'member', obj, prop: { k: 'str', v: this.ident() } };
    }
    this.eatP('[');
    const prop = this.expression();
    this.eatP(']');
    return { k: 'member', obj, prop };
  }

  private primary(): Expr {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      if (t.v === 'undefined') return { k: 'lit', v: undefined };
      if (t.v === 'function') {
        const name = this.peek().t === 'id' ? this.ident() : '';
        return this.funcRest(name);
      }
      return { k: 'id', name: t.v };
    }
    if (t.t === 'p' && t.v === '(') { const e = this.expression(); this.eatP(')'); return e; }
    if (t.t === 'p' && t.v === '[') {
      const elems: Expr[] = [];
      while (!this.isP(']')) {
        if (elems.length) this.eatP(',');
        elems.push(this.assignment());
      }
      this.eatP(']');
      return { k: 'array', elems };
    }
    if (t.t === 'p' && t.v === '{') {
      const props: [string, Expr][] = [];
      while (!this.isP('}')) {
        if (props.length) this.eatP(',');
        const kt = this.next();
        if (kt.t === 'eof' || kt.t === 'p') { this.i--; this.err('bad object key'); }
        const key = kt.t === 'num' ? String(kt.v) : (kt as { v: string }).v;
        this.eatP(':');
        props.push([key, this.assignment()]);
      }
      this.eatP('}');
      return { k: 'object', props };
    }
    this.i--;
    return this.err('unexpected token');
  }
}

// ------------------------------------------------------------------------------------------------ codegen

interface Loop { brk: string; cont: string; forIn: boolean }

const BIN: Record<string, string[]> = {
  '+': ['Add2'], '-': ['Subtract'], '*': ['Multiply'], '/': ['Divide'], '%': ['Modulo'],
  '&': ['BitAnd'], '|': ['BitOr'], '^': ['BitXor'], '<<': ['BitLShift'], '>>': ['BitRShift'], '>>>': ['BitURShift'],
  '<': ['Less2'], '>': ['Greater'], '<=': ['Greater', 'Not'], '>=': ['Less2', 'Not'],
  '==': ['Equals2'], '!=': ['Equals2', 'Not'], '===': ['StrictEquals'], '!==': ['StrictEquals', 'Not'],
  instanceof: ['InstanceOf'],
};

class Gen {
  readonly a = new Asm();
  private loops: Loop[] = [];
  private inFunc: boolean;
  constructor(inFunc: boolean) { this.inFunc = inFunc; }

  stmts(ss: Stmt[]): void { for (const s of ss) this.stmt(s); }

  private stmt(s: Stmt): void {
    const a = this.a;
    switch (s.k) {
      case 'expr': this.exprStmt(s.e); break;
      case 'var':
        for (const [name, init] of s.decls) {
          if (this.inFunc) {
            a.push(name);
            if (init) { this.expr(init); a.op('DefineLocal'); } else a.op('DefineLocal2');
          } else if (init) { a.push(name); this.expr(init); a.op('SetVariable'); }
        }
        break;
      case 'funcdecl': this.func(s.f, s.f.name); break;
      case 'block': this.stmts(s.body); break;
      case 'if': {
        const lElse = a.newLabel('else'), lEnd = a.newLabel('endif');
        this.expr(s.test); a.op('Not').if(lElse);
        this.stmt(s.cons);
        if (s.alt) { a.jump(lEnd).label(lElse); this.stmt(s.alt); a.label(lEnd); } else a.label(lElse);
        break;
      }
      case 'while': {
        const lHead = a.newLabel('while'), lEnd = a.newLabel('wend');
        a.label(lHead);
        this.expr(s.test); a.op('Not').if(lEnd);
        this.loop({ brk: lEnd, cont: lHead, forIn: false }, s.body);
        a.jump(lHead).label(lEnd);
        break;
      }
      case 'do': {
        const lHead = a.newLabel('do'), lCont = a.newLabel('dcont'), lEnd = a.newLabel('dend');
        a.label(lHead);
        this.loop({ brk: lEnd, cont: lCont, forIn: false }, s.body);
        a.label(lCont);
        this.expr(s.test); a.if(lHead).label(lEnd);
        break;
      }
      case 'for': {
        const lHead = a.newLabel('for'), lCont = a.newLabel('fcont'), lEnd = a.newLabel('fend');
        if (s.init) this.stmt(s.init);
        a.label(lHead);
        if (s.test) { this.expr(s.test); a.op('Not').if(lEnd); }
        this.loop({ brk: lEnd, cont: lCont, forIn: false }, s.body);
        a.label(lCont);
        for (const u of s.update) this.exprStmt(u);
        a.jump(lHead).label(lEnd);
        break;
      }
      case 'forin': {
        const lHead = a.newLabel('forin'), lEnd = a.newLabel('fiend');
        this.expr(s.obj);
        a.op('Enumerate2').label(lHead).storeRegister(0).push(null).op('Equals2').if(lEnd);
        a.push(s.name, reg(0));
        a.op(this.inFunc && s.isVar ? 'DefineLocal' : 'SetVariable');
        this.loop({ brk: lEnd, cont: lHead, forIn: true }, s.body);
        a.jump(lHead).label(lEnd);
        break;
      }
      case 'break': {
        const l = this.loops[this.loops.length - 1];
        if (!l) throw new Error('as1c: break outside loop');
        if (l.forIn) { this.drain(); }
        a.jump(l.brk);
        break;
      }
      case 'continue': {
        const l = this.loops[this.loops.length - 1];
        if (!l) throw new Error('as1c: continue outside loop');
        a.jump(l.cont);
        break;
      }
      case 'return': {
        if (s.arg) this.expr(s.arg); else a.push(undefined);
        const n = this.loops.filter((l) => l.forIn).length;
        if (n) {
          a.storeRegister(0).op('Pop');
          for (let i = 0; i < n; i++) this.drain();
          a.push(reg(0));
        }
        a.op('Return');
        break;
      }
    }
  }

  /** Pop enumeration names up to and including the null sentinel. */
  private drain(): void {
    const a = this.a, l = a.newLabel('drain');
    a.label(l).push(null).op('Equals2', 'Not').if(l);
  }

  private loop(l: Loop, body: Stmt): void {
    this.loops.push(l);
    this.stmt(body);
    this.loops.pop();
  }

  private func(f: Extract<Expr, { k: 'func' }>, name: string): void {
    const g = new Gen(true);
    g.stmts(f.body);
    this.a.defineFunction(name, f.params, g.a);
  }

  /** Expression evaluated for side effects only (nothing left on the stack). */
  private exprStmt(e: Expr): void {
    const a = this.a;
    if (e.k === 'assign') { this.assign(e, false); return; }
    if (e.k === 'update') { this.update(e.target, e.op); return; }
    if (e.k === 'call' && e.callee.k === 'id' && e.callee.name === 'trace') {
      this.expr(e.args[0] ?? { k: 'lit', v: undefined }); a.op('Trace'); return;
    }
    if (e.k === 'call' && e.callee.k === 'id' && (e.callee.name === 'stop' || e.callee.name === 'play') && e.args.length === 0) {
      a.op(e.callee.name === 'stop' ? 'Stop' : 'Play'); return;
    }
    if (e.k === 'unary' && e.op === 'delete') { this.expr(e); a.op('Pop'); return; }
    this.expr(e);
    a.op('Pop');
  }

  private assign(e: Extract<Expr, { k: 'assign' }>, keep: boolean): void {
    const a = this.a, t = e.target;
    const valueCode = (): void => {
      if (e.op === '=') this.expr(e.value);
      else {
        this.expr(t);
        this.expr(e.value);
        a.op(...BIN[e.op.slice(0, -1)]);
      }
    };
    if (t.k === 'id') {
      if (keep) { valueCode(); a.op('PushDuplicate').push(t.name).op('StackSwap', 'SetVariable'); }
      else { a.push(t.name); valueCode(); a.op('SetVariable'); }
    } else if (t.k === 'member') {
      this.expr(t.obj); this.expr(t.prop); valueCode();
      if (keep) a.storeRegister(0).op('SetMember').push(reg(0));
      else a.op('SetMember');
    } else throw new Error('as1c: bad assignment target');
  }

  /** target = target ± 1 (statement form). */
  private update(t: Expr, op: '++' | '--'): void {
    const a = this.a, inc = op === '++' ? 'Increment' : 'Decrement';
    if (t.k === 'id') { a.push(t.name); this.expr(t); a.op(inc, 'SetVariable'); }
    else if (t.k === 'member') { this.expr(t.obj); this.expr(t.prop); this.expr(t); a.op(inc, 'SetMember'); }
    else throw new Error('as1c: bad ++/-- target');
  }

  expr(e: Expr): void {
    const a = this.a;
    switch (e.k) {
      case 'num': a.push(e.forceDouble ? asDouble(e.v) : e.v); break;
      case 'str': a.push(e.v); break;
      case 'lit': a.push(e.v); break;
      case 'id': a.push(e.name).op('GetVariable'); break;
      case 'member': this.expr(e.obj); this.expr(e.prop); a.op('GetMember'); break;
      case 'object':
        for (const [k, v] of e.props) { a.push(k); this.expr(v); }
        a.push(e.props.length).op('InitObject');
        break;
      case 'array':
        for (let i = e.elems.length - 1; i >= 0; i--) this.expr(e.elems[i]);
        a.push(e.elems.length).op('InitArray');
        break;
      case 'func': this.func(e, ''); break;
      case 'assign': this.assign(e, true); break;
      case 'update':
        if (e.prefix) { this.update(e.target, e.op); this.expr(e.target); }
        else { this.expr(e.target); this.update(e.target, e.op); }
        break;
      case 'cond': {
        const lCons = a.newLabel('cons'), lEnd = a.newLabel('cend');
        this.expr(e.test); a.if(lCons);
        this.expr(e.alt); a.jump(lEnd).label(lCons);
        this.expr(e.cons); a.label(lEnd);
        break;
      }
      case 'logical': {
        const lEnd = a.newLabel('lend');
        this.expr(e.l); a.op('PushDuplicate');
        if (e.op === '&&') a.op('Not');
        a.if(lEnd).op('Pop');
        this.expr(e.r);
        a.label(lEnd);
        break;
      }
      case 'binary': this.expr(e.l); this.expr(e.r); a.op(...BIN[e.op]); break;
      case 'unary':
        switch (e.op) {
          case '-': a.push(0); this.expr(e.arg); a.op('Subtract'); break;
          case '+': this.expr(e.arg); a.op('ToNumber'); break;
          case '!': this.expr(e.arg); a.op('Not'); break;
          case '~': this.expr(e.arg); a.push(asDouble(4294967295)).op('BitXor'); break;
          case 'typeof': this.expr(e.arg); a.op('TypeOf'); break;
          case 'void': this.expr(e.arg); a.op('Pop').push(undefined); break;
          case 'delete':
            if (e.arg.k === 'member') { this.expr(e.arg.obj); this.expr(e.arg.prop); a.op('Delete'); }
            else if (e.arg.k === 'id') a.push(e.arg.name).op('Delete2');
            else throw new Error('as1c: bad delete target');
            break;
          default: throw new Error(`as1c: unary ${e.op}`);
        }
        break;
      case 'call': this.call(e); break;
      case 'new': {
        for (let i = e.args.length - 1; i >= 0; i--) this.expr(e.args[i]);
        a.push(e.args.length);
        if (e.callee.k === 'id') a.push(e.callee.name).op('NewObject');
        else if (e.callee.k === 'member') { this.expr(e.callee.obj); this.expr(e.callee.prop); a.op('NewMethod'); }
        else { this.expr(e.callee); a.push(undefined).op('NewMethod'); }
        break;
      }
    }
  }

  private call(e: Extract<Expr, { k: 'call' }>): void {
    const a = this.a, c = e.callee;
    if (c.k === 'id') {
      switch (c.name) {
        case 'trace': this.expr(e.args[0]); a.op('Trace').push(undefined); return;
        case 'getTimer': a.op('GetTime'); return;
        case 'int': this.expr(e.args[0]); a.op('ToInteger'); return;
        case 'random': this.expr(e.args[0]); a.op('RandomNumber'); return;
        case '__extends': this.expr(e.args[0]); this.expr(e.args[1]); a.op('Extends').push(undefined); return;
        case '__double': {
          const x = e.args[0];
          if (x.k !== 'num') throw new Error('__double needs a numeric literal');
          a.push(asDouble(x.v));
          return;
        }
      }
    }
    for (let i = e.args.length - 1; i >= 0; i--) this.expr(e.args[i]);
    a.push(e.args.length);
    if (c.k === 'id' && c.name === 'super') a.push('super').op('GetVariable').push(undefined).op('CallMethod');
    else if (c.k === 'id') a.push(c.name).op('CallFunction');
    else if (c.k === 'member') { this.expr(c.obj); this.expr(c.prop); a.op('CallMethod'); }
    else { this.expr(c); a.push(undefined).op('CallMethod'); }
  }
}

/** Compile a top-level (timeline) script to DoAction bytecode (ends with ActionEndFlag). */
export function compileAS(src: string, opts: { end?: boolean } = {}): Uint8Array {
  const g = new Gen(false);
  g.stmts(new Parser(src).program());
  return g.a.assemble({ end: opts.end ?? true });
}

/** Compile to an Asm (to combine with hand-written code). */
export function compileToAsm(src: string): Asm {
  const g = new Gen(false);
  g.stmts(new Parser(src).program());
  return g.a;
}

/**
 * Common probe prelude: P(key, value) traces `PROBE:key=value`; J(v) is a compact JSON-ish serializer that
 * enumerates objects with for..in (so key order shown = AS2 enumeration order) and arrays by index.
 */
export const PRELUDE = `
function P(k, v) { trace("PROBE:" + k + "=" + v); }
function keysOf(o) { var s = ""; var first = true; for (var k in o) { s += (first ? "" : ",") + k; first = false; } return s; }
function hex8(n) {
  var d = "0123456789ABCDEF"; var s = ""; var i;
  if (n < 0) n += 4294967296;
  for (i = 0; i < 8; i++) { s = d.charAt(n % 16) + s; n = Math.floor(n / 16); }
  return s;
}
P("$version", $version);
`;
