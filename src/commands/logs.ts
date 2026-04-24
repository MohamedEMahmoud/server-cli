import path from 'node:path';
import { execa } from 'execa';
import type { GlobalFlags } from '../types.js';
import { loadConfig } from '../core/config.js';
import * as processJson from '../core/process-json.js';
import { ServerCliError } from '../utils/errors.js';

export async function runLogs(
  name: string | undefined,
  flags: GlobalFlags,
  opts: { lines?: number },
): Promise<void> {
  let appName = name;
  if (!appName) {
    const dir = path.resolve(process.cwd());
    const { config } = await loadConfig(flags, dir);
    const doc = await processJson.read(config.processJsonPath);
    const entry = processJson.findByProjectDir(doc, dir);
    if (!entry) {
      throw new ServerCliError(`no app in process.json for ${dir}`, {
        code: 10,
        hint: 'run from a deployed project directory, or pass a name: server logs <name>',
      });
    }
    appName = entry.name;
  }
  const args = ['logs', appName];
  if (opts.lines) args.push('--lines', String(opts.lines));
  await execa('pm2', args, { stdio: 'inherit' });
}
