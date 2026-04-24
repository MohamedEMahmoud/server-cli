import fs from 'fs-extra';
import path from 'node:path';
import { getTemplatesDir } from '../core/paths.js';
import { laravelSupervisorProgramName, resolveSupervisorConfPath } from '../core/supervisor-paths.js';
import { reloadSupervisor } from '../core/supervisor-reload.js';
import { ensureSupervisorInstalled } from '../core/supervisor-install.js';
import * as sup from '../core/supervisor-conf.js';
import type { ResolvedContext } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { detectUser } from '../core/detect.js';

export async function runSupervisor(ctx: ResolvedContext): Promise<void> {
  if (!(await fs.pathExists(path.join(ctx.dir, 'artisan')))) {
    throw new ServerCliError('artisan not found — not a Laravel root?', { code: 40 });
  }
  const user = detectUser(ctx.dir, ctx.flags.user);
  await ensureSupervisorInstalled(ctx.config.supervisordConfPath, ctx.flags);
  const confPath = await resolveSupervisorConfPath(ctx.config.supervisordConfPath);
  const programName = laravelSupervisorProgramName(user, ctx.dir);

  const tpl = await fs.readFile(path.join(getTemplatesDir(), 'supervisor-program.tpl'), 'utf8');
  const block = tpl
    .replace(/\{\{PROGRAM_NAME\}\}/g, programName)
    .replace(/\{\{USER\}\}/g, user)
    .replace(/\{\{DIR\}\}/g, ctx.dir);

  if (ctx.flags.dryRun) {
    logger.info(`DRY write program ${programName} (conf base: ${confPath})\n${block}`);
    return;
  }

  const existingFile = await sup.findProgramFile(confPath, programName);
  if (existingFile) {
    const currentBlock = await sup.readProgramBlock(existingFile, programName);
    if (currentBlock && currentBlock.trim() === block.trim()) {
      logger.dim(`supervisor program ${programName} already registered at ${existingFile}`);
    } else {
      const raw = await fs.readFile(existingFile, 'utf8');
      await fs.writeFile(existingFile, sup.replaceProgramBlock(raw, programName, block), 'utf8');
      logger.warn(`updated supervisor program ${programName} at ${existingFile}`);
    }
  } else {
    const written = await sup.writeProgram(confPath, programName, block);
    logger.dim(`wrote supervisor program ${programName} to ${written}`);
  }

  try {
    await reloadSupervisor(ctx.flags);
  } catch (e) {
    throw new ServerCliError(e instanceof Error ? e.message : String(e), {
      code: 60,
      hint: 'install supervisor (yum install supervisor / apt install supervisor) or reload manually',
    });
  }

  const logFile = path.join(ctx.dir, 'laravel-worker.log');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await fs.pathExists(logFile)) {
      logger.success(`supervisor registered ${programName}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  logger.warn('laravel-worker.log not observed within 10s — verify supervisord manually');
}
