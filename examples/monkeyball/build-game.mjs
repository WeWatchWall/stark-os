// Pre-bundles the WebMonkeyBall game with esbuild.
// esbuild handles the circular dependencies in noclip/ that Rollup cannot
// resolve when inlineDynamicImports is enabled.

import { buildSync } from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('game', { recursive: true });

buildSync({
  entryPoints: ['node_modules/smb-web/src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: 'game/main.mjs',
  minify: true,
  sourcemap: false,
});

console.log('WebMonkeyBall game built successfully.');
