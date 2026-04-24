import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { detectType } from '../src/core/detect.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (...p: string[]) => path.join(here, 'fixtures', ...p);

describe('detectType', () => {
  test('next fixture', async () => {
    await expect(detectType(fx('next-project'))).resolves.toBe('next');
  });
  test('nuxt fixture', async () => {
    await expect(detectType(fx('nuxt-project'))).resolves.toBe('nuxt');
  });
  test('socket fixture', async () => {
    await expect(detectType(fx('socket-project'))).resolves.toBe('socket');
  });
  test('laravel fixture', async () => {
    await expect(detectType(fx('laravel-project'))).resolves.toBe('supervisor');
  });

  const emptyDir = mkdtempSync(path.join(tmpdir(), 'server-cli-empty-'));
  afterAll(() => {
    rmSync(emptyDir, { recursive: true, force: true });
  });

  test('empty directory throws', async () => {
    await expect(detectType(emptyDir)).rejects.toMatchObject({ name: 'ServerCliError', code: 40 });
  });
});
