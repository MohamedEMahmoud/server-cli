import fs from 'fs-extra';
import path from 'node:path';
import { writeHtaccess } from '../core/htaccess.js';
import {
  npmInstallWithForeignSharpRecovery,
  sanitizeForeignSharpBinariesForNuxt,
} from '../core/npm-sanitize.js';
import { syncDeclaredPortInConfigFiles } from '../core/sync-port-files.js';
import type { PM2AppEntry, ResolvedContext } from '../types.js';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { deploy } from './deploy.js';

export async function runNuxt(ctx: ResolvedContext): Promise<void> {
  await deploy(ctx, {
    async install(c) {
      await sanitizeForeignSharpBinariesForNuxt(c.dir, { dryRun: c.flags.dryRun });
      const serverDir = path.join(c.dir, '.output', 'server');
      logger.step(2, 13, 'removing node_modules in .output/server');
      const nm = path.join(serverDir, 'node_modules');
      if (await fs.pathExists(nm)) {
        await run('rm', ['-rf', nm], { dryRun: c.flags.dryRun, verbose: c.flags.verbose });
      }
      logger.step(3, 13, 'npm i (.output/server)');
      await npmInstallWithForeignSharpRecovery(serverDir, {
        dryRun: c.flags.dryRun,
        verbose: c.flags.verbose,
      });
      logger.step(4, 13, 'nuxt build already done (skipping)');
    },
    async writeArtifacts(c) {
      logger.step(5, 13, 'writing .htaccess');
      logger.step(6, 13, `clearing nginx cache for user=${c.user}`);
      logger.step(7, 13, 'locking .htaccess (chattr +ia)');
      await writeHtaccess(c.dir, 'nuxt', c.port!, c.user, c.flags.dryRun, c.flags.verbose);
      await syncDeclaredPortInConfigFiles(c.dir, c.port!, { dryRun: c.flags.dryRun });
    },
    pm2Entry(c): PM2AppEntry {
      return {
        name: c.name,
        script: path.join(c.dir, '.output', 'server', 'index.mjs'),
        cwd: c.dir,
        exec_mode: 'cluster',
        instances: 1,
        env: { NODE_ENV: 'production', PORT: String(c.port) },
      };
    },
  });
}
