import path from 'node:path';
import type { GlobalFlags, ProjectType } from '../types.js';
import * as processJson from '../core/process-json.js';
import { pm2ProcessExists, pm2Restart, pm2Save, pm2Start } from '../core/pm2.js';
import { loadConfig } from '../core/config.js';
import { assertPm2Installed } from '../core/context.js';
import { healthCheck, socketHealthCheck } from '../core/domain.js';
import { injectSocketEnvBlock, rewriteSocketEventsDoc } from '../core/socket-setup.js';
import { ServerCliError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

function parseChangeTail(
  tail: string[],
  globalFlags: GlobalFlags,
): { domain?: string; port?: number; dir?: string } {
  let domain = globalFlags.domain;
  let port: number | undefined;
  let dir: string | undefined;
  for (let i = 0; i < tail.length; i++) {
    const raw = tail[i]!;
    const eqIdx = raw.indexOf('=');
    const flag = eqIdx >= 0 ? raw.slice(0, eqIdx) : raw;
    const inlineVal = eqIdx >= 0 ? raw.slice(eqIdx + 1) : undefined;
    const next = (): string => inlineVal ?? tail[++i] ?? '';
    if (flag === '--domain' || flag === '-d') {
      domain = next();
    } else if (flag === '--port' || flag === '-p') {
      port = Number(next());
    } else if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
      dir = path.resolve(raw);
    }
  }
  return { domain, port, dir };
}

export async function runChange(
  tail: string[],
  flags: GlobalFlags,
  typeHint?: ProjectType,
): Promise<void> {
  const { domain: newDomain, port: newPortArg, dir } = parseChangeTail(tail, flags);

  if (!newDomain && newPortArg === undefined) {
    throw new ServerCliError('change requires at least --domain <d> or --port <p>', { code: 10 });
  }

  const resolvedDir = path.resolve(dir ?? process.cwd());
  await assertPm2Installed(flags.dryRun);
  const { config } = await loadConfig(flags, resolvedDir);
  const doc = await processJson.read(config.processJsonPath);

  // Locate entry: for socket type look for cwd ending in /node
  let entry = processJson.findByProjectDir(doc, resolvedDir);
  if (!entry && typeHint === 'socket') {
    const nodeDir = path.join(resolvedDir, 'node');
    entry = doc.apps.find((a) => a.cwd && path.resolve(a.cwd) === nodeDir);
  }
  if (!entry) {
    throw new ServerCliError(`no app in process.json for ${resolvedDir}`, {
      code: 10,
      hint: 'deploy first: server <type> <dir> <port>',
    });
  }

  const currentPort = Number(entry.env?.PORT);
  const newPort = newPortArg ?? (Number.isFinite(currentPort) ? currentPort : undefined);
  if (newPort === undefined) {
    throw new ServerCliError('cannot determine port — pass --port <p>', { code: 10 });
  }

  // Determine if this is a socket entry by cwd convention
  const entryCwd = entry.cwd ? path.resolve(entry.cwd) : '';
  const isSocket =
    typeHint === 'socket' || path.basename(entryCwd) === 'node' || path.basename(entryCwd) === 'socket';
  const projectDir = isSocket ? path.dirname(entryCwd) : resolvedDir;

  const updated = { ...entry, env: { ...entry.env, PORT: String(newPort) } };
  const docAfter = processJson.sortByPort(processJson.upsert(doc, updated));

  const total = isSocket && newDomain ? 4 : 3;
  logger.step(1, total, `updating process.json port=${newPort}`);
  await processJson.writeAtomic(config.processJsonPath, docAfter);

  if (isSocket && newDomain) {
    logger.step(2, total, 'inject socket env block');
    await injectSocketEnvBlock(projectDir, { domain: newDomain, port: newPort }, flags);
    logger.step(3, total, 'update SOCKET-EVENTS.md');
    await rewriteSocketEventsDoc(projectDir, newDomain, newPort, flags);
  }

  const restartStep = isSocket && newDomain ? 4 : 2;
  logger.step(restartStep, total, `pm2 restart ${entry.name}`);
  const inPm2 = await pm2ProcessExists(entry.name, flags.dryRun, flags.verbose);
  if (inPm2) await pm2Restart(entry.name, flags.dryRun, flags.verbose);
  else await pm2Start(config.processJsonPath, entry.name, flags.dryRun, flags.verbose);
  await pm2Save(flags.dryRun, flags.verbose);

  const domain = newDomain ?? flags.domain;
  if (!flags.noHealthcheck && domain) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      if (isSocket) {
        await socketHealthCheck(domain, newPort, config.healthcheck, entry.name);
      } else {
        await healthCheck(`http://${domain}/`, config.healthcheck);
      }
      logger.success('health check ok');
    } catch (e) {
      logger.error('health check failed — app was restarted; investigate logs');
      throw e;
    }
  }

  logger.success(
    `changed ${entry.name} → port=${newPort}${newDomain ? ` domain=${newDomain}` : ''}`,
  );
}
