import path from 'node:path';
import type { GlobalFlags } from '../types.js';
import { detectUser } from './detect.js';
import { exists } from '../utils/fs.js';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';

/**
 * Post-command hook: ensure /home/<user>/public_html is mode 755.
 * User is resolved dynamically (--user flag, cwd /home/<user>/..., or $USER).
 * Best-effort: never throws — only warns on failure.
 */
export async function chmodPublicHtml(flags: GlobalFlags, dir?: string): Promise<void> {
  let user: string;
  try {
    user = detectUser(dir ?? process.cwd(), flags.user);
  } catch {
    logger.dim('chmod public_html skipped (could not detect user)');
    return;
  }
  const target = path.join('/home', user, 'public_html');
  if (!(await exists(target))) {
    logger.dim(`chmod public_html skipped (${target} not found)`);
    return;
  }
  try {
    await run('chmod', ['755', target], { dryRun: flags.dryRun, verbose: flags.verbose });
    if (!flags.dryRun) logger.info(`chmod 755 ${target}`);
  } catch (err) {
    logger.warn(
      `chmod 755 ${target} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
