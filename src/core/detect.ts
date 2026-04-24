import fs from 'fs-extra';
import path from 'node:path';
import type { ProjectType } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import { exists, readJson } from '../utils/fs.js';

async function hasAny(dir: string, names: string[]): Promise<boolean> {
  for (const n of names) {
    if (await exists(path.join(dir, n))) return true;
  }
  return false;
}

async function hasDep(pkgPath: string, dep: string): Promise<boolean> {
  if (!(await exists(pkgPath))) return false;
  try {
    const pkg = (await readJson<{ dependencies?: Record<string, string> }>(pkgPath)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]);
  } catch {
    return false;
  }
}

export async function detectType(dir: string): Promise<ProjectType> {
  if (await exists(path.join(dir, '.output/server/index.mjs'))) return 'nuxt';
  if (
    await hasAny(dir, ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs'])
  ) {
    return 'nuxt';
  }
  if (
    (await exists(path.join(dir, '.next'))) ||
    (await hasAny(dir, ['next.config.ts', 'next.config.js', 'next.config.mjs']))
  ) {
    return 'next';
  }
  if (
    (await exists(path.join(dir, 'node/app.js'))) &&
    (await hasDep(path.join(dir, 'node/package.json'), 'socket.io'))
  ) {
    return 'socket';
  }
  if ((await exists(path.join(dir, 'artisan'))) && (await exists(path.join(dir, 'composer.json')))) {
    return 'supervisor';
  }
  throw new ServerCliError('could not detect project type', {
    hint: 'pass one of: next, nuxt, supervisor, socket',
    code: 40,
  });
}

export function detectUser(dir: string, flag?: string): string {
  if (flag) return flag;
  const m = dir.match(/^\/home\/([^/]+)/);
  if (m?.[1]) return m[1];
  const u = process.env.USER || process.env.LOGNAME || process.env.USERNAME;
  if (u) return u;
  throw new ServerCliError('could not detect Linux user', {
    code: 10,
    hint: 'pass --user <name> or run from /home/<user>/...',
  });
}

function slugifyComposerName(name: string): string {
  const part = name.includes('/') ? name.split('/')[1] ?? name : name;
  return part.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'laravel-app';
}

export async function detectName(
  dir: string,
  type: ProjectType,
  flag?: string,
  resolvedUser?: string,
  resolvedDomain?: string,
): Promise<string> {
  if (flag) return flag;
  if (type === 'nuxt' || type === 'next' || type === 'socket') {
    const user = resolvedUser ?? detectUser(dir);
    return resolvedDomain ? `${user}-${type}-${resolvedDomain}` : `${user}-${type}`;
  }
  if (type === 'supervisor') {
    const cj = path.join(dir, 'composer.json');
    if (await exists(cj)) {
      try {
        const c = await readJson<{ name?: string }>(cj);
        if (c.name) return slugifyComposerName(c.name);
      } catch {
        // fall through
      }
    }
  }
  const user = resolvedUser ?? detectUser(dir);
  const short = Buffer.from(dir).toString('base64url').slice(0, 6);
  return `${user}-${short}`;
}

export function looksLikeDomain(s: string): boolean {
  return /^([a-zA-Z0-9][a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/.test(s);
}

/**
 * Scan `/var/cpanel/userdata/<user>/` for the per-domain file whose
 * `documentroot` matches `dir`. Returns its `servername`, or undefined.
 */
async function cpanelDomainForDir(user: string, dir: string): Promise<string | undefined> {
  const base = `/var/cpanel/userdata/${user}`;
  if (!(await exists(base))) return undefined;
  const want = path.resolve(dir);
  try {
    const entries = await fs.readdir(base);
    for (const f of entries) {
      if (!looksLikeDomain(f)) continue;
      const full = path.join(base, f);
      const stat = await fs.stat(full).catch(() => undefined);
      if (!stat || !stat.isFile()) continue;
      const raw = await fs.readFile(full, 'utf8').catch(() => '');
      const docroot = raw.match(/^documentroot:\s*(\S+)/m)?.[1]?.trim();
      if (!docroot) continue;
      if (path.resolve(docroot) === want) {
        const srv = raw.match(/^servername:\s*(\S+)/m)?.[1]?.trim();
        return srv ?? f;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function detectDomain(user: string, dir: string, flag?: string): Promise<string | undefined> {
  if (flag) return flag;

  const byDocroot = await cpanelDomainForDir(user, dir);
  if (byDocroot) return byDocroot;

  const base = path.basename(dir);
  if (looksLikeDomain(base)) return base;

  const cpanel = path.join('/var/cpanel/userdata', user, 'main');
  if (await exists(cpanel)) {
    try {
      const raw = await fs.readFile(cpanel, 'utf8');
      const m = raw.match(/main_domain:\s*(\S+)/);
      if (m?.[1]) return m[1].trim();
    } catch {
      // ignore
    }
  }
  const nginxDir = '/etc/nginx';
  if (await exists(nginxDir)) {
    try {
      const files = await fs.readdir(nginxDir);
      for (const f of files) {
        if (!f.endsWith('.conf')) continue;
        const content = await fs.readFile(path.join(nginxDir, f), 'utf8');
        const sm = content.match(/server_name\s+([^;]+);/);
        if (sm?.[1]) {
          const first = sm[1].trim().split(/\s+/)[0];
          if (first && !first.includes('*') && looksLikeDomain(first)) return first;
        }
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}
