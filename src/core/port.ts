import { execa } from 'execa';
import type { ResolvedContext } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import * as processJson from './process-json.js';
import { pm2List } from './pm2.js';

export async function assertPortFree(port: number, ctx: ResolvedContext): Promise<void> {
  if (ctx.isRestart) return;

  const doc = await processJson.read(ctx.config.processJsonPath);
  for (const app of doc.apps) {
    const p = app.env?.PORT ? Number(app.env.PORT) : undefined;
    if (p === port && !processJson.projectRootsMatch(app.cwd, ctx.dir)) {
      throw new ServerCliError(
        `port ${port} is already in use by "${app.name}" (cwd ${app.cwd})`,
        { code: 30, hint: app.cwd ? 'change the port, or run: server restart ' + app.cwd : 'change the port, or run: server restart' },
      );
    }
  }

  if (ctx.flags.dryRun) return;

  const rows = await pm2List(false, ctx.flags.verbose);
  for (const r of rows) {
    if (r.port === port) {
      throw new ServerCliError(
        `port ${port} is already in use by "${r.name}" (pm2 id ${r.pm_id}).`,
        { code: 30, hint: ctx.dir ? 'change the port, or run: server restart ' + ctx.dir : 'change the port, or run: server restart' },
      );
    }
  }

  const lsof = await execa('lsof', ['-i', `:${port}`, '-sTCP:LISTEN'], {
    reject: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (lsof.exitCode === 0 && lsof.stdout.trim()) {
    throw new ServerCliError(`port ${port} is already in use (lsof)`, {
      code: 30,
      hint: 'pick another port or stop the existing listener',
    });
  }

  const ss = await execa('ss', ['-ltn'], { reject: false, stdio: ['ignore', 'pipe', 'pipe'] });
  if (ss.exitCode === 0 && ss.stdout.includes(`:${port}`)) {
    throw new ServerCliError(`port ${port} appears to be listening (ss)`, { code: 30 });
  }
}
