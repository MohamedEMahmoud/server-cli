import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ensureSocketGitignore,
  injectSocketEnvBlock,
  updateDocsDomain,
} from '../src/core/socket-setup.js';
import type { GlobalFlags } from '../src/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpRoot = path.join(here, '.tmp-socket-setup');

afterEach(async () => {
  await fs.remove(tmpRoot).catch(() => undefined);
});

function flags(over: Partial<GlobalFlags> = {}): GlobalFlags {
  return {
    dryRun: false,
    verbose: false,
    yes: false,
    noHealthcheck: false,
    noChown: false,
    ...over,
  };
}

async function makeProject(dir: string): Promise<void> {
  await fs.mkdir(path.join(dir, 'node'), { recursive: true });
}

describe('injectSocketEnvBlock', () => {
  test('appends the full block with dynamic domain + port when .env missing', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    await injectSocketEnvBlock(
      dir,
      { domain: 'dashboard.practice.4hoste.com', port: 4998 },
      flags(),
    );
    const out = await fs.readFile(path.join(dir, '.env'), 'utf8');
    expect(out).toContain('# --- merged from socket/.env ---');
    expect(out).toContain('APP_URL=https://dashboard.practice.4hoste.com');
    expect(out).toContain('NODE_HOST=dashboard.practice.4hoste.com');
    expect(out).toContain('NODE_PORT=4998');
    expect(out).toContain('NODE_MODE=live');
    expect(out).toContain('KEY =/var/cpanel/ssl/apache_tls/dashboard.practice.4hoste.com/combined');
    expect(out).toContain('CERT =/var/cpanel/ssl/apache_tls/dashboard.practice.4hoste.com/certificates');
    expect(out).toContain('CA =/var/cpanel/ssl/apache_tls/dashboard.practice.4hoste.com/combined');
    expect(out).toContain('STORAGE = storage');
    expect(out).toContain('IMAGES = images');
    expect(out).toContain('ROOMS = rooms');
  });

  test('overwrites stale managed keys with current deploy values; preserves unrelated keys', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    await fs.writeFile(
      path.join(dir, '.env'),
      [
        'APP_NAME=laravel',
        'APP_URL=https://old.example.com',
        'NODE_HOST=thunder-way.com',
        'NODE_PORT=4797',
        'NODE_MODE=dev',
        '',
      ].join('\n'),
    );
    await injectSocketEnvBlock(
      dir,
      { domain: 'dashboard.practice.4hoste.com', port: 4998 },
      flags(),
    );
    const out = await fs.readFile(path.join(dir, '.env'), 'utf8');
    // unrelated keys untouched
    expect(out).toMatch(/^APP_NAME=laravel$/m);
    // managed keys overwritten in place with deploy values (APP_URL is managed)
    expect(out).toMatch(/^APP_URL=https:\/\/dashboard\.practice\.4hoste\.com$/m);
    expect(out).toMatch(/^NODE_HOST=dashboard\.practice\.4hoste\.com$/m);
    expect(out).toMatch(/^NODE_PORT=4998$/m);
    expect(out).toMatch(/^NODE_MODE=live$/m);
    expect(out).not.toMatch(/^APP_URL=https:\/\/old\.example\.com$/m);
    expect(out).not.toMatch(/^NODE_HOST=thunder-way\.com$/m);
    expect(out).not.toMatch(/^NODE_PORT=4797$/m);
    expect(out).not.toMatch(/^NODE_MODE=dev$/m);
    // stale values only appear once (no duplicates appended)
    expect(out.match(/^APP_URL=/gm)?.length).toBe(1);
    expect(out.match(/^NODE_HOST=/gm)?.length).toBe(1);
    expect(out.match(/^NODE_PORT=/gm)?.length).toBe(1);
    expect(out.match(/^NODE_MODE=/gm)?.length).toBe(1);
    // missing managed keys appended under the header
    expect(out).toContain('# --- merged from socket/.env ---');
    expect(out).toContain('KEY =/var/cpanel/ssl/apache_tls/dashboard.practice.4hoste.com/combined');
    expect(out).toContain('CERT =/var/cpanel/ssl/apache_tls/dashboard.practice.4hoste.com/certificates');
    expect(out).toContain('CA =/var/cpanel/ssl/apache_tls/dashboard.practice.4hoste.com/combined');
    // constants also appended since missing
    expect(out).toContain('STORAGE = storage');
    expect(out).toContain('IMAGES = images');
    expect(out).toContain('ROOMS = rooms');
  });

  test('preserves user-set constants; only adds the ones that are missing', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    await fs.writeFile(
      path.join(dir, '.env'),
      'STORAGE = custom-storage\nIMAGES = custom-images\n',
    );
    await injectSocketEnvBlock(dir, { domain: 'a.b.com', port: 4000 }, flags());
    const out = await fs.readFile(path.join(dir, '.env'), 'utf8');
    // user-set constants preserved verbatim
    expect(out).toMatch(/^STORAGE = custom-storage$/m);
    expect(out).toMatch(/^IMAGES = custom-images$/m);
    // missing constant added
    expect(out).toMatch(/^ROOMS = rooms$/m);
    // managed keys added with deploy values
    expect(out).toMatch(/^NODE_HOST=a\.b\.com$/m);
    expect(out).toMatch(/^NODE_PORT=4000$/m);
    // no duplicates
    expect(out.match(/^STORAGE /gm)?.length).toBe(1);
    expect(out.match(/^IMAGES /gm)?.length).toBe(1);
  });

  test('idempotent — running twice produces identical content', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    await injectSocketEnvBlock(dir, { domain: 'a.b', port: 1 }, flags());
    const first = await fs.readFile(path.join(dir, '.env'), 'utf8');
    await injectSocketEnvBlock(dir, { domain: 'a.b', port: 1 }, flags());
    const second = await fs.readFile(path.join(dir, '.env'), 'utf8');
    expect(second).toBe(first);
  });

  test('idempotent after a managed-key overwrite — second run is a no-op', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    await fs.writeFile(path.join(dir, '.env'), 'NODE_HOST=stale.example.com\nNODE_PORT=1\n');
    await injectSocketEnvBlock(dir, { domain: 'a.b', port: 2 }, flags());
    const first = await fs.readFile(path.join(dir, '.env'), 'utf8');
    await injectSocketEnvBlock(dir, { domain: 'a.b', port: 2 }, flags());
    const second = await fs.readFile(path.join(dir, '.env'), 'utf8');
    expect(second).toBe(first);
  });

  test('removes node/.env when present', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    await fs.writeFile(path.join(dir, 'node', '.env'), 'STALE=1\n');
    await injectSocketEnvBlock(dir, { domain: 'a.b', port: 1 }, flags());
    expect(await fs.pathExists(path.join(dir, 'node', '.env'))).toBe(false);
  });

  test('throws when domain is empty', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    await expect(
      injectSocketEnvBlock(dir, { domain: '', port: 1 }, flags()),
    ).rejects.toMatchObject({ name: 'ServerCliError', code: 10 });
  });
});

describe('ensureSocketGitignore', () => {
  test('creates .gitignore with /node/node_modules when missing', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await fs.mkdir(dir, { recursive: true });
    await ensureSocketGitignore(dir, flags());
    const out = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(out).toMatch(/^\/node\/node_modules$/m);
  });

  test('appends when .gitignore exists without the entry', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, '.gitignore'), 'vendor\n/node_modules\n');
    await ensureSocketGitignore(dir, flags());
    const out = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(out).toMatch(/^vendor$/m);
    expect(out).toMatch(/^\/node_modules$/m);
    expect(out).toMatch(/^\/node\/node_modules$/m);
  });

  test('no-op when /node/node_modules already present (any slash variant)', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await fs.mkdir(dir, { recursive: true });
    const initial = 'vendor\n/node/node_modules/\n';
    await fs.writeFile(path.join(dir, '.gitignore'), initial);
    await ensureSocketGitignore(dir, flags());
    const out = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
    expect(out).toBe(initial);
  });
});

describe('updateDocsDomain', () => {
  test('rewrites domain tokens on URL lines in node/*.md', async () => {
    const dir = path.join(tmpRoot, 'proj');
    await makeProject(dir);
    const md = [
      '# Socket',
      'See https://old.example.com/docs for more.',
      'DOMAIN=old.example.com',
      'Unrelated text with old.example.com but no url marker.',
      'Link to https://github.com/foo/bar (should not change)',
    ].join('\n');
    await fs.writeFile(path.join(dir, 'node', 'README.md'), md);
    await updateDocsDomain(dir, 'new.example.com', flags());
    const out = await fs.readFile(path.join(dir, 'node', 'README.md'), 'utf8');
    expect(out).toMatch(/https:\/\/new\.example\.com\/docs/);
    expect(out).toMatch(/DOMAIN=new\.example\.com/);
    expect(out).toMatch(/Unrelated text with old\.example\.com/);
    expect(out).toMatch(/github\.com/);
  });
});
