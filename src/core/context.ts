import fs from 'fs-extra';
import path from 'node:path';
import type { GlobalFlags, ParsedArgs, ProjectType, ResolvedContext } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import { exists, isEmptyDir } from '../utils/fs.js';
import { run } from '../utils/exec.js';
import { loadConfig } from './config.js';
import { detectDomain, detectName, detectType, detectUser } from './detect.js';

export async function buildResolvedContext(
  parsed: ParsedArgs,
  flags: GlobalFlags,
  opts: { isRestart?: boolean; typeOverride?: ProjectType } = {},
): Promise<ResolvedContext> {
  const dir = parsed.dir ?? process.cwd();
  const { config, project } = await loadConfig(flags, dir);
  const type =
    opts.typeOverride ?? parsed.type ?? project?.type ?? (await detectType(dir));
  const user = detectUser(dir, flags.user ?? project?.env?.USER);
  const domain = await detectDomain(user, dir, flags.domain);
  const name = await detectName(dir, type, flags.name ?? project?.name, user, domain);
  const port = parsed.port ?? project?.port;

  return {
    type,
    dir: path.resolve(dir),
    port,
    user,
    name,
    domain,
    isRestart: opts.isRestart ?? false,
    flags,
    config,
  };
}

export async function assertDeployableDir(ctx: ResolvedContext): Promise<void> {
  if (!(await exists(ctx.dir))) {
    throw new ServerCliError('directory is missing', { code: 20 });
  }
  if (await isEmptyDir(ctx.dir)) {
    throw new ServerCliError('directory is empty', { code: 20, hint: 'deploy a build first' });
  }
  if (ctx.type === 'next') {
    if (!(await exists(path.join(ctx.dir, 'package.json')))) {
      throw new ServerCliError('package.json missing', { code: 40 });
    }
  }
  if (ctx.type === 'nuxt') {
    const rootPkg = path.join(ctx.dir, 'package.json');
    const nitroPkg = path.join(ctx.dir, '.output', 'server', 'package.json');
    if (!(await exists(rootPkg)) && !(await exists(nitroPkg))) {
      throw new ServerCliError(
        'package.json missing (need ./package.json or ./.output/server/package.json for Nuxt output)',
        { code: 40 },
      );
    }
  }
  if (ctx.type === 'socket') {
    // socket/ is bootstrapped (git clone) during runSocket if missing;
    // only require the parent project directory exists and is non-empty.
  }
}

export async function assertProcessJsonWritable(ctx: ResolvedContext): Promise<void> {
  if (ctx.flags.dryRun) return;
  const p = ctx.config.processJsonPath;
  try {
    await fs.ensureFile(p);
    await fs.access(p, fs.constants.W_OK);
  } catch {
    throw new ServerCliError(`cannot write process.json at ${p}`, {
      code: 60,
      hint: 'run with sudo or adjust permissions',
    });
  }
}

export async function assertPm2Installed(dryRun?: boolean): Promise<void> {
  if (dryRun) return;
  try {
    await run('pm2', ['--version'], {});
  } catch {
    throw new ServerCliError('pm2 is not installed or not on PATH', {
      code: 60,
      hint: 'npm i -g pm2',
    });
  }
}
