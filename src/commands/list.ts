import * as processJson from '../core/process-json.js';
import { loadConfig } from '../core/config.js';
import type { GlobalFlags } from '../types.js';

export async function runList(flags: GlobalFlags): Promise<void> {
  const { config } = await loadConfig(flags, process.cwd());
  const doc = await processJson.read(config.processJsonPath);
  for (const a of doc.apps) console.log(a.name);
}
