import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { candidateNpmCliJsPaths } from '../src/utils/npm-path.js';

describe('candidateNpmCliJsPaths', () => {
  test('windows-style layout under node dir', () => {
    const nodeDir = 'C:\\Program Files\\nodejs';
    const c = candidateNpmCliJsPaths(nodeDir);
    expect(c[0]).toBe(path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  });

  test('unix tarball layout uses lib one level up from bin', () => {
    const nodeDir = '/opt/node-v20/bin';
    const c = candidateNpmCliJsPaths(nodeDir);
    expect(c[1]).toBe(path.normalize('/opt/node-v20/lib/node_modules/npm/bin/npm-cli.js'));
  });
});
