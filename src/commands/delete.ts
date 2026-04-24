import * as processJson from '../core/process-json.js';
import { loadConfig } from '../core/config.js';
import { pm2Delete } from '../core/pm2.js';
import type { GlobalFlags } from '../types.js';
import { ServerCliError } from '../utils/errors.js';

export async function runDelete(target: string, flags: GlobalFlags): Promise<void> {
  const { config } = await loadConfig(flags, process.cwd());
  const doc = await processJson.read(config.processJsonPath);
  const byPort = Number(target);
  const entry = Number.isFinite(byPort)
    ? doc.apps.find((a) => Number(a.env?.PORT) === byPort)
    : doc.apps.find((a) => a.name === target);
  if (!entry) throw new ServerCliError(`unknown app: ${target}`, { code: 10 });
  await pm2Delete(entry.name, flags.dryRun, flags.verbose);
  const next = { apps: doc.apps.filter((a) => !(a.name === entry.name && a.cwd === entry.cwd)) };
  await processJson.writeAtomic(config.processJsonPath, next);
}
