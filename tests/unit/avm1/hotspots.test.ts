import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SwfFile } from '../../../tools/swf/SwfFile.ts';
import { SWF_PATH, AS2_DIR } from '../../../tools/paths.ts';
import { disassembleAll } from '../../../tools/disasm.ts';
import { buildHotspots } from '../../../tools/avm1/hotspots.ts';

function listAs(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...listAs(p));
    else if (f.endsWith('.as')) out.push(p);
  }
  return out;
}

describe.skipIf(!existsSync(SWF_PATH) || !existsSync(AS2_DIR))('hotspots.md', () => {
  // v0.2.0: assets/projects was deleted (regenerable via ffdec, see assets/README.md). Vitest still runs a skipped
  // suite's body during collection, so every AS2_DIR touch below must be guarded.
  if (!existsSync(AS2_DIR)) return;
  const entries = disassembleAll(SwfFile.fromPath(SWF_PATH));
  const { markdown, stats } = buildHotspots(AS2_DIR, entries.filter(e => e.source.kind === 'initaction').map(e => ({ file: e.file, unit: e.unit })));

  it('maps every ffdec method to a recovered function', () => {
    expect(stats.flatMap(s => s.methodsMissing.map(m => `${s.file}:${m}`))).toEqual([]);
    expect(stats).toHaveLength(114);
  });

  it('covers every artifact line of the ffdec sources', () => {
    const covered = new Set<string>();
    let cur = '';
    for (const l of markdown.split('\n')) {
      let m = /^#### ([^:]+\.as):(\d+)(?:-(\d+))?/.exec(l);
      if (m) { for (let i = +m[2]; i <= +(m[3] ?? m[2]); i++) covered.add(`${m[1]}:${i}`); continue; }
      m = /^#### ([^ ]+\.as) — class prologue/.exec(l);
      if (m) { cur = m[1]; continue; }
      m = /^\| (\d+) \| `/.exec(l);
      if (m && cur) covered.add(`${cur}:${m[1]}`);
      if (/^### /.test(l)) cur = '';
    }
    const pats = [/^\s*-?\d[\d.]*(e[+-]?\d+)?;\s*$/, /^\s*"(?:[^"\\]|\\.)*";\s*$/, /§§/, /while\(true\)/,
      /while\(-?[\d.]+ *(<|<=|>|>=)/, /^\s*(true|false);\s*$/];
    const missing: string[] = [];
    let total = 0;
    for (const f of listAs(AS2_DIR)) {
      const rel = relative(AS2_DIR, f).split('\\').join('/');
      readFileSync(f, 'utf8').split(/\r?\n/).forEach((s, i) => {
        if (!pats.some(p => p.test(s))) return;
        total++;
        if (!covered.has(`${rel}:${i + 1}`)) missing.push(`${rel}:${i + 1}: ${s.trim()}`);
      });
    }
    expect(total).toBeGreaterThan(350);
    expect(missing).toEqual([]);
  });

  it('every cluster has recovered code and none needs manual checking', () => {
    expect(stats.reduce((a, s) => a + s.unresolved, 0)).toBe(0);
    expect(markdown).not.toContain('method not found');
    // the key semantic fixes are present
    for (const s of ['State_BulletHit', 'GetClosestPlayer', 'Nav_Update', 'RandomPickup', 'Create_LookupTables', 'InitThings']) {
      expect(markdown).toContain(`\`${s}\``);
    }
  });
});
