import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import type { GlobalFlags } from '../types.js';

/** execa often inherits a short PATH; prepend standard system paths. */
function execEnv(): NodeJS.ProcessEnv {
  const extra = ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin'].join(
    ':',
  );
  return {
    ...process.env,
    PATH: `${extra}:${process.env.PATH ?? ''}`,
  };
}

function firstExistingBin(candidates: string[]): string | undefined {
  for (const n of candidates) {
    if (existsSync(n)) return n;
  }
  return undefined;
}

/** Find binary when Node's PATH may omit `/usr/bin`. */
function resolveCmd(name: string): string | undefined {
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
  const dirs = [
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/local/cpanel/3rdparty/bin',
  ];
  for (const dir of dirs) {
    const full = path.join(dir, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

const SUPERVISORCTL_EXTRA = [
  '/usr/bin/supervisorctl',
  '/bin/supervisorctl',
  '/usr/local/bin/supervisorctl',
  '/usr/local/cpanel/3rdparty/bin/supervisorctl',
];

function findSupervisorctl(): string | undefined {
  return resolveCmd('supervisorctl') ?? firstExistingBin(SUPERVISORCTL_EXTRA);
}

const SYSTEMCTL_FIXED = ['/usr/bin/systemctl', '/bin/systemctl'];

function findSystemctl(): string {
  return resolveCmd('systemctl') ?? firstExistingBin(SYSTEMCTL_FIXED) ?? 'systemctl';
}

const SERVICE_FIXED = ['/sbin/service', '/usr/sbin/service', '/bin/service'];

function findService(): string | undefined {
  return resolveCmd('service') ?? firstExistingBin(SERVICE_FIXED);
}

const UNITS = ['supervisord', 'supervisor'];

/**
 * Reload Supervisor: use absolute `systemctl` when possible and a full PATH.
 * Tries sudo → plain systemctl → `service`, for both unit names, then `supervisorctl`.
 */
export async function reloadSupervisor(flags: GlobalFlags): Promise<void> {
  const d = flags.dryRun;
  const v = flags.verbose;
  const env = execEnv() as Record<string, string>;
  const sc = findSystemctl();

  for (const unit of UNITS) {
    try {
      await run('sudo', [sc, 'stop', unit], { dryRun: d, verbose: v, env }).catch(() => undefined);
      await run('sudo', [sc, 'restart', unit], { dryRun: d, verbose: v, env });
      logger.dim(`supervisor reloaded: sudo ${sc} stop/restart ${unit}`);
      return;
    } catch {
      // next
    }
  }

  for (const unit of UNITS) {
    try {
      await run(sc, ['stop', unit], { dryRun: d, verbose: v, env }).catch(() => undefined);
      await run(sc, ['restart', unit], { dryRun: d, verbose: v, env });
      logger.dim(`supervisor reloaded: ${sc} stop/restart ${unit}`);
      return;
    } catch {
      // next
    }
  }

  const svcBin = findService();
  if (svcBin) {
    for (const unit of UNITS) {
      try {
        await run(svcBin, [unit, 'stop'], { dryRun: d, verbose: v, env }).catch(() => undefined);
        await run(svcBin, [unit, 'restart'], { dryRun: d, verbose: v, env });
        logger.dim(`supervisor reloaded: ${svcBin} ${unit} stop/restart`);
        return;
      } catch {
        // next
      }
    }
  }

  const ctl = findSupervisorctl();
  if (ctl) {
    try {
      await run(ctl, ['reread'], { dryRun: d, verbose: v, env });
      await run(ctl, ['update'], { dryRun: d, verbose: v, env });
      logger.dim(`supervisor reloaded via ${ctl} reread/update`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`supervisorctl at ${ctl} failed: ${msg}`);
    }
  }

  throw new Error(
    `could not reload Supervisor (tried sudo/systemctl/service for ${UNITS.join('/')}, and supervisorctl). ` +
      `systemctl resolved to ${sc}. Install supervisor or run: ${SYSTEMCTL_FIXED[0]} restart supervisord`,
  );
}
