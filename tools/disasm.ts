/**
 * AVM1 deobfuscating disassembler CLI.
 *
 *   node tools/disasm.ts [--swf <path>] [--out <dir>] [--instructions] [--dot] [--only <substring>]
 *
 * Writes generated/disasm/:
 *   <Class.Path>.txt                       one file per class DoInitAction (all methods, pseudo-code + offsets)
 *   initaction_sprite<id>[_<export>].txt   non-class DoInitActions (Object.registerClass …)
 *   root_frame_<n>[_<i>].txt                main timeline frame scripts
 *   sprite_<id>_frame_<n>[_<export>].txt   sprite frame scripts
 *   button_<id>_<k>.txt / clip_<sprite>_f<n>_d<depth>_<k>.txt   button / clip event actions
 *   INDEX.md                               table of every unit
 * and generated/reports/gettimer.md (every getTimer() call site per class/method).
 *
 * Offsets are ABSOLUTE in the decompressed SWF buffer; use them for `// [BC] <file> @<offset>` tags.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SwfFile } from './swf/SwfFile.ts';
import { SWF_PATH, SWF_SHA256, GENERATED, AS2_DIR, isMain } from './paths.ts';
import { enumerateActions, exportNames, clipEventNames, buttonCondNames, type ActionSource } from './avm1/actionSources.ts';
import { analyzeUnit, renderUnit, renderListing, type UnitResult } from './avm1/unit.ts';
import { selfCheck } from './avm1/selfcheck.ts';
import { renderTree } from './avm1/decompile.ts';
import { quote } from './avm1/opcodes.ts';
import { buildHotspots } from './avm1/hotspots.ts';

export interface DisasmEntry {
  source: ActionSource;
  file: string;
  title: string;
  unit: UnitResult;
}

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_');

/** Analyze every action unit of the SWF and compute output file names. */
export function disassembleAll(swf: SwfFile): DisasmEntry[] {
  const exps = exportNames(swf);
  const sources = enumerateActions(swf);
  const entries: DisasmEntry[] = [];
  const used = new Set<string>();
  const uniq = (base: string) => {
    let f = base, i = 2;
    while (used.has(f.toLowerCase())) f = base.replace(/\.txt$/, `_${i++}.txt`);
    used.add(f.toLowerCase());
    return f;
  };
  for (const src of sources) {
    if (src.end - src.start < 1) continue;
    const unit = analyzeUnit(swf.data, { start: src.start, end: src.end });
    const exp = exps.get(src.spriteId)?.[0];
    let file: string, title: string;
    switch (src.kind) {
      case 'initaction':
        if (unit.classPath) {
          file = `${sanitize(unit.classPath)}.txt`;
          title = `class ${unit.classPath} — DoInitAction for sprite ${src.spriteId}${exp ? ` (${exp})` : ''}`;
        } else {
          file = `initaction_sprite${src.spriteId}${exp ? '_' + sanitize(exp) : ''}.txt`;
          title = `DoInitAction for sprite ${src.spriteId}${exp ? ` (${exp})` : ''}` +
            (unit.registerClass.length ? ` — registerClass ${unit.registerClass.map(([a, b]) => `${quote(a)} -> ${b}`).join(', ')}` : '');
        }
        break;
      case 'frame':
        if (src.spriteId === 0) {
          file = `root_frame_${src.frame}${src.index ? '_' + (src.index + 1) : ''}.txt`;
          title = `main timeline frame ${src.frame} DoAction #${src.index + 1}`;
        } else {
          file = `sprite_${src.spriteId}_frame_${src.frame}${src.index ? '_' + (src.index + 1) : ''}${exp ? '_' + sanitize(exp) : ''}.txt`;
          title = `sprite ${src.spriteId}${exp ? ` (${exp})` : ''} frame ${src.frame} DoAction #${src.index + 1}`;
        }
        break;
      case 'button':
        file = `button_${src.buttonId}_${src.index + 1}.txt`;
        title = `button ${src.buttonId}${exps.get(src.buttonId!)?.[0] ? ` (${exps.get(src.buttonId!)![0]})` : ''} condition ${buttonCondNames(src.conditions ?? 0)}`;
        break;
      case 'clipaction':
        file = `clip_${src.spriteId === 0 ? 'root' : 'sprite' + src.spriteId}_f${src.frame}_d${src.depth}_${src.index + 1}.txt`;
        title = `clip actions on(${clipEventNames(src.conditions ?? 0)}) for depth ${src.depth}${src.instanceName ? ` "${src.instanceName}"` : ''}` +
          `${src.characterId !== undefined ? ` char ${src.characterId}` : ''} in ${src.spriteId === 0 ? 'root' : 'sprite ' + src.spriteId} frame ${src.frame}`;
        break;
    }
    entries.push({ source: src, file: uniq(file), title, unit });
  }
  return entries;
}

/** Every getTimer() use, per unit/function, as rendered lines with offsets. */
export interface GetTimerSite {
  file: string;
  func: string;
  /** Rendered statement containing the call(s). */
  line: string;
  /** Offset of that statement. */
  offset: number;
  /** Offsets of the GetTime (0x34) opcodes belonging to the statement. */
  opcodes: number[];
}

export function getTimerSites(entries: DisasmEntry[]): GetTimerSite[] {
  const out: GetTimerSite[] = [];
  for (const e of entries) {
    const scan = (func: string, lines: string[], ex: UnitResult['explored']) => {
      const pcs = [...new Set(ex.nodes.filter(n => n.ins?.name === 'GetTime' && !n.folded).map(n => n.pc))].sort((a, b) => a - b);
      const sites: GetTimerSite[] = [];
      for (const l of lines) {
        if (!l.includes('getTimer()')) continue;
        const m = /@(\d+)/.exec(l);
        sites.push({ file: e.file, func, line: l.trim(), offset: m ? Number(m[1]) : -1, opcodes: [] });
      }
      // attach each opcode to the first statement ending at or after it
      const byOff = [...sites].sort((a, b) => a.offset - b.offset);
      for (const pc of pcs) {
        const s = byOff.find(x => x.offset >= pc) ?? byOff[byOff.length - 1];
        if (s) s.opcodes.push(pc);
      }
      out.push(...sites);
    };
    scan('<top-level>', renderTree(e.unit.dec.tree, e.unit.ctx), e.unit.explored);
    for (const f of e.unit.functions) scan(f.name, renderTree(f.dec.tree, f.ctx), f.explored);
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const swfPath = resolve(opt('--swf') ?? SWF_PATH);
  const outDir = resolve(opt('--out') ?? join(GENERATED, 'disasm'));
  const reportsDir = join(GENERATED, 'reports');
  const withIns = args.includes('--instructions') || args.includes('-i');
  const withDot = args.includes('--dot');
  const only = opt('--only');
  const t0 = Date.now();
  const swf = SwfFile.fromPath(swfPath);
  if (swf.sha256 !== SWF_SHA256) console.warn(`warning: SWF sha256 ${swf.sha256} != expected ${SWF_SHA256}`);
  const entries = disassembleAll(swf);
  mkdirSync(join(outDir, 'asm'), { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  if (!only) {
    for (const f of readdirSync(outDir)) if (/\.(txt|dot)$/.test(f) || f === 'INDEX.md') rmSync(join(outDir, f));
    for (const f of readdirSync(join(outDir, 'asm'))) rmSync(join(outDir, 'asm', f));
  }
  const index: string[] = [
    '# AVM1 disassembly index', '',
    `Generated by \`node tools/disasm.ts\` from \`${swfPath}\` (sha256 ${swf.sha256.slice(0, 12)}…).`,
    'Offsets are absolute in the decompressed SWF. Each file: header, top-level script, then every function',
    '(pseudo-code with `// @offset` per statement). `asm/<file>` holds the clean (deobfuscated) instruction listing;',
    '`--instructions` appends it to the pseudo-code files, `--dot` writes Graphviz CFGs. Reports:',
    '`generated/reports/hotspots.md` (every ffdec artifact with the true code) and `gettimer.md`.', '',
    'Self-check = side-effecting instructions (SetMember/SetVariable/Return/…) verified present in the pseudo-code.', '',
    '| file | kind | sprite | functions | states (real/folded) | self-check | notes |', '|---|---|---|---|---|---|---|',
  ];
  let nFiles = 0;
  let totalMissing = 0;
  for (const e of entries) {
    if (only && !e.file.includes(only)) continue;
    const src = e.source;
    const desc = `${src.kind} @${src.start} (tag header @${src.tagOffset}, nominal end ${src.end})`;
    writeFileSync(join(outDir, e.file), renderUnit(e.unit, e.title, desc, { instructions: withIns }));
    if (!e.file.startsWith('sprite_755')) writeFileSync(join(outDir, 'asm', e.file), renderListing(e.unit, e.title));
    nFiles++;
    if (withDot) {
      writeFileSync(join(outDir, e.file.replace(/\.txt$/, '.top.dot')), e.unit.dec.dot(e.title, e.unit.ctx));
      for (const f of e.unit.functions) {
        writeFileSync(join(outDir, e.file.replace(/\.txt$/, `.${sanitize(f.name.split('.').pop()!)}@${f.offset}.dot`)), f.dec.dot(f.name, f.ctx));
      }
    }
    const ex = e.unit.explored;
    const real = ex.nodes.filter(n => !n.folded).length;
    const notes = [...ex.warnings.filter(w => !/stack underflow/.test(w)), ...e.unit.dec.warnings,
      ...e.unit.functions.flatMap(f => [...f.explored.warnings, ...f.dec.warnings])];
    let checked = 0, missing = 0;
    for (const x of [e.unit, ...e.unit.functions]) {
      const r = selfCheck(x.explored, x.dec.tree, x.ctx);
      checked += r.checked; missing += r.missing.length;
    }
    totalMissing += missing;
    const sc = missing ? `**${missing} missing** / ${checked}` : `ok (${checked})`;
    index.push(`| ${e.file} | ${src.kind} | ${src.spriteId} | ${e.unit.functions.length} | ${real}/${ex.nodes.length - real} | ${sc} | ${notes.length ? notes.length + ' note(s)' : ''} |`);
  }
  writeFileSync(join(outDir, 'INDEX.md'), index.join('\n') + '\n');
  // getTimer report
  const sites = getTimerSites(entries);
  const byFile = new Map<string, typeof sites>();
  for (const s of sites) { if (!byFile.has(s.file)) byFile.set(s.file, []); byFile.get(s.file)!.push(s); }
  const rep: string[] = [
    '# getTimer() call sites', '',
    'Every `getTimer()` (AVM1 `GetTime`, opcode 0x34) in the game bytecode, recovered by `node tools/disasm.ts`.',
    'ffdec printed most of these as bare numbers (e.g. `7120;` or `7786 - this.mTimeSlice`) because its',
    'deobfuscator evaluated them at decompile time. Offsets are absolute; see the named disasm file.', '',
    `Total: ${sites.reduce((a, s) => a + s.opcodes.length, 0)} GetTime opcodes in ${sites.length} statements, ${byFile.size} files.`, '',
  ];
  for (const [file, list] of [...byFile.entries()].sort()) {
    rep.push(`## ${file.replace(/\.txt$/, '')}`, '', '| method | GetTime opcode @ | statement @ | statement |', '|---|---|---|---|');
    for (const s of list) {
      rep.push(`| ${s.func} | ${s.opcodes.join(', ')} | ${s.offset} | \`${s.line.replace(/\s*\/\/ @\d+$/, '').replace(/\|/g, '\\|')}\` |`);
    }
    rep.push('');
  }
  writeFileSync(join(reportsDir, 'gettimer.md'), rep.join('\n'));
  // hotspots (v0.2.0: assets/projects was deleted from the repo - skip with a note when the decompiles are absent)
  let hsNote = '';
  if (!only && existsSync(AS2_DIR)) {
    const hs = buildHotspots(AS2_DIR, entries.filter(e => e.source.kind === 'initaction').map(e => ({ file: e.file, unit: e.unit })));
    writeFileSync(join(reportsDir, 'hotspots.md'), hs.markdown);
    const found = hs.stats.reduce((a, s) => a + s.found, 0), res = hs.stats.reduce((a, s) => a + s.resolved, 0);
    hsNote = `, hotspots ${res}/${found} resolved`;
  } else if (!only) {
    console.warn('disasm: hotspots skipped (assets/projects absent - regenerate via ffdec, see assets/README.md)');
  }
  console.log(`disasm: ${nFiles} files -> ${outDir} (${entries.length} units, ${entries.reduce((a, e) => a + e.unit.functions.length, 0)} functions, ` +
    `${sites.length} getTimer sites${hsNote}, self-check missing ${totalMissing}) in ${Date.now() - t0} ms`);
}

if (isMain(import.meta.url)) main();
