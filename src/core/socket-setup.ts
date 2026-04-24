import fs from 'fs-extra';
import path from 'node:path';
import type { GlobalFlags } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import { run } from '../utils/exec.js';
import { exists, isEmptyDir, writeAtomic } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { npmInstallWithForeignSharpRecovery } from './npm-sanitize.js';

const SOCKET_REPO = 'https://github.com/MohamedEMahmoud/node.git';
const SOCKET_ENV_HEADER = '# --- merged from socket/.env ---';

export function socketDir(projectDir: string): string {
  return path.join(projectDir, 'node');
}

export async function ensureSocketRepo(projectDir: string, flags: GlobalFlags): Promise<void> {
  const target = socketDir(projectDir);
  if (await exists(path.join(target, 'app.js'))) {
    logger.info(`node repo present at ${target}`);
    return;
  }
  if ((await exists(target)) && !(await isEmptyDir(target))) {
    logger.warn(`${target} exists and is not empty; skipping clone`);
    return;
  }
  logger.info(`cloning ${SOCKET_REPO} → ${target}`);
  await fs.mkdir(projectDir, { recursive: true });
  await run('git', ['clone', SOCKET_REPO, target], {
    dryRun: flags.dryRun,
    verbose: flags.verbose,
  });
  if (!flags.dryRun) {
    await fs.remove(path.join(target, '.git'));
    logger.info(`removed .git from ${target}`);
  }
}

export async function installSocketDeps(projectDir: string, flags: GlobalFlags): Promise<void> {
  await npmInstallWithForeignSharpRecovery(socketDir(projectDir), {
    dryRun: flags.dryRun,
    verbose: flags.verbose,
  });
}

function lineKey(line: string): string | undefined {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
  return m ? m[1] : undefined;
}

function ensureTrailingNewline(s: string): string {
  if (s.length === 0) return s;
  return s.endsWith('\n') ? s : `${s}\n`;
}

// Keys whose values are derived from the current deploy (domain + port). A stale
// value from a previous deploy must lose — always overwrite in place.
const MANAGED_KEYS = ['NODE_HOST', 'NODE_PORT', 'NODE_MODE', 'KEY', 'CERT', 'CA', 'APP_URL'] as const;
// App-level defaults the socket server expects. Leave whatever the user set; only
// fill in when missing so a fresh .env gets sane defaults.
const CONSTANT_KEYS = ['STORAGE', 'IMAGES', 'ROOMS'] as const;
const MANAGED = new Set<string>(MANAGED_KEYS);
const CONSTANTS = new Set<string>(CONSTANT_KEYS);

function socketEnvBlock(domain: string, port: number): Map<string, string> {
  const certDir = `/var/cpanel/ssl/apache_tls/${domain}`;
  return new Map<string, string>([
    ['NODE_HOST', `NODE_HOST=${domain}`],
    ['NODE_PORT', `NODE_PORT=${port}`],
    ['NODE_MODE', `NODE_MODE=live`],
    ['KEY', `KEY =${certDir}/combined`],
    ['CERT', `CERT =${certDir}/certificates`],
    ['CA', `CA =${certDir}/combined`],
    ['APP_URL', `APP_URL=https://${domain}`],
    ['STORAGE', `STORAGE = storage`],
    ['IMAGES', `IMAGES = images`],
    ['ROOMS', `ROOMS = rooms`],
  ]);
}

/**
 * Merge the socket env block into `<dir>/.env` using the detected domain.
 *
 * Split policy:
 *   - MANAGED_KEYS (NODE_HOST, NODE_PORT, NODE_MODE, KEY, CERT, CA) are always
 *     overwritten with the current deploy's values — stale template values from
 *     a prior deploy must not win, otherwise the socket app binds to the wrong
 *     host/port and crash-loops.
 *   - CONSTANT_KEYS (STORAGE, IMAGES, ROOMS) are inserted only if missing; a
 *     user-set value is preserved.
 *   - Any other key in .env is left untouched.
 *
 * Also removes `<dir>/socket/.env` if present.
 */
export async function injectSocketEnvBlock(
  projectDir: string,
  opts: { domain: string; port: number },
  flags: GlobalFlags,
): Promise<void> {
  if (!opts.domain) {
    throw new ServerCliError('socket setup requires a domain for SSL paths', {
      code: 10,
      hint: 'pass --domain <d> or deploy from /home/<user>/<domain>/',
    });
  }
  const envPath = path.join(projectDir, '.env');
  const current = (await exists(envPath)) ? await fs.readFile(envPath, 'utf8') : '';

  const lines = current === '' ? [] : current.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const block = socketEnvBlock(opts.domain, opts.port);
  const seen = new Set<string>();
  let overwrites = 0;

  for (let i = 0; i < lines.length; i++) {
    const k = lineKey(lines[i]!);
    if (!k) continue;
    if (MANAGED.has(k)) {
      const want = block.get(k)!;
      if (lines[i] !== want) {
        lines[i] = want;
        overwrites++;
      }
      seen.add(k);
    } else if (CONSTANTS.has(k)) {
      seen.add(k);
    }
  }

  const toAppend: string[] = [];
  for (const k of MANAGED_KEYS) {
    if (!seen.has(k)) toAppend.push(block.get(k)!);
  }
  for (const k of CONSTANT_KEYS) {
    if (!seen.has(k)) toAppend.push(block.get(k)!);
  }

  const socketEnv = path.join(socketDir(projectDir), '.env');

  const hasHeader = lines.some((l) => l.includes(SOCKET_ENV_HEADER));
  const out: string[] = [...lines];
  if (toAppend.length > 0 && !hasHeader) {
    if (out.length > 0) out.push('');
    out.push(SOCKET_ENV_HEADER);
  }
  out.push(...toAppend);

  // Final pass: ensure every managed key in the assembled output exactly matches
  // the block value (catches duplicates or stale values from prior manual edits).
  let fixups = 0;
  for (let i = 0; i < out.length; i++) {
    const k = lineKey(out[i]!);
    if (!k || !MANAGED.has(k)) continue;
    const want = block.get(k)!;
    if (out[i] !== want) {
      out[i] = want;
      fixups++;
    }
  }

  const anyChange = overwrites > 0 || toAppend.length > 0 || fixups > 0;

  if (!anyChange) {
    logger.info(`socket env block up to date — all domain keys consistent: ${opts.domain}`);
  } else {
    const next = out.join('\n') + '\n';
    if (flags.dryRun) {
      logger.info(
        `DRY would update ${envPath}: overwrite ${overwrites} managed, append ${toAppend.length}, fixup ${fixups}`,
      );
    } else {
      await writeAtomic(envPath, next);
      logger.info(
        `updated ${envPath}: overwrote ${overwrites} managed key(s), appended ${toAppend.length}, fixed ${fixups} — domain: ${opts.domain}`,
      );
    }
  }

  if (await exists(socketEnv)) {
    if (flags.dryRun) {
      logger.info(`DRY would rm ${socketEnv}`);
    } else {
      await fs.remove(socketEnv);
      logger.info(`removed ${socketEnv}`);
    }
  }
}

/**
 * Ensure `<dir>/.gitignore` ignores `socket/node_modules`. Creates the file if
 * missing, appends the entry if missing. Idempotent.
 */
export async function ensureSocketGitignore(
  projectDir: string,
  flags: GlobalFlags,
): Promise<void> {
  const giPath = path.join(projectDir, '.gitignore');
  const current = (await exists(giPath)) ? await fs.readFile(giPath, 'utf8') : '';
  const already = current
    .split(/\r?\n/)
    .some((line) => /^\s*\/?node\/node_modules\/?\s*$/.test(line));
  if (already) {
    logger.info('.gitignore already ignores /node/node_modules');
    return;
  }
  const prefix = current.length === 0 ? '' : ensureTrailingNewline(current);
  const header = current.length === 0 ? '' : '\n# node\n';
  const next = `${prefix}${header}/node/node_modules\n`;
  if (flags.dryRun) {
    logger.info(`DRY would add /node/node_modules to ${giPath}`);
    return;
  }
  await writeAtomic(giPath, next);
  logger.info(`added /node/node_modules to ${giPath}`);
}

const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})\b/gi;

function rewriteLine(line: string, newDomain: string): string {
  if (!/https?:\/\//i.test(line) && !/\b[A-Z_]*DOMAIN\b/.test(line)) return line;
  return line.replace(DOMAIN_RE, (match) => {
    if (match === newDomain) return match;
    if (/^(github|npmjs|nodejs|example)\.com$/i.test(match)) return match;
    if (/\.(png|jpg|jpeg|svg|gif|css|js|json|md)$/i.test(match)) return match;
    return newDomain;
  });
}

/** Rewrite domain-shaped tokens on URL / DOMAIN= lines inside `<dir>/socket/*.md`. */
export async function updateDocsDomain(
  projectDir: string,
  newDomain: string,
  flags: GlobalFlags,
): Promise<void> {
  const dir = socketDir(projectDir);
  if (!(await exists(dir))) return;
  const files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md'));
  for (const rel of files) {
    const full = path.join(dir, rel);
    const raw = await fs.readFile(full, 'utf8');
    const next = raw
      .split(/\r?\n/)
      .map((l) => rewriteLine(l, newDomain))
      .join('\n');
    if (next === raw) continue;
    if (flags.dryRun) {
      logger.info(`DRY would rewrite domain in socket/${rel}`);
      continue;
    }
    await writeAtomic(full, next);
    logger.info(`rewrote domain in socket/${rel}`);
  }
}

/** Rewrite every hardcoded domain and port inside `node/SOCKET-EVENTS.md`. */
export async function rewriteSocketEventsDoc(
  projectDir: string,
  domain: string,
  port: number,
  flags: GlobalFlags,
): Promise<void> {
  const filePath = path.join(socketDir(projectDir), 'SOCKET-EVENTS.md');
  if (!(await exists(filePath))) return;

  const raw = await fs.readFile(filePath, 'utf8');

  let next = raw;
  // https?://any-domain:any-port  →  https://domain:port
  next = next.replace(/https?:\/\/[A-Za-z0-9._-]+:\d+/g, `https://${domain}:${port}`);
  // NODE_HOST=any-value
  next = next.replace(/NODE_HOST=[^\s`\n]*/g, `NODE_HOST=${domain}`);
  // NODE_PORT=any-value
  next = next.replace(/NODE_PORT=[^\s`\n]*/g, `NODE_PORT=${port}`);
  // APP_URL=https?://any-value
  next = next.replace(/APP_URL=https?:\/\/[^\s`\n]*/g, `APP_URL=https://${domain}`);

  if (next === raw) {
    logger.info('node/SOCKET-EVENTS.md already up to date');
    return;
  }
  if (flags.dryRun) {
    logger.info(`DRY would update node/SOCKET-EVENTS.md — domain: ${domain}, port: ${port}`);
    return;
  }
  await writeAtomic(filePath, next);
  logger.info(`updated node/SOCKET-EVENTS.md — domain: ${domain}, port: ${port}`);
}
