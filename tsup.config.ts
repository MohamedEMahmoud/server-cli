import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/index.ts' },
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  clean: true,
  bundle: true,
  minify: false,
  sourcemap: false,
  outDir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
  onSuccess: 'node scripts/copy-templates.mjs && node scripts/write-launcher.mjs',
});
