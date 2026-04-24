import fs from 'fs-extra';
import path from 'node:path';
import { exists, writeAtomic } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { run, runNpm } from '../utils/exec.js';

/** True if this @img/sharp-* optional binary must not be installed on `platform`. */
export function isForeignBinarySharpPackage(
  name: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!name.startsWith('@img/sharp-')) return false;
  if (platform === 'win32') {
    return /@img\/sharp-(linux|darwin|linuxmusl)/i.test(name);
  }
  if (platform === 'darwin') {
    return /@img\/sharp-(linux|win32|linuxmusl)/i.test(name);
  }
  if (platform === 'linux') {
    return /@img\/sharp-(win32|darwin)/i.test(name);
  }
  return /@img\/sharp-(win32|darwin)/i.test(name);
}

function pruneDepKeys(deps: Record<string, string> | undefined): string[] {
  if (!deps) return [];
  const removed: string[] = [];
  for (const k of Object.keys(deps)) {
    if (isForeignBinarySharpPackage(k)) {
      removed.push(k);
      delete deps[k];
    }
  }
  return removed;
}

const DEP_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

async function sanitizePackageJson(dir: string, dryRun?: boolean): Promise<string[]> {
  const pj = path.join(dir, 'package.json');
  if (!(await exists(pj))) return [];
  const raw = await fs.readFile(pj, 'utf8');
  const data = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const removed: string[] = [];
  for (const key of DEP_SECTIONS) {
    removed.push(...pruneDepKeys(data[key]));
  }
  if (removed.length === 0) return [];
  if (dryRun) {
    logger.info(`DRY would remove from package.json: ${removed.join(', ')}`);
    return removed;
  }
  await writeAtomic(pj, `${JSON.stringify(data, null, 2)}\n`);
  logger.warn(`removed foreign @img/sharp binaries from package.json: ${removed.join(', ')}`);
  return removed;
}

async function sanitizePackageLock(dir: string, dryRun?: boolean): Promise<string[]> {
  const lockPath = path.join(dir, 'package-lock.json');
  if (!(await exists(lockPath))) return [];
  const raw = await fs.readFile(lockPath, 'utf8');
  const lock = JSON.parse(raw) as {
    packages?: Record<
      string,
      {
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      }
    >;
  };
  const removedKeys: string[] = [];
  if (lock.packages) {
    for (const key of Object.keys(lock.packages)) {
      const tail = key.replace(/^.*node_modules\//, '');
      if (isForeignBinarySharpPackage(tail)) {
        delete lock.packages[key];
        removedKeys.push(key);
      }
    }
    for (const entry of Object.values(lock.packages)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.dependencies) pruneDepKeys(entry.dependencies);
      if (entry.optionalDependencies) pruneDepKeys(entry.optionalDependencies);
      if (entry.peerDependencies) pruneDepKeys(entry.peerDependencies);
    }
  }
  if (removedKeys.length === 0) return [];
  if (dryRun) {
    logger.info(`DRY would strip ${removedKeys.length} foreign @img/sharp entries from package-lock.json`);
    return removedKeys;
  }
  await writeAtomic(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  logger.warn(
    `stripped ${removedKeys.length} foreign @img/sharp package(s) from package-lock.json (e.g. win32 on Linux)`,
  );
  return removedKeys;
}

/**
 * Remove platform-specific @img/sharp-* entries that belong to another OS (common when
 * package-lock.json was generated on Windows but deploy runs on Linux).
 */
export async function sanitizeForeignSharpBinaries(
  dir: string,
  opts: { dryRun?: boolean } = {},
): Promise<void> {
  await sanitizePackageJson(dir, opts.dryRun);
  await sanitizePackageLock(dir, opts.dryRun);
}

export async function sanitizeForeignSharpBinariesForNuxt(
  projectDir: string,
  opts: { dryRun?: boolean } = {},
): Promise<void> {
  await sanitizeForeignSharpBinaries(projectDir, opts);
  const serverDir = path.join(projectDir, '.output', 'server');
  if (await exists(path.join(serverDir, 'package.json'))) {
    await sanitizeForeignSharpBinaries(serverDir, opts);
    if (!opts.dryRun) {
      const lock = path.join(serverDir, 'package-lock.json');
      if (await exists(lock)) {
        await fs.remove(lock);
        logger.warn(
          'removed .output/server/package-lock.json so npm can resolve deps for this Linux host (avoid stale cross-platform lock)',
        );
      }
    }
  }
}

/** Parse package name from npm "Unsupported platform for <pkg>@<ver>" output. */
export function parseUnsupportedPlatformPackage(message: string): string | undefined {
  const m = message.match(/Unsupported platform for (\S+)/i);
  if (!m?.[1]) return undefined;
  let p = m[1].replace(/:+$/, '');
  const at2 = p.indexOf('@', 1);
  if (at2 > 0) p = p.slice(0, at2);
  return p || undefined;
}

/** Remove exact package names from all dependency sections in package.json. */
export async function removePackageNamesFromPackageJson(
  dir: string,
  names: Set<string>,
  dryRun?: boolean,
): Promise<string[]> {
  const pj = path.join(dir, 'package.json');
  if (!(await exists(pj)) || names.size === 0) return [];
  const raw = await fs.readFile(pj, 'utf8');
  const data = JSON.parse(raw) as Record<string, Record<string, string> | undefined>;
  const removed: string[] = [];
  for (const section of DEP_SECTIONS) {
    const deps = data[section];
    if (!deps) continue;
    for (const n of names) {
      if (Object.prototype.hasOwnProperty.call(deps, n)) {
        delete deps[n];
        removed.push(`${section}:${n}`);
      }
    }
  }
  if (removed.length === 0) return [];
  if (dryRun) {
    logger.info(`DRY would remove from package.json: ${removed.join(', ')}`);
    return removed;
  }
  await writeAtomic(pj, `${JSON.stringify(data, null, 2)}\n`);
  logger.warn(`removed packages from package.json after install failure: ${removed.join(', ')}`);
  return removed;
}

function isNpmBadPlatformError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /EBADPLATFORM|notsup|Unsupported platform/i.test(m);
}

/**
 * Run `npm i` in `cwd`. If npm fails with wrong-platform (e.g. @img/sharp-win32-x64 on Linux),
 * strip foreign @img/sharp entries from package.json + lockfile, remove node_modules, and retry once.
 */
export async function npmInstallWithForeignSharpRecovery(
  cwd: string,
  opts: { dryRun?: boolean; verbose?: boolean },
): Promise<void> {
  if (opts.dryRun) {
    await runNpm(['i'], { cwd, dryRun: true, verbose: opts.verbose });
    return;
  }
  try {
    await runNpm(['i'], { cwd, verbose: opts.verbose });
    return;
  } catch (e) {
    if (!isNpmBadPlatformError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('npm i failed (wrong-platform package); fixing package.json/lockfile and retrying');

    await sanitizeForeignSharpBinaries(cwd, {});

    const parsed = parseUnsupportedPlatformPackage(msg);
    if (parsed) {
      await removePackageNamesFromPackageJson(cwd, new Set([parsed]), false);
    }

    const nm = path.join(cwd, 'node_modules');
    await run('rm', ['-rf', nm], { dryRun: false, verbose: opts.verbose }).catch(() => undefined);

    await runNpm(['i'], { cwd, verbose: opts.verbose });
  }
}
