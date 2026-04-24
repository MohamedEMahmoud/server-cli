import fs from 'fs-extra';
import path from 'node:path';
import { getTemplatesDir } from '../core/paths.js';
import { writeHtaccess } from '../core/htaccess.js';
import { npmInstallWithForeignSharpRecovery, sanitizeForeignSharpBinaries } from '../core/npm-sanitize.js';
import { syncDeclaredPortInConfigFiles } from '../core/sync-port-files.js';
import type { PM2AppEntry, ResolvedContext } from '../types.js';
import { run, runNpm } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import { deploy } from './deploy.js';

/**
 * A Next.js project is a static export when either (a) `next.config.*` declares
 * `output: 'export'` (or `next export` produces `out/`), or (b) an `out/` directory
 * already exists after build. Otherwise it's an SSR build served by `next start`.
 */
async function isStaticExport(dir: string): Promise<boolean> {
  if (await fs.pathExists(path.join(dir, 'out'))) return true;
  for (const name of ['next.config.ts', 'next.config.js', 'next.config.mjs', 'next.config.cjs']) {
    const p = path.join(dir, name);
    if (!(await fs.pathExists(p))) continue;
    const raw = await fs.readFile(p, 'utf8').catch(() => '');
    if (/output\s*:\s*['"]export['"]/.test(raw)) return true;
  }
  return false;
}

export async function runNext(ctx: ResolvedContext): Promise<void> {
  await deploy(ctx, {
    async install(c) {
      await sanitizeForeignSharpBinaries(c.dir, { dryRun: c.flags.dryRun });
      logger.step(2, 13, 'removing node_modules');
      const nm = path.join(c.dir, 'node_modules');
      if (await fs.pathExists(nm)) {
        await run('rm', ['-rf', nm], { dryRun: c.flags.dryRun, verbose: c.flags.verbose });
      }
      logger.step(3, 13, 'npm i');
      await npmInstallWithForeignSharpRecovery(c.dir, {
        dryRun: c.flags.dryRun,
        verbose: c.flags.verbose,
      });
      logger.step(4, 13, 'npm run build');
      await runNpm(['run', 'build'], {
        cwd: c.dir,
        dryRun: c.flags.dryRun,
        verbose: c.flags.verbose,
      });
    },
    async writeArtifacts(c) {
      const staticExport = c.flags.dryRun ? false : await isStaticExport(c.dir);
      const staticServer = path.join(c.dir, 'static-server.cjs');
      if (staticExport) {
        logger.step(5, 13, 'writing static-server.cjs (static export)');
        const src = path.join(getTemplatesDir(), 'static-server.cjs');
        if (c.flags.dryRun) logger.info(`DRY copy ${src} -> ${staticServer}`);
        else await fs.copy(src, staticServer, { overwrite: true });
        await run('chmod', ['644', staticServer], {
          dryRun: c.flags.dryRun,
          verbose: c.flags.verbose,
        }).catch(() => undefined);
      } else {
        logger.step(5, 13, 'SSR build detected — using `next start`, skipping static-server.cjs');
        if (!c.flags.dryRun && (await fs.pathExists(staticServer))) {
          await fs.remove(staticServer).catch(() => undefined);
        }
      }
      logger.step(6, 13, 'writing .htaccess');
      logger.step(7, 13, `clearing nginx cache for user=${c.user}`);
      logger.step(8, 13, 'locking .htaccess (chattr +ia)');
      await writeHtaccess(c.dir, 'next', c.port!, c.user, c.flags.dryRun, c.flags.verbose);
      await syncDeclaredPortInConfigFiles(c.dir, c.port!, { dryRun: c.flags.dryRun });
    },
    pm2Entry(c): PM2AppEntry {
      // The decision here mirrors writeArtifacts: dryRun falls back to `next start`
      // (safer default); real runs inspect the freshly-built tree.
      const useStatic = !c.flags.dryRun && fs.pathExistsSync(path.join(c.dir, 'out'));
      if (useStatic) {
        return {
          name: c.name,
          script: path.join(c.dir, 'static-server.cjs'),
          cwd: c.dir,
          exec_mode: 'cluster',
          instances: 1,
          env: { NODE_ENV: 'production', PORT: String(c.port), HOST: '0.0.0.0' },
        };
      }
      return {
        name: c.name,
        script: path.join(c.dir, 'node_modules', 'next', 'dist', 'bin', 'next'),
        args: 'start',
        cwd: c.dir,
        exec_mode: 'cluster',
        instances: 1,
        env: { NODE_ENV: 'production', PORT: String(c.port), HOSTNAME: '0.0.0.0' },
      };
    },
  });
}
