import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import type { PM2AppEntry } from '../src/types.js';
import * as pj from '../src/core/process-json.js';
import { ServerCliError } from '../src/utils/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpRoot = path.join(here, '.tmp-process-json');

afterEach(async () => {
  await fs.remove(tmpRoot).catch(() => undefined);
});

function entry(over: Partial<PM2AppEntry> = {}): PM2AppEntry {
  return {
    name: 'app-a',
    script: '/x/a.js',
    cwd: '/home/u/a',
    exec_mode: 'cluster',
    env: { PORT: '1', NODE_ENV: 'production' },
    ...over,
  };
}

test('empty file creates apps with new entry', async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  const p = path.join(tmpRoot, 'process.json');
  await fs.writeFile(p, '', 'utf8');
  const doc = await pj.read(p);
  const next = pj.upsert(doc, entry());
  await pj.writeAtomic(p, next);
  const round = await pj.read(p);
  expect(round.apps).toHaveLength(1);
});

test('matching cwd replaces in place preserving order', async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  const p = path.join(tmpRoot, 'process.json');
  const a = entry({ name: 'n1', cwd: '/a', script: '/a/1.js' });
  const b = entry({ name: 'n2', cwd: '/b', script: '/b/1.js' });
  let doc = { apps: [a, b] };
  await pj.writeAtomic(p, doc);
  doc = await pj.read(p);
  const updated = pj.upsert(doc, { ...a, script: '/a/2.js' });
  await pj.writeAtomic(p, updated);
  const out = await pj.read(p);
  expect(out.apps.map((x) => x.script)).toEqual(['/a/2.js', '/b/1.js']);
});

test('duplicate name different cwd fails', () => {
  const doc = {
    apps: [entry({ name: 'dup', cwd: '/a' }), entry({ name: 'x', cwd: '/b' })],
  };
  expect(() => pj.upsert(doc, entry({ name: 'dup', cwd: '/c' }))).toThrowError(ServerCliError);
});

test('read accepts JSON array root (PM2-style) and upsert preserves siblings', async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  const p = path.join(tmpRoot, 'process.json');
  const apps = [entry({ name: 'a', cwd: '/p1' }), entry({ name: 'b', cwd: '/p2' })];
  await fs.writeFile(p, JSON.stringify(apps), 'utf8');
  const doc = await pj.read(p);
  expect(doc.apps).toHaveLength(2);
  const next = pj.upsert(doc, { ...apps[0]!, script: '/p1/new.js' });
  await pj.writeAtomic(p, next);
  const out = await pj.read(p);
  expect(out.apps).toHaveLength(2);
  expect(out.apps.find((x) => x.cwd === '/p1')?.script).toBe('/p1/new.js');
});

test('findByProjectDir matches server subfolder cwd', () => {
  const doc = {
    apps: [entry({ name: 'sock', cwd: '/home/u/chat/server' })],
  };
  expect(pj.findByProjectDir(doc, '/home/u/chat')?.name).toBe('sock');
});

test('findByProjectDir matches node subfolder cwd', () => {
  const doc = {
    apps: [entry({ name: 'sock', cwd: '/home/u/chat/node' })],
  };
  expect(pj.findByProjectDir(doc, '/home/u/chat')?.name).toBe('sock');
});

test('projectRootsMatch is false when app has no cwd (legacy PM2 entries)', () => {
  expect(pj.projectRootsMatch(undefined, '/home/x')).toBe(false);
  expect(pj.projectRootsMatch('', '/home/x')).toBe(false);
});

test('stripJsonTrailingCommas fixes invalid JSON (commas not inside strings)', () => {
  const bad = '{"apps":[{"name":"a","env":{"PORT":"1",}},],"extra":true,}';
  expect(() => JSON.parse(bad)).toThrow();
  const fixed = pj.stripJsonTrailingCommas(bad);
  expect(JSON.parse(fixed)).toEqual({
    apps: [{ name: 'a', env: { PORT: '1' } }],
    extra: true,
  });
});

test('read parses file with trailing commas then upsert keeps sibling apps', async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  const p = path.join(tmpRoot, 'process.json');
  const raw = `{
  "apps": [
    {"name":"basenodejs","script":"/home/basenodejs/public_html/app.js","env":{"NODE_ENV":"production","PORT":"30052"}},
    {"name":"other","script":"/z.js","cwd":"/z","env":{"PORT":4921,"NODE_ENV":"production"}},
  ],
}`;
  await fs.writeFile(p, raw, 'utf8');
  const doc = await pj.read(p);
  expect(doc.apps).toHaveLength(2);
  const merged = pj.upsert(doc, {
    name: 'practice-nuxt',
    script: '/home/practice/public_html/.output/server/index.mjs',
    cwd: '/home/practice/public_html',
    exec_mode: 'cluster',
    instances: 1,
    env: { NODE_ENV: 'production', PORT: '4991' },
  });
  expect(merged.apps).toHaveLength(3);
  expect(merged.apps.map((a) => a.name)).toEqual(['basenodejs', 'other', 'practice-nuxt']);
});

test('sortByPort orders apps descending by PORT env value', () => {
  const doc = {
    apps: [
      entry({ name: 'c', env: { PORT: '5000', NODE_ENV: 'production' } }),
      entry({ name: 'a', env: { PORT: '3000', NODE_ENV: 'production' } }),
      entry({ name: 'b', env: { PORT: '4000', NODE_ENV: 'production' } }),
    ],
  };
  const sorted = pj.sortByPort(doc);
  expect(sorted.apps.map((a) => a.name)).toEqual(['c', 'b', 'a']);
});

test('sortByPort is stable for entries without PORT', () => {
  const doc = {
    apps: [
      entry({ name: 'x', env: {} }),
      entry({ name: 'y', env: { PORT: '4000', NODE_ENV: 'production' } }),
    ],
  };
  const sorted = pj.sortByPort(doc);
  // entry without PORT sorts to end (0 < 4000, descending → 4000 first)
  expect(sorted.apps[0]!.name).toBe('y');
  expect(sorted.apps[1]!.name).toBe('x');
});
