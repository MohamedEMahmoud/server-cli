import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'fs-extra';
import path from 'node:path';
import { run } from '../utils/exec.js';
import { backup } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import type { GlobalFlags } from '../types.js';

const PATH_DIRS = ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin'];

/** Minimal self-contained scaffold used when `echo_supervisord_conf` is unavailable. */
const FALLBACK_DEFAULT_CONF = `[unix_http_server]
file=/run/supervisor/supervisor.sock
chmod=0700

[supervisord]
logfile=/var/log/supervisor/supervisord.log
logfile_maxbytes=50MB
logfile_backups=10
loglevel=info
pidfile=/run/supervisord.pid
nodaemon=false
minfds=1024
minprocs=200

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///run/supervisor/supervisor.sock

[include]
files = supervisord.d/*.ini
`;

function execEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    PATH: `${PATH_DIRS.join(':')}:${process.env.PATH ?? ''}`,
  };
}

function resolveBin(name: string): string | undefined {
  try {
    const out = execSync(`command -v "${name}" 2>/dev/null`, {
      encoding: 'utf8',
      env: execEnv(),
      shell: '/bin/sh',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const first = out.split('\n')[0]?.trim();
    if (first && existsSync(first)) return first;
  } catch {
    // ignore
  }
  for (const dir of PATH_DIRS) {
    const full = path.join(dir, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

function sudoWrap(cmd: string, args: string[]): [string, string[]] {
  if (isRoot()) return [cmd, args];
  const sudo = resolveBin('sudo');
  if (!sudo) return [cmd, args];
  return [sudo, [cmd, ...args]];
}

type PkgManager = { name: 'dnf' | 'yum' | 'apt-get'; bin: string };

function detectPkgManager(): PkgManager | undefined {
  for (const n of ['dnf', 'yum', 'apt-get'] as const) {
    const bin = resolveBin(n);
    if (bin) return { name: n, bin };
  }
  return undefined;
}

/** Extract every `[program:<name>] … (until next section or EOF)` block. */
export function extractProgramBlocks(raw: string): string[] {
  const lines = raw.split('\n');
  const blocks: string[] = [];
  let buf: string[] | null = null;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      if (buf) {
        blocks.push(buf.join('\n').trimEnd());
        buf = null;
      }
      if (header[1]!.startsWith('program:')) buf = [line];
      continue;
    }
    if (buf) buf.push(line);
  }
  if (buf) blocks.push(buf.join('\n').trimEnd());
  return blocks;
}

/** A conf without `[supervisord]` / `[unix_http_server]` can't actually run a daemon. */
export function confLooksUsable(raw: string): boolean {
  const t = raw.trim();
  return t.includes('[supervisord]') || t.includes('[unix_http_server]');
}

/** Find `[include] files = …` dir if any line uses a `*.ini` / `*.conf` glob. */
export function parseIncludeDir(raw: string, confPath: string): string | undefined {
  const lines = raw.split('\n');
  let inInclude = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      inInclude = header[1] === 'include';
      continue;
    }
    if (!inInclude) continue;
    const m = line.match(/^\s*files\s*=\s*(.+?)\s*(?:;.*)?$/);
    if (!m) continue;
    for (const tok of m[1]!.split(/\s+/)) {
      const idx = tok.search(/[*?]/);
      if (idx < 0) continue;
      let dir = tok.slice(0, idx).replace(/\/+$/, '');
      if (!dir) continue;
      if (!path.isAbsolute(dir)) dir = path.resolve(path.dirname(confPath), dir);
      return dir;
    }
  }
  return undefined;
}

async function installPackage(pm: PkgManager, flags: GlobalFlags): Promise<void> {
  const env = execEnv();
  const args =
    pm.name === 'apt-get'
      ? ['-y', 'install', 'supervisor']
      : ['install', '-y', 'supervisor'];
  if (pm.name === 'apt-get') {
    const [uc, ua] = sudoWrap(pm.bin, ['update']);
    await run(uc, ua, { dryRun: flags.dryRun, verbose: flags.verbose, env }).catch(() => undefined);
  }
  const [c, a] = sudoWrap(pm.bin, args);
  await run(c, a, { dryRun: flags.dryRun, verbose: flags.verbose, env });
}

/**
 * After `dnf install supervisor`, if the pre-existing conf lacked core sections
 * the package writes `${conf}.rpmnew` and leaves the old file in place. Swap them
 * and relocate any user `[program:…]` blocks to the include dir (or re-append).
 */
async function mergeRpmnewIfPresent(confPath: string, flags: GlobalFlags): Promise<void> {
  const rpmnew = `${confPath}.rpmnew`;
  if (!(await fs.pathExists(rpmnew))) return;
  const currentRaw = (await fs.pathExists(confPath)) ? await fs.readFile(confPath, 'utf8') : '';
  const newRaw = await fs.readFile(rpmnew, 'utf8');
  if (confLooksUsable(currentRaw)) return; // user's file is fine; leave .rpmnew alone

  if (flags.dryRun) {
    logger.info(`DRY would swap ${rpmnew} → ${confPath} and relocate program blocks`);
    return;
  }

  const programs = extractProgramBlocks(currentRaw);
  await backup(confPath, 5);
  await fs.move(rpmnew, confPath, { overwrite: true });

  if (programs.length === 0) {
    logger.dim(`replaced bare ${confPath} with packaged config`);
    return;
  }

  const includeDir = parseIncludeDir(newRaw, confPath);
  if (includeDir) {
    await fs.mkdir(includeDir, { recursive: true });
    for (const block of programs) {
      const name = block.match(/^\s*\[program:([^\]]+)\]/)?.[1] ?? `program-${Date.now()}`;
      const dest = path.join(includeDir, `${name}.ini`);
      await fs.writeFile(dest, `${block}\n`, 'utf8');
    }
    logger.dim(`moved ${programs.length} program block(s) to ${includeDir}`);
  } else {
    const main = await fs.readFile(confPath, 'utf8');
    const appended = `${main.trimEnd()}\n\n${programs.join('\n\n')}\n`;
    await fs.writeFile(confPath, appended, 'utf8');
    logger.dim(`re-appended ${programs.length} program block(s) to ${confPath}`);
  }
}

/** Produce a default supervisor config. Prefers the package-provided generator. */
export async function generateDefaultConf(): Promise<string> {
  const gen = resolveBin('echo_supervisord_conf');
  if (gen) {
    try {
      const out = execSync(gen, {
        encoding: 'utf8',
        env: execEnv(),
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (out.includes('[supervisord]') && out.includes('[supervisorctl]')) return out;
    } catch {
      // fall through
    }
  }
  return FALLBACK_DEFAULT_CONF;
}

/**
 * Ensure `confPath` contains the core supervisor sections. Preserves any existing
 * `[program:*]` blocks: moves them to the `[include]` dir when one is defined,
 * otherwise re-appends them to the healed main conf.
 */
export async function ensureUsableConf(confPath: string, flags: GlobalFlags): Promise<void> {
  await mergeRpmnewIfPresent(confPath, flags);

  const raw = (await fs.pathExists(confPath)) ? await fs.readFile(confPath, 'utf8') : '';
  if (confLooksUsable(raw)) return;

  if (flags.dryRun) {
    logger.info(`DRY would heal ${confPath} with supervisor defaults`);
    return;
  }

  const generated = await generateDefaultConf();
  const programs = extractProgramBlocks(raw);

  await backup(confPath, 5);
  await fs.mkdir(path.dirname(confPath), { recursive: true });
  await fs.writeFile(confPath, generated, 'utf8');

  if (programs.length === 0) {
    logger.dim(`healed ${confPath} with supervisor defaults`);
    return;
  }

  const includeDir = parseIncludeDir(generated, confPath);
  if (includeDir) {
    await fs.mkdir(includeDir, { recursive: true });
    for (const block of programs) {
      const name = block.match(/^\s*\[program:([^\]]+)\]/)?.[1] ?? `program-${Date.now()}`;
      const dest = path.join(includeDir, `${name}.ini`);
      if (await fs.pathExists(dest)) {
        const existing = await fs.readFile(dest, 'utf8');
        if (existing.trim() === block.trim()) continue;
      }
      await fs.writeFile(dest, `${block}\n`, 'utf8');
    }
    logger.dim(`healed ${confPath}; moved ${programs.length} program block(s) to ${includeDir}`);
  } else {
    const main = await fs.readFile(confPath, 'utf8');
    await fs.writeFile(confPath, `${main.trimEnd()}\n\n${programs.join('\n\n')}\n`, 'utf8');
    logger.dim(`healed ${confPath}; re-appended ${programs.length} program block(s)`);
  }
}

async function startSupervisord(flags: GlobalFlags): Promise<void> {
  const sc = resolveBin('systemctl');
  if (!sc) return;
  const env = execEnv();
  for (const unit of ['supervisord', 'supervisor']) {
    const [ec, ea] = sudoWrap(sc, ['enable', '--now', unit]);
    try {
      await run(ec, ea, { dryRun: flags.dryRun, verbose: flags.verbose, env });
      logger.dim(`supervisor service enabled+started (${unit})`);
      return;
    } catch {
      // try next unit name
    }
  }
}

/**
 * Ensure supervisor is installed and its daemon is running.
 * No-op when `supervisord` is already on PATH.
 */
export async function ensureSupervisorInstalled(
  confPath: string,
  flags: GlobalFlags,
): Promise<void> {
  const alreadyInstalled = !!resolveBin('supervisord');

  if (!alreadyInstalled) {
    const pm = detectPkgManager();
    if (!pm) {
      throw new Error(
        'supervisord not found and no supported package manager (dnf/yum/apt-get) available',
      );
    }
    logger.info(`installing supervisor via ${pm.name}…`);
    await installPackage(pm, flags);
    if (!flags.dryRun && !resolveBin('supervisord')) {
      throw new Error(`supervisor install via ${pm.name} did not produce a supervisord binary`);
    }
  }

  await ensureUsableConf(confPath, flags);

  if (!alreadyInstalled) await startSupervisord(flags);
}
