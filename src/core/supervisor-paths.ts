import fs from 'fs-extra';
import path from 'node:path';

export const SUPERVISOR_CONF_ALT = '/etc/supervisor/supervisord.conf';

/** Stable [program:…] name: one worker per Linux user + project basename (multiple Laravel roots per user). */
export function laravelSupervisorProgramName(user: string, projectDir: string): string {
  const slug = path
    .basename(projectDir)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'app';
  return `laravel-${user}-${slug.slice(0, 48)}`;
}

function scoreConfContent(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  if (t.includes('[supervisord]') || t.includes('[unix_http_server]') || t.includes('[include]')) {
    return t.length + 1000;
  }
  return t.length;
}

/**
 * Prefer a config file that actually contains Supervisor settings.
 * cPanel often ships an empty /etc/supervisord.conf while the real file is under /etc/supervisor/.
 */
export async function resolveSupervisorConfPath(
  primary: string,
  altPath: string = SUPERVISOR_CONF_ALT,
): Promise<string> {
  const rows: { p: string; score: number }[] = [];
  for (const p of [primary, altPath]) {
    if (!(await fs.pathExists(p))) continue;
    const raw = await fs.readFile(p, 'utf8').catch(() => '');
    rows.push({ p, score: scoreConfContent(raw) });
  }
  if (rows.length === 0) return primary;
  rows.sort((a, b) => b.score - a.score);
  if (rows[0]!.score > 0) return rows[0]!.p;
  const altHit = rows.find((r) => r.p === altPath);
  if (altHit) return altPath;
  return rows[0]!.p;
}
