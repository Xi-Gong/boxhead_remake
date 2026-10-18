// Static inventory for release audits. Dynamic/registered dependencies are evidence to retain, not deletion hints.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ts from 'typescript';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(p => /^(src|electron|tools|tests)\/.*\.(ts|mjs)$/.test(p));
const modules = files.map(path => {
  const source = readFileSync(path, 'utf8');
  const parsed = ts.preProcessFile(source, true, true);
  return { path, lines: source.split('\n').length, port: source.startsWith('// Port of'),
    imports: parsed.importedFiles.map(i => i.fileName),
    registrations: [...source.matchAll(/(?:registerGameClass|registerClass|registerFrameScript|registerInstanceHook)\s*\(\s*['"]([^'"]+)/g)].map(m => m[1]),
    lifecycle: [...new Set(source.match(/\b(?:onUnload|dispose|Dispose|setInterval|setTimeout|addEventListener|removeEventListener)\b/g) ?? [])],
    dynamic: /\b(?:attachMovie|registerClass|registerGameClass|proto)\s*\(|\[[^\]\n]+\]/.test(source) };
});
const protectedPorts = modules.filter(m => m.port).map(m => m.path);
const changedPorts = execFileSync('git', ['diff', '--name-only', 'v0.2.5', '--', ...protectedPorts], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const report = { base: 'v0.2.5', modules: modules.length, portedModules: protectedPorts.length, changedPorts, inventory: modules };
const out = process.argv[2] ?? 'generated/reports/v026/code-inventory.json';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ modules: report.modules, portedModules: report.portedModules, changedPorts, out }));
if (changedPorts.length) process.exitCode = 1;
