import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { getTemplatesDir } from '../src/core/paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');
const distServer = path.join(repoRoot, 'dist', 'server.js');

describe('getTemplatesDir', () => {
  const origArgv = [...process.argv];

  afterEach(() => {
    process.argv.length = 0;
    process.argv.push(...origArgv);
  });

  test('uses templates next to resolved CLI entry (dist/server.js)', () => {
    if (!existsSync(distServer)) return;
    process.argv = ['node', distServer];
    const d = getTemplatesDir();
    expect(existsSync(path.join(d, 'htaccess-nuxt.tpl'))).toBe(true);
    expect(existsSync(path.join(d, 'static-server.cjs'))).toBe(true);
  });

  test('falls back to repo cwd (src/templates) when argv entry is not the CLI', () => {
    process.argv = ['node', path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs')];
    const d = getTemplatesDir();
    expect(existsSync(path.join(d, 'htaccess-nuxt.tpl'))).toBe(true);
  });
});
