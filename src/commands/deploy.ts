import type { PM2AppEntry, ResolvedContext } from '../types.js';
import { healthCheck } from '../core/domain.js';
import { assertPortFree } from '../core/port.js';
import * as processJson from '../core/process-json.js';
import { pm2Delete, pm2ProcessExists, pm2Restart, pm2Save, pm2Start } from '../core/pm2.js';
import {
  assertDeployableDir,
  assertPm2Installed,
  assertProcessJsonWritable,
} from '../core/context.js';
import { ServerCliError } from '../utils/errors.js';
import { chownDeployDir } from '../core/chown-deploy.js';
import { acquire } from '../utils/lock.js';
import { logger } from '../utils/logger.js';

export async function deploy(
  ctx: ResolvedContext,
  hooks: {
    install(ctx: ResolvedContext): Promise<void>;
    writeArtifacts(ctx: ResolvedContext): Promise<void>;
    pm2Entry(ctx: ResolvedContext): PM2AppEntry;
    /** Optional custom health check (e.g. socket.io handshake). If omitted, a GET to http://<domain>/ is used. */
    healthCheck?(ctx: ResolvedContext): Promise<void>;
  },
): Promise<void> {
  const unlock = await acquire(`deploy ${ctx.name}`);
  try {
    if (!ctx.port) throw new ServerCliError('port is required', { code: 10 });

    await assertPm2Installed(ctx.flags.dryRun);
    await assertProcessJsonWritable(ctx);
    await assertDeployableDir(ctx);

    logger.step(1, 13,`port ${ctx.port} free`);
    await assertPortFree(ctx.port, ctx);

    await hooks.install(ctx);
    await hooks.writeArtifacts(ctx);

    await chownDeployDir(ctx);

    logger.step(10, 13, `updating ${ctx.config.processJsonPath}`);
    const docBefore = await processJson.read(ctx.config.processJsonPath);
    const entry = hooks.pm2Entry(ctx);
    const oldEntry = processJson.findByCwd(docBefore, entry.cwd);
    const renamed = Boolean(oldEntry && oldEntry.name !== entry.name);
    if (renamed && !ctx.flags.dryRun) {
      await pm2Delete(oldEntry!.name, ctx.flags.dryRun, ctx.flags.verbose).catch(() => undefined);
    }
    const inProcessJson = Boolean(oldEntry) && !renamed;
    const inPm2 = await pm2ProcessExists(entry.name, ctx.flags.dryRun, ctx.flags.verbose);
    const useRestart = inProcessJson && inPm2;

    const docAfter = processJson.sortByPort(processJson.upsert(docBefore, entry));
    if (!ctx.flags.dryRun) {
      await processJson.writeAtomic(ctx.config.processJsonPath, docAfter);
    }

    logger.step(
      11,
      13,
      useRestart ? `pm2 restart ${entry.name}` : `pm2 start ${ctx.config.processJsonPath} --only ${entry.name}`,
    );
    if (useRestart) await pm2Restart(entry.name, ctx.flags.dryRun, ctx.flags.verbose);
    else await pm2Start(ctx.config.processJsonPath, entry.name, ctx.flags.dryRun, ctx.flags.verbose);

    logger.step(12, 13, 'pm2 save');
    await pm2Save(ctx.flags.dryRun, ctx.flags.verbose);

    if (!ctx.flags.dryRun && !ctx.flags.noHealthcheck && ctx.domain) {
      await new Promise((r) => setTimeout(r, 3000));
    }

    logger.step(13, 13, 'health check');
    if (!ctx.flags.noHealthcheck && ctx.domain) {
      try {
        if (hooks.healthCheck) {
          await hooks.healthCheck(ctx);
          logger.success('health check ok');
        } else {
          const url = `http://${ctx.domain}/`;
          await healthCheck(url, ctx.config.healthcheck);
          logger.success(`health check ${url} ok`);
        }
      } catch (e) {
        logger.error('health check failed — PM2 already started; investigate nginx/app');
        throw e;
      }
    } else if (!ctx.flags.noHealthcheck && !ctx.domain) {
      logger.warn('no domain inferred — skipping health check');
    }

    logger.success(`deployed ${ctx.name} on port ${ctx.port}`);
  } finally {
    await unlock();
  }
}
