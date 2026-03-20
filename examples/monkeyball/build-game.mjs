// Pre-bundles the WebMonkeyBall game with esbuild using IIFE format.
// IIFE wraps everything in a function scope, which:
//  1. Resolves circular dependencies that cause TDZ errors in ESM
//  2. Allows loading via raw string import + eval (bypasses Rollup entirely)

import { buildSync } from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('game', { recursive: true });

buildSync({
  entryPoints: ['node_modules/smb-web/src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: 'game/main.js',
  minify: true,
  sourcemap: false,
});

console.log('WebMonkeyBall game built successfully.');
