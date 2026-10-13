/**
 * Bundles the Electron main + preload scripts.                         OWNER: lane D (platform)
 *   node tools/build-electron.ts            -> dist-electron/main.cjs, dist-electron/preload.cjs
 *   node tools/build-electron.ts --watch    -> rebuild on change
 * 'electron' stays external (provided by the runtime); everything else (node builtins) is left to Node's require.
 */
import { build, context } from 'esbuild';
import type { BuildOptions } from 'esbuild';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'dist-electron');
const watch = process.argv.includes('--watch');

const options: BuildOptions = {
  absWorkingDir: root,
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: 'linked',
  legalComments: 'none',
  logLevel: 'info',
};

await rm(outdir, { recursive: true, force: true });
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build-electron] watching electron/*.ts');
} else {
  await build(options);
}
