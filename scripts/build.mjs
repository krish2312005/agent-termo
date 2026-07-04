const esbuild = await import('esbuild');

/**
 * Build script for Agent-Termo
 * Compiles TypeScript with esbuild and creates distribution files
 */

const isWindows = process.platform === 'win32';

// Common build options
const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  minify: !process.env.DEV,
  treeShaking: true,
  external: ['fsevents'],
  logLevel: 'info',
};

// Build the CLI entry point
await esbuild.build({
  ...commonOptions,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
  banner: {
    js: '#!/usr/bin/env node',
  },
});

// Build the main application
await esbuild.build({
  ...commonOptions,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
});

// Copy .claude directory to dist
import { copy } from 'fs-extra';
import { existsSync } from 'node:fs';

if (existsSync('.claude')) {
  await copy('.claude', 'dist/.claude');
  console.log('Copied .claude to dist/');
}

console.log('Build complete: dist/cli.js, dist/main.js');