import { run } from '../utils/exec.js';

export interface Pm2Row {
  name: string;
  pm_id: number;
  status: string;
  port?: number;
}

export async function pm2List(dryRun?: boolean, verbose?: boolean): Promise<Pm2Row[]> {
  const out = await run('pm2', ['jlist'], { dryRun, verbose });
  if (dryRun) return [];
  const rows = JSON.parse(out || '[]') as Array<{
    name?: string;
    pm_id?: number;
    pm2_env?: { status?: string; env?: Record<string, string> };
  }>;
  return rows.map((r) => ({
    name: r.name ?? '',
    pm_id: r.pm_id ?? -1,
    status: r.pm2_env?.status ?? 'unknown',
    port: r.pm2_env?.env?.PORT ? Number(r.pm2_env.env.PORT) : undefined,
  }));
}

/** Whether PM2 already has a process with this name (jlist). Skips live check when dryRun. */
export async function pm2ProcessExists(
  name: string,
  dryRun?: boolean,
  verbose?: boolean,
): Promise<boolean> {
  if (dryRun) return false;
  const rows = await pm2List(false, verbose);
  return rows.some((r) => r.name === name);
}

export async function pm2Start(
  processJsonPath: string,
  only?: string,
  dryRun?: boolean,
  verbose?: boolean,
): Promise<void> {
  const args = ['start', processJsonPath];
  if (only) args.push('--only', only);
  await run('pm2', args, { dryRun, verbose });
}

export async function pm2Restart(
  name: string,
  dryRun?: boolean,
  verbose?: boolean,
): Promise<void> {
  await run('pm2', ['restart', name], { dryRun, verbose });
}

export async function pm2Stop(name: string, dryRun?: boolean, verbose?: boolean): Promise<void> {
  await run('pm2', ['stop', name], { dryRun, verbose });
}

export async function pm2Delete(name: string, dryRun?: boolean, verbose?: boolean): Promise<void> {
  await run('pm2', ['delete', name], { dryRun, verbose });
}

export async function pm2Save(dryRun?: boolean, verbose?: boolean): Promise<void> {
  await run('pm2', ['save'], { dryRun, verbose });
}
