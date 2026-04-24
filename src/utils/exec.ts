import { execa } from 'execa';
import { logger } from './logger.js';
import { resolveNpmInvocation } from './npm-path.js';

export interface ExecOpts {
  cwd?: string;
  env?: Record<string, string>;
  verbose?: boolean;
}

function formatExecError(cmd: string, err: unknown): Error {
  const e = err as {
    message?: string;
    shortMessage?: string;
    stderr?: string | Buffer;
    stdout?: string | Buffer;
    exitCode?: number;
    signal?: string;
  };
  const chunks = [e.stderr, e.stdout, e.shortMessage, e.message]
    .map((x) => (x == null ? '' : x.toString().trim()))
    .filter(Boolean);
  const out = [...new Set(chunks)].join('\n').trim();
  const code = e.exitCode;
  const meta = [
    code !== undefined && code !== null ? `code ${code}` : null,
    e.signal ? `signal ${e.signal}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return new Error(`${cmd} failed${meta ? ` (${meta})` : ''}: ${out || 'no output'}`);
}

export async function run(
  cmd: string,
  args: string[],
  opts?: ExecOpts & { dryRun?: boolean },
): Promise<string> {
  const o = opts ?? {};
  const line = `${cmd} ${args.join(' ')}`.trim();
  if (o.dryRun) {
    logger.info(`DRY $ ${line}`);
    return '';
  }
  if (o.verbose) {
    try {
      await execa(cmd, args, { cwd: o.cwd, env: o.env, stdio: 'inherit' });
      return '';
    } catch (e) {
      throw formatExecError(cmd, e);
    }
  }
  try {
    const r = await execa(cmd, args, {
      cwd: o.cwd,
      env: o.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return (r.stdout || '').toString().trim();
  } catch (e) {
    throw formatExecError(cmd, e);
  }
}

export async function runSh(
  line: string,
  opts?: ExecOpts & { dryRun?: boolean },
): Promise<string> {
  const o = opts ?? {};
  if (o.dryRun) {
    logger.info(`DRY $ ${line}`);
    return '';
  }
  if (o.verbose) {
    try {
      await execa(line, { shell: true, cwd: o.cwd, env: o.env, stdio: 'inherit' });
      return '';
    } catch (e) {
      throw formatExecError('shell', e);
    }
  }
  try {
    const r = await execa(line, {
      shell: true,
      cwd: o.cwd,
      env: o.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return (r.stdout || '').toString().trim();
  } catch (e) {
    throw formatExecError('shell', e);
  }
}

/** Run npm with the same resolution rules as `npm` on PATH, or bundled npm next to `process.execPath`. */
export async function runNpm(
  npmArgs: string[],
  opts?: ExecOpts & { dryRun?: boolean },
): Promise<string> {
  const inv = await resolveNpmInvocation(npmArgs);
  return run(inv.file, inv.args, opts);
}
