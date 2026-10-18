// Isolates journal bookkeeping from simulation/rendering; use the separate mixed-explosion gates for gameplay.
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = process.argv[2] ?? 'src/game/local/Net/Events.ts';
const output = process.argv[3] ?? 'generated/reports/v028/events-candidate.json';
const sources = source === '--compare' ? { baseline: 'generated/events-before.ts', candidate: 'src/game/local/Net/Events.ts' } : { selected: source };
const constructors: Record<string, any> = {};
for (const [kind, file] of Object.entries(sources)) constructors[kind] = (await import(pathToFileURL(resolve(file)).href)).EventJournal;
const runs: any[] = [];
const play = () => {};
for (const EventJournal of Object.values(constructors)) for (let warm = 0; warm < 3; warm++) {
  const journal = new EventJournal(); journal.begin(0);
  for (let n = 0; n < 1000; n++) journal.record(0, -1, 'scorch:' + n + ':12.5:2:0', play);
  journal.confirm(0);
}
for (let round = 1; round <= 3; round++) for (const count of [2000, 4000, 8000]) for (const [kind, EventJournal] of Object.entries(constructors)) {
  (globalThis as any).gc?.();
  const journal = new EventJournal(), heap = process.memoryUsage().heapUsed, start = performance.now();
  journal.begin(0);
  for (let n = 0; n < count; n++) journal.record(0, -1, 'scorch:' + n + ':12.5:2:0', play);
  const recorded = performance.now(); journal.confirm(0);
  runs.push({ kind, round, count, recordMs: recorded - start, totalMs: performance.now() - start,
    heapDelta: process.memoryUsage().heapUsed - heap, hash: journal.confirmedHash, retained: journal.retainedEvents });
}
mkdirSync(resolve(output, '..'), { recursive: true });
writeFileSync(output, JSON.stringify({ sources, node: process.version, runs }, null, 2));
console.log(JSON.stringify(runs));
