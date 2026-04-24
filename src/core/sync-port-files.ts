import fs from 'fs-extra';
import path from 'node:path';
import YAML from 'yaml';
import { exists } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

const ECOSYSTEM_NAMES = [
  'ecosystem.config.cjs',
  'ecosystem.config.js',
  'ecosystem.config.mjs',
  'ecosystem.config.ts',
];

const ENV_NAMES = ['.env', '.env.production', '.env.local'];

function patchEnvFile(content: string, port: string): string {
  let out = content;
  out = out.replace(/^(\s*PORT\s*=\s*)\d+(\s*)$/gim, `$1${port}$2`);
  out = out.replace(/^(\s*NITRO_PORT\s*=\s*)\d+(\s*)$/gim, `$1${port}$2`);
  return out;
}

function patchEcosystemLike(content: string, port: string): string {
  let out = content;
  out = out.replace(/\b(PORT['"]?\s*:\s*)\d+/gi, `$1${port}`);
  return out;
}

async function writeIfChanged(
  full: string,
  next: string,
  rel: string,
  dryRun?: boolean,
): Promise<void> {
  const prev = await fs.readFile(full, 'utf8');
  if (prev === next) return;
  if (dryRun) {
    logger.info(`DRY would update port in ${rel}`);
    return;
  }
  await fs.writeFile(full, next, 'utf8');
  logger.info(`updated port in ${rel}`);
}

export async function syncDeclaredPortInConfigFiles(
  dir: string,
  port: number,
  opts: { dryRun?: boolean } = {},
): Promise<void> {
  const p = String(port);

  for (const rel of ECOSYSTEM_NAMES) {
    const full = path.join(dir, rel);
    if (!(await exists(full))) continue;
    const raw = await fs.readFile(full, 'utf8');
    const next = patchEcosystemLike(raw, p);
    await writeIfChanged(full, next, rel, opts.dryRun);
  }

  for (const rel of ENV_NAMES) {
    const full = path.join(dir, rel);
    if (!(await exists(full))) continue;
    const raw = await fs.readFile(full, 'utf8');
    const next = patchEnvFile(raw, p);
    await writeIfChanged(full, next, rel, opts.dryRun);
  }

  const yamlPath = path.join(dir, 'server.yaml');
  if (await exists(yamlPath)) {
    const raw = await fs.readFile(yamlPath, 'utf8');
    let doc: Record<string, unknown>;
    try {
      doc = (YAML.parse(raw) as Record<string, unknown>) ?? {};
    } catch {
      return;
    }
    if (doc.port === port) return;
    doc.port = port;
    const next = `${YAML.stringify(doc).trimEnd()}\n`;
    await writeIfChanged(yamlPath, next, 'server.yaml', opts.dryRun);
  }
}
