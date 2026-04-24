import path from 'node:path';
import type { GlobalFlags, ResolvedContext } from '../types.js';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';

/**
 * Hand the project tree to the site user (cPanel/Linux user).
 * Skipped when not root or when --no-chown.
 *
 * `.htaccess` is often `chattr +ia` (immutable); that can block `chown` on the file or tree,
 * so we clear immutable on `.htaccess` before `chown -R`, then restore `+ia` after (same as deploy htaccess flow).
 */
export async function chownProjectTree(
  user: string,
  targetDir: string,
  flags: GlobalFlags,
): Promise<void> {
  if (flags.noChown) return;
  if (typeof process.geteuid === 'function' && process.geteuid() !== 0) {
    logger.dim('chown skipped (not root)');
    return;
  }
  const spec = `${user}:${user}`;
  const htaccess = path.join(targetDir, '.htaccess');

  await run('chattr', ['-ia', htaccess], { dryRun: flags.dryRun, verbose: flags.verbose }).catch(() => {
    // missing file, unsupported fs, or already mutable
  });

  try {
    logger.info(`chown -R ${spec} ${targetDir}`);
    await run('chown', ['-R', spec, targetDir], {
      dryRun: flags.dryRun,
      verbose: flags.verbose,
    });
    if (!flags.dryRun) {
      logger.success(`ownership set to ${spec} for ${targetDir}`);
    }
  } catch (err) {
    logger.error(`chown failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    await run('chattr', ['+ia', htaccess], { dryRun: flags.dryRun, verbose: flags.verbose }).catch(() => {
      logger.warn('chattr +ia on .htaccess after chown failed (optional lock)');
    });
  }
}

export async function chownDeployDir(ctx: ResolvedContext): Promise<void> {
  await chownProjectTree(ctx.user, ctx.dir, ctx.flags);
}
