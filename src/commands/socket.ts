import path from 'node:path';
import type { PM2AppEntry, ResolvedContext } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { socketHealthCheck } from '../core/domain.js';
import {
  ensureSocketGitignore,
  ensureSocketRepo,
  injectSocketEnvBlock,
  installSocketDeps,
  rewriteSocketEventsDoc,
  socketDir,
  updateDocsDomain,
} from '../core/socket-setup.js';
import { syncDeclaredPortInConfigFiles } from '../core/sync-port-files.js';
import { deploy } from './deploy.js';

export async function runSocket(ctx: ResolvedContext): Promise<void> {
  if (!ctx.domain) {
    throw new ServerCliError('socket setup requires a domain for SSL paths', {
      code: 10,
      hint: 'pass --domain <d> or deploy from /home/<user>/<domain>/',
    });
  }
  await deploy(ctx, {
    async install(c) {
      logger.step(2, 13, 'ensure node/ repo (clone + remove .git)');
      await ensureSocketRepo(c.dir, c.flags);
      logger.step(3, 13, 'npm i (node)');
      await installSocketDeps(c.dir, c.flags);
    },
    async writeArtifacts(c) {
      logger.step(5, 13, 'inject node env block');
      await injectSocketEnvBlock(c.dir, { domain: c.domain!, port: c.port! }, c.flags);
      logger.step(6, 13, 'ensure .gitignore ignores /node/node_modules');
      await ensureSocketGitignore(c.dir, c.flags);
      logger.step(7, 13, 'rewrite domain in node docs');
      await updateDocsDomain(c.dir, c.domain!, c.flags);
      logger.step(8, 13, 'update SOCKET-EVENTS.md with domain and port');
      await rewriteSocketEventsDoc(c.dir, c.domain!, c.port!, c.flags);
      logger.step(9, 13, 'sync declared port in config files');
      await syncDeclaredPortInConfigFiles(socketDir(c.dir), c.port!, {
        dryRun: c.flags.dryRun,
      });
    },
    pm2Entry(c): PM2AppEntry {
      const dir = socketDir(c.dir);
      return {
        name: c.name,
        script: path.join(dir, 'app.js'),
        cwd: dir,
        exec_mode: 'cluster',
        instances: 1,
        env: { NODE_ENV: 'production', PORT: String(c.port) },
      };
    },
    async healthCheck(c) {
      await socketHealthCheck(c.domain!, c.port!, c.config.healthcheck, c.name);
    },
  });
}
