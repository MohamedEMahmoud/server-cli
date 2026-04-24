import fs from 'fs-extra';
import path from 'node:path';
import type { PM2AppEntry, ProcessJson } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import { exists, writeAtomic as atomicWriteFile } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

/**
 * Many hand-edited PM2 ecosystem files use trailing commas (invalid in strict JSON).
 * Strip commas that are immediately followed (after optional whitespace) by `}` or `]`,
 * while respecting double-quoted strings.
 */
export function stripJsonTrailingCommas(input: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (inString) {
      if (escape) {
        out += c;
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        out += c;
        continue;
      }
      if (c === '"') inString = false;
      out += c;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < input.length && /[\s\r\n\t]/.test(input[j]!)) j++;
      const next = input[j];
      if (next === '}' || next === ']') continue;
    }
    out += c;
  }
  return out;
}

function parseProcessJsonBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(stripJsonTrailingCommas(raw));
  }
}

/** True when a PM2 `cwd` is this project root or one of its known subfolders. */
export function projectRootsMatch(appCwd: string | undefined, projectDir: string): boolean {
  if (appCwd == null || appCwd === '') return false;
  const a = path.resolve(appCwd);
  const r = path.resolve(projectDir);
  return a === r || a === path.join(r, 'node') || a === path.join(r, 'socket') || a === path.join(r, 'server');
}

export function findByProjectDir(doc: ProcessJson, projectRoot: string): PM2AppEntry | undefined {
  const root = path.resolve(projectRoot);
  return doc.apps.find((e) => projectRootsMatch(e.cwd, root));
}

export async function read(filePath: string): Promise<ProcessJson> {
  if (!(await exists(filePath))) return { apps: [] };
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!raw.trim()) return { apps: [] };
  try {
    const parsed = parseProcessJsonBody(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { apps: parsed as PM2AppEntry[] };
    }
    const doc = parsed as ProcessJson;
    if (doc && typeof doc === 'object' && Array.isArray(doc.apps)) {
      return doc;
    }
    return { apps: [] };
  } catch {
    const broken = `${filePath}.bak.${Date.now()}.broken`;
    try {
      await fs.copy(filePath, broken);
      logger.warn(`process.json was malformed; backed up to ${broken} and starting fresh`);
    } catch {
      // ignore
    }
    return { apps: [] };
  }
}

export function sortByPort(doc: ProcessJson): ProcessJson {
  const apps = [...doc.apps].sort((a, b) => {
    const pa = Number(a.env?.PORT ?? 0);
    const pb = Number(b.env?.PORT ?? 0);
    return pb - pa;
  });
  return { apps };
}

export async function writeAtomic(filePath: string, data: ProcessJson): Promise<void> {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await atomicWriteFile(filePath, body);
}

export function findByCwd(doc: ProcessJson, cwd: string | undefined): PM2AppEntry | undefined {
  return doc.apps.find((a) => a.cwd === cwd);
}

export function upsert(doc: ProcessJson, entry: PM2AppEntry): ProcessJson {
  const idx = doc.apps.findIndex((a) => a.cwd === entry.cwd);
  if (idx >= 0) {
    const merged = { ...doc.apps[idx], ...entry } as PM2AppEntry;
    const apps = [...doc.apps];
    apps[idx] = merged;
    return { apps };
  }
  const dup = doc.apps.find((a) => a.name === entry.name);
  if (dup) {
    throw new ServerCliError('duplicate name', { code: 10, hint: 'duplicate name' });
  }
  return { apps: [...doc.apps, entry] };
}
