import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');
const main = path.join(dist, 'server.js');
const launcher = path.join(dist, 'server');

if (!fs.existsSync(main)) {
  console.warn('write-launcher: dist/server.js missing, skip');
  process.exit(0);
}

const body = '#!/usr/bin/env node\nrequire("./server.js");\n';
fs.writeFileSync(launcher, body, 'utf8');
fs.chmodSync(launcher, fs.statSync(main).mode | 0o111);
