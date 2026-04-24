import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const srcTpl = path.join(root, 'src', 'templates');
const dist = path.join(root, 'dist');
const distTpl = path.join(dist, 'templates');
const serverJs = path.join(dist, 'server.js');

fs.mkdirSync(dist, { recursive: true });
fs.rmSync(distTpl, { recursive: true, force: true });
fs.cpSync(srcTpl, distTpl, { recursive: true });
if (fs.existsSync(serverJs)) {
  const mode = fs.statSync(serverJs).mode | 0o111;
  fs.chmodSync(serverJs, mode);
}
