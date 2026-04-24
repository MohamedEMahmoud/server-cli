import fs from 'fs-extra';
import os from 'node:os';
import { execa } from 'execa';
import type { GlobalFlags } from '../types.js';
import { loadConfig } from '../core/config.js';
import { logger } from '../utils/logger.js';

async function check(cmd: string, args: string[]): Promise<string | undefined> {
  const r = await execa(cmd, args, { reject: false, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.exitCode !== 0) return undefined;
  return (r.stdout || '').trim().split('\n')[0];
}

export async function runDoctor(flags: GlobalFlags): Promise<void> {
  const node = await check('node', ['--version']);
  logger.info(node && node.startsWith('v') ? `node ✓ ${node.slice(1)}` : 'node ✖');

  const pm2 = await check('pm2', ['--version']);
  logger.info(pm2 ? `pm2 ✓ ${pm2}` : 'pm2 ✖');

  const sup = await check('supervisord', ['-v']);
  logger.info(sup ? `supervisord ✓ ${sup}` : 'supervisord ✖');

  const whm = await check('whmapi1', ['--version']);
  logger.info(whm ? `whmapi1 ✓` : 'whmapi1 ⚠ (optional)');

  const { config } = await loadConfig(flags, process.cwd());
  try {
    await fs.access(config.processJsonPath, fs.constants.R_OK | fs.constants.W_OK);
    logger.info(`${config.processJsonPath} rw ✓`);
  } catch {
    logger.info(`${config.processJsonPath} rw ✖`);
  }

  try {
    await fs.access(config.supervisordConfPath, fs.constants.R_OK | fs.constants.W_OK);
    logger.info(`${config.supervisordConfPath} rw ✓`);
  } catch {
    logger.info(`${config.supervisordConfPath} rw ✖`);
  }

  if (os.userInfo().username === 'root') logger.info('running as root ✓');
  else logger.warn('not running as root (some operations may fail)');
}
