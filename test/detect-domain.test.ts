import fs from 'fs-extra';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { detectDomain, looksLikeDomain } from '../src/core/detect.js';

describe('looksLikeDomain', () => {
  test('accepts multi-level subdomains with digits', () => {
    expect(looksLikeDomain('provider.practice.4hoste.com')).toBe(true);
    expect(looksLikeDomain('dashboard.practice.4hoste.com')).toBe(true);
    expect(looksLikeDomain('wesell.com')).toBe(true);
    expect(looksLikeDomain('a.b.c.co.uk')).toBe(true);
  });
  test('rejects non-domains', () => {
    expect(looksLikeDomain('public_html')).toBe(false);
    expect(looksLikeDomain('not-a-domain')).toBe(false);
    expect(looksLikeDomain('localhost')).toBe(false);
    expect(looksLikeDomain('')).toBe(false);
  });
});

describe('detectDomain', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'server-cli-detect-'));
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test('flag wins', async () => {
    await expect(detectDomain('x', '/tmp/anything', 'override.example')).resolves.toBe(
      'override.example',
    );
  });

  test('basename fallback detects multi-level subdomain', async () => {
    const dir = path.join(tmp, 'provider.practice.4hoste.com');
    await fs.mkdir(dir, { recursive: true });
    await expect(detectDomain('nobody-such-user-xyz', dir)).resolves.toBe(
      'provider.practice.4hoste.com',
    );
  });

  test('basename fallback skips non-domain names', async () => {
    const dir = path.join(tmp, 'public_html');
    await fs.mkdir(dir, { recursive: true });
    await expect(detectDomain('nobody-such-user-xyz', dir)).resolves.toBeUndefined();
  });
});
