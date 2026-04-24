import fs from 'fs-extra';
import path from 'node:path';
import { getTemplatesDir } from './paths.js';
import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';

function render(tpl: string, port: number, user: string, dir: string): string {
  return tpl
    .replace(/\{\{PORT\}\}/g, String(port))
    .replace(/\{\{USER\}\}/g, user)
    .replace(/\{\{DIR\}\}/g, dir);
}

export async function clearNginxCache(
  user: string,
  dryRun?: boolean,
  verbose?: boolean,
): Promise<void> {
  try {
    await run('whmapi1', ['nginxmanager_clear_cache', `user=${user}`], { dryRun, verbose });
  } catch {
    logger.warn('whmapi1 nginxmanager_clear_cache failed (optional on non-cPanel hosts)');
  }
}

export async function writeHtaccess(
  dir: string,
  template: 'next' | 'nuxt',
  port: number,
  user: string,
  dryRun?: boolean,
  verbose?: boolean,
): Promise<void> {
  const tplName = template === 'next' ? 'htaccess-next.tpl' : 'htaccess-nuxt.tpl';
  const tplPath = path.join(getTemplatesDir(), tplName);
  const tpl = await fs.readFile(tplPath, 'utf8');
  const body = render(tpl, port, user, dir);
  const target = path.join(dir, '.htaccess');

  await run('chattr', ['-ia', target], { dryRun, verbose }).catch(() => {
    // ignore if missing or unsupported
  });

  if (dryRun) {
    logger.info(`DRY write ${target} (${body.length} bytes)`);
    await clearNginxCache(user, dryRun, verbose);
    await run('chattr', ['+ia', target], { dryRun, verbose }).catch(() => {
      logger.warn('chattr +ia failed (binary missing or unsupported); continuing without immutable lock');
    });
    return;
  }

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(target, body, 'utf8');
  await clearNginxCache(user, dryRun, verbose);
  await run('chattr', ['+ia', target], { dryRun, verbose }).catch(() => {
    logger.warn('chattr +ia failed (binary missing or unsupported); continuing without immutable lock');
  });
}
