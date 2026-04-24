import * as processJson from '../core/process-json.js';
import { loadConfig } from '../core/config.js';
import { pm2List } from '../core/pm2.js';
import type { GlobalFlags } from '../types.js';

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}

export async function runStatus(flags: GlobalFlags): Promise<void> {
  const { config } = await loadConfig(flags, process.cwd());
  const doc = await processJson.read(config.processJsonPath);
  const pm2 = flags.dryRun ? [] : await pm2List(false, flags.verbose);
  const pm2ByName = new Map(pm2.map((p) => [p.name, p]));

  const cols = ['NAME', 'PORT', 'STATUS', 'UPTIME', 'CPU', 'MEM'] as const;
  const widths = [24, 8, 12, 10, 8, 8];
  console.log(cols.map((c, i) => pad(c, widths[i])).join(' '));
  for (const app of doc.apps) {
    const row = pm2ByName.get(app.name);
    const port = app.env?.PORT ?? '';
    const status = row?.status ?? 'unknown';
    console.log(
      [
        pad(app.name, widths[0]),
        pad(String(port), widths[1]),
        pad(status, widths[2]),
        pad('-', widths[3]),
        pad('-', widths[4]),
        pad('-', widths[5]),
      ].join(' '),
    );
  }
}
