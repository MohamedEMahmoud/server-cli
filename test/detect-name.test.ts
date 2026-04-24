import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { detectName } from '../src/core/detect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (...p: string[]) => path.join(here, 'fixtures', ...p);

describe('detectName', () => {
  test('nuxt under /home/<user> uses <user>-nuxt when no domain', async () => {
    await expect(detectName(fx('nuxt-project'), 'nuxt')).resolves.toMatch(/-nuxt$/);
    const dir = '/home/practice/public_html';
    await expect(detectName(dir, 'nuxt', undefined, 'practice')).resolves.toBe('practice-nuxt');
  });

  test('nuxt with domain uses <user>-nuxt-<domain>', async () => {
    await expect(
      detectName('/home/practice/public_html', 'nuxt', undefined, 'practice', 'wesell.com'),
    ).resolves.toBe('practice-nuxt-wesell.com');
  });

  test('next with domain uses <user>-next-<domain>', async () => {
    await expect(
      detectName(
        fx('next-project'),
        'next',
        undefined,
        'practice',
        'provider.practice.4hoste.com',
      ),
    ).resolves.toBe('practice-next-provider.practice.4hoste.com');
  });

  test('socket with domain uses <user>-socket-<domain>', async () => {
    await expect(
      detectName(
        fx('socket-project'),
        'socket',
        undefined,
        'practice',
        'dashboard.practice.4hoste.com',
      ),
    ).resolves.toBe('practice-socket-dashboard.practice.4hoste.com');
  });

  test('next uses <user>-next when no domain', async () => {
    await expect(detectName(fx('next-project'), 'next', undefined, 'alice')).resolves.toBe('alice-next');
  });

  test('socket uses <user>-socket when no domain', async () => {
    await expect(detectName(fx('socket-project'), 'socket', undefined, 'bob')).resolves.toBe('bob-socket');
  });

  test('--name flag wins over domain-based naming', async () => {
    await expect(
      detectName(fx('next-project'), 'next', 'custom', 'alice', 'example.com'),
    ).resolves.toBe('custom');
  });
});
