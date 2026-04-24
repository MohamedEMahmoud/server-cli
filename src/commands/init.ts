import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import type { GlobalFlags } from '../types.js';
import { writeJson } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

export async function runInit(flags: GlobalFlags): Promise<void> {
  const defaults = {
    processJsonPath: '/root/Scripts/process.json',
    supervisordConfPath: '/etc/supervisord.conf',
    defaultUser: process.env.USER || 'root',
    healthcheck: { retries: 3, delayMs: 2000, timeoutMs: 5000 },
  };

  let cfg = { ...defaults };
  if (!flags.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      cfg.processJsonPath =
        (await rl.question(`process.json path [${defaults.processJsonPath}]: `)) ||
        defaults.processJsonPath;
      cfg.supervisordConfPath =
        (await rl.question(`supervisord.conf path [${defaults.supervisordConfPath}]: `)) ||
        defaults.supervisordConfPath;
      cfg.defaultUser =
        (await rl.question(`default user [${defaults.defaultUser}]: `)) || defaults.defaultUser;
    } finally {
      rl.close();
    }
  }

  const dir = path.join(os.homedir(), '.server-cli');
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, 'config.json');
  await writeJson(out, cfg);
  logger.success(`wrote ${out}`);
}
