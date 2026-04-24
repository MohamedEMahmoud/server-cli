import path from 'node:path';
import { parseArgs } from '../core/args.js';
import { loadConfig } from '../core/config.js';
import { buildResolvedContext } from '../core/context.js';
import { healthCheck, socketHealthCheck } from '../core/domain.js';
import { chownProjectTree } from '../core/chown-deploy.js';
import * as processJson from '../core/process-json.js';
import { pm2ProcessExists, pm2Restart, pm2Save, pm2Start } from '../core/pm2.js';
import { assertPm2Installed } from '../core/context.js';
import type { GlobalFlags, PM2AppEntry, ProjectType } from '../types.js';
import { ServerCliError } from '../utils/errors.js';

const TYPE_KEYWORDS = new Set<ProjectType>(['next', 'nuxt', 'supervisor', 'socket']);

export async function runRestart(tokens: string[], flags: GlobalFlags): Promise<void> {
  await assertPm2Installed(flags.dryRun);
  if (tokens[0] === 'all') {
    const { execa } = await import('execa');
    if (flags.dryRun) {
      const { logger } = await import('../utils/logger.js');
      logger.info('DRY $ pm2 restart all');
      return;
    }
    await execa('pm2', ['restart', 'all'], { stdio: flags.verbose ? 'inherit' : 'pipe' });
    return;
  }

  const parsed = parseArgs(tokens);
  const dir = path.resolve(parsed.dir ?? process.cwd());
  const { config } = await loadConfig(flags, dir);
  const doc = await processJson.read(config.processJsonPath);

  let entry: PM2AppEntry | undefined;
  if (parsed.type === 'socket') {
    const socketCwd = path.join(dir, 'socket');
    entry = doc.apps.find((a) => a.cwd && path.resolve(a.cwd) === socketCwd);
    if (!entry) {
      throw new ServerCliError(`no socket app in ${config.processJsonPath} for project dir ${dir}`, {
        code: 10,
        hint: 'deploy first: server socket <dir> <port>',
      });
    }
  } else if (parsed.type && TYPE_KEYWORDS.has(parsed.type)) {
    entry = processJson.findByProjectDir(doc, dir);
    if (!entry) {
      throw new ServerCliError(`no ${parsed.type} app in ${config.processJsonPath} for project dir ${dir}`, {
        code: 10,
        hint: 'deploy first, or use: server restart <port>',
      });
    }
  } else if (parsed.dir) {
    entry = processJson.findByProjectDir(doc, dir);
    if (!entry) {
      throw new ServerCliError(`no app in ${config.processJsonPath} for project dir ${dir}`, {
        code: 10,
        hint: 'deploy first, or use: server restart <port>',
      });
    }
    if (parsed.port !== undefined) {
      const declared = Number(entry.env?.PORT);
      const want = Number(parsed.port);
      if (Number.isFinite(declared) && Number.isFinite(want) && declared !== want) {
        throw new ServerCliError(
          `PORT mismatch: ${dir} is PORT ${declared} in process.json but you passed ${want}`,
          { code: 10 },
        );
      }
    }
  } else if (parsed.port !== undefined) {
    entry = doc.apps.find((a) => Number(a.env?.PORT) === Number(parsed.port));
  } else {
    entry = processJson.findByProjectDir(doc, dir);
  }

  if (!entry) {
    throw new ServerCliError(`no app registered for ${parsed.port != null ? `port ${parsed.port}` : dir}`, {
      code: 10,
      hint: 'deploy first: server <type> <dir> <port>',
    });
  }

  const inPm2 = await pm2ProcessExists(entry.name, flags.dryRun, flags.verbose);
  if (inPm2) await pm2Restart(entry.name, flags.dryRun, flags.verbose);
  else await pm2Start(config.processJsonPath, entry.name, flags.dryRun, flags.verbose);

  await pm2Save(flags.dryRun, flags.verbose);

  const chownTarget = entry.cwd ? path.resolve(entry.cwd) : dir;
  const isSocketEntry =
    parsed.type === 'socket' ||
    (entry.cwd ? path.basename(path.resolve(entry.cwd)) === 'socket' : false);
  const ctxDir = isSocketEntry ? path.dirname(chownTarget) : chownTarget;
  const ctx = await buildResolvedContext({ ...parsed, dir: ctxDir }, flags, {
    isRestart: true,
    typeOverride: isSocketEntry ? 'socket' : undefined,
  });

  // Let the app bind before HTTP probe; run chown after health so a long recursive chown does not
  // race with the first requests (PM2 restart often needs several seconds for Nuxt/Next).
  const warmupMs = 5000;
  if (!flags.noHealthcheck && !flags.dryRun && ctx.domain) {
    await new Promise((r) => setTimeout(r, warmupMs));
    if (isSocketEntry) {
      const port = Number(entry.env?.PORT);
      if (!Number.isFinite(port)) {
        throw new ServerCliError('socket entry missing numeric PORT in process.json', { code: 10 });
      }
      await socketHealthCheck(ctx.domain, port, ctx.config.healthcheck);
    } else {
      await healthCheck(`http://${ctx.domain}/`, ctx.config.healthcheck);
    }
  }

  await chownProjectTree(ctx.user, chownTarget, flags);
}
