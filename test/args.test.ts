import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseArgs } from '../src/core/args.js';

const relDir = path.join('.', 'test', 'fixtures', 'next-project');

describe('parseArgs', () => {
  test('type + dir + port in any order', () => {
    const resolved = path.resolve(relDir);
    expect(parseArgs(['next', relDir, '4989'])).toEqual({
      type: 'next',
      dir: resolved,
      port: 4989,
    });
    expect(parseArgs(['4989', relDir, 'next'])).toEqual({
      type: 'next',
      dir: resolved,
      port: 4989,
    });
    expect(parseArgs([relDir, 'next', '4989'])).toEqual({
      type: 'next',
      dir: resolved,
      port: 4989,
    });
  });

  test('just a port', () => {
    expect(parseArgs(['4989'])).toEqual({ port: 4989 });
  });

  test('just a dir', () => {
    const resolved = path.resolve(relDir);
    expect(parseArgs([relDir])).toEqual({ dir: resolved });
  });

  test('invalid port is treated as unknown', () => {
    expect(() => parseArgs(['70000'])).toThrow(/unknown argument/);
  });

  test('auto token sets auto flag without throwing', () => {
    expect(parseArgs(['auto'])).toEqual({ auto: true });
  });

  test('auto combined with dir and port', () => {
    const resolved = path.resolve(relDir);
    expect(parseArgs(['auto', relDir, '4989'])).toEqual({ auto: true, dir: resolved, port: 4989 });
  });
});
