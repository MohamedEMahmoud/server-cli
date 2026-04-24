import fs from 'fs-extra';
import path from 'node:path';
import { parseArgs } from './core/args.js';
import { buildResolvedContext } from './core/context.js';
import { findFreePort } from './core/auto-port.js';
import type { GlobalFlags, ProjectType } from './types.js';
import { ServerCliError } from './utils/errors.js';
import { logger, setVerbose } from './utils/logger.js';
import { runChange } from './commands/change.js';
import { runDelete } from './commands/delete.js';
import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { runList } from './commands/list.js';
import { runLogs } from './commands/logs.js';
import { runNext } from './commands/next.js';
import { runNuxt } from './commands/nuxt.js';
import { runRestart } from './commands/restart.js';
import { runSelfUpdate } from './commands/self-update.js';
import { runSocket } from './commands/socket.js';
import { runStatus } from './commands/status.js';
import { runStop } from './commands/stop.js';
import { runSupervisor } from './commands/supervisor.js';
import { runShortcuts } from './commands/shortcuts.js';

const KNOWN = new Set([
  'doctor',
  'init',
  'self-update',
  'restart',
  'stop',
  'delete',
  'status',
  'list',
  'logs',
  'change',
  'auto',
  'shortcuts',
  'next',
  'nuxt',
  'supervisor',
  'socket',
]);

export function getVersion(): string {
  try {
    const raw = process.argv[1] ? path.resolve(process.argv[1]) : '';
    // Follow symlinks so global installs resolve to the real dist/server.js path.
    const entry = raw && fs.existsSync(raw) ? fs.realpathSync(raw) : raw;
    const nearEntry = entry ? path.join(path.dirname(entry), '..', 'package.json') : '';
    const candidates = [nearEntry, path.join(process.cwd(), 'package.json')].filter(Boolean);
    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        const v = (fs.readJsonSync(p) as { version?: string }).version;
        if (typeof v === 'string') return v;
      }
    }
  } catch {
    // ignore
  }
  return '0.0.0';
}

export function parseGlobalFlags(argv: string[]): { flags: GlobalFlags; rest: string[] } {
  const flags: GlobalFlags = {
    dryRun: false,
    verbose: false,
    yes: false,
    noHealthcheck: false,
    noChown: false,
  };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!;
    // Support both --flag value and --flag=value forms
    const eqIdx = raw.indexOf('=');
    const a = eqIdx >= 0 ? raw.slice(0, eqIdx) : raw;
    const inlineVal = eqIdx >= 0 ? raw.slice(eqIdx + 1) : undefined;
    const next = (): string => inlineVal ?? argv[++i] ?? '';
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--verbose' || a === '-v') flags.verbose = true;
    else if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--no-healthcheck') flags.noHealthcheck = true;
    else if (a === '--no-chown') flags.noChown = true;
    else if (a === '--user') flags.user = next();
    else if (a === '--name') flags.name = next();
    else if (a === '--domain') flags.domain = next();
    else if (a === '--config') flags.configPath = next();
    else rest.push(raw);
  }
  return { flags, rest };
}

async function runAutoForType(
  tail: string[],
  flags: GlobalFlags,
  typeOverride?: ProjectType,
): Promise<void> {
  const p = parseArgs(tail);
  const ctx = await buildResolvedContext(p, flags, { typeOverride });
  const port = await findFreePort(ctx.config);
  logger.info(`auto-selected port ${port}`);
  const ctxWithPort = { ...ctx, port };
  if (ctxWithPort.type === 'socket') await runSocket(ctxWithPort);
  else if (ctxWithPort.type === 'nuxt') await runNuxt(ctxWithPort);
  else if (ctxWithPort.type === 'next') await runNext(ctxWithPort);
  else if (ctxWithPort.type === 'supervisor') await runSupervisor(ctxWithPort);
  else throw new ServerCliError('unsupported project type for auto', { code: 40 });
}

async function routeKnown(cmd: string, tail: string[], flags: GlobalFlags): Promise<boolean> {
  switch (cmd) {
    case 'doctor':
      await runDoctor(flags);
      return true;
    case 'init':
      await runInit(flags);
      return true;
    case 'self-update':
      await runSelfUpdate(flags);
      return true;
    case 'restart':
      await runRestart(tail, flags);
      return true;
    case 'stop':
      if (!tail[0]) throw new ServerCliError('stop requires <name|port>', { code: 10 });
      await runStop(tail[0], flags);
      return true;
    case 'delete':
      if (!tail[0]) throw new ServerCliError('delete requires <name|port>', { code: 10 });
      await runDelete(tail[0], flags);
      return true;
    case 'status':
      await runStatus(flags);
      return true;
    case 'list':
      await runList(flags);
      return true;
    case 'logs': {
      let name: string | undefined = tail[0] && !tail[0].startsWith('-') ? tail[0] : undefined;
      let lines: number | undefined;
      const startIdx = name ? 1 : 0;
      for (let i = startIdx; i < tail.length; i++) {
        if (tail[i] === '--lines' && tail[i + 1]) {
          lines = Number(tail[i + 1]);
          i++;
        }
      }
      await runLogs(name, flags, { lines });
      return true;
    }
    case 'change':
      await runChange(tail, flags);
      return true;
    case 'auto':
      await runAutoForType(tail, flags);
      return true;
    case 'shortcuts':
      runShortcuts();
      return true;
    case 'next': {
      if (tail[0] === 'change') { await runChange(tail.slice(1), flags, 'next'); return true; }
      if (tail[0] === 'auto') { await runAutoForType(tail.slice(1), flags, 'next'); return true; }
      const p = parseArgs(tail);
      const ctx = await buildResolvedContext(p, flags, { typeOverride: 'next' });
      await runNext(ctx);
      return true;
    }
    case 'nuxt': {
      if (tail[0] === 'change') { await runChange(tail.slice(1), flags, 'nuxt'); return true; }
      if (tail[0] === 'auto') { await runAutoForType(tail.slice(1), flags, 'nuxt'); return true; }
      const p = parseArgs(tail);
      const ctx = await buildResolvedContext(p, flags, { typeOverride: 'nuxt' });
      await runNuxt(ctx);
      return true;
    }
    case 'supervisor': {
      if (tail[0] === 'change') { await runChange(tail.slice(1), flags, 'supervisor'); return true; }
      if (tail[0] === 'auto') { await runAutoForType(tail.slice(1), flags, 'supervisor'); return true; }
      const p = parseArgs(tail);
      const ctx = await buildResolvedContext(p, flags, { typeOverride: 'supervisor' });
      await runSupervisor(ctx);
      return true;
    }
    case 'socket': {
      if (tail[0] === 'change') { await runChange(tail.slice(1), flags, 'socket'); return true; }
      if (tail[0] === 'auto') { await runAutoForType(tail.slice(1), flags, 'socket'); return true; }
      const p = parseArgs(tail);
      const ctx = await buildResolvedContext(p, flags, { typeOverride: 'socket' });
      await runSocket(ctx);
      return true;
    }
    default:
      return false;
  }
}

export async function cli(argv: string[]): Promise<void> {
  const raw = argv.slice(2);
  if (raw.includes('--version') || raw[0] === '-V') {
    console.log(getVersion());
    return;
  }
  if (raw.length === 0 || raw.includes('--help') || raw[0] === '-h') {
    console.log(`server — deploy helper

Usage:
  server [options] [<type>] [<dir>] [<port>]
  server next|nuxt|supervisor|socket [<dir>] [<port>]
  server next|nuxt|supervisor|socket auto [<dir>]      # pick first free firewall port
  server next|nuxt|supervisor|socket change [--domain <d>] [--port <p>]
  server auto [<dir>]                                  # auto-detect type + free port
  server change [--domain <d>] [--port <p>]            # auto-detect app from CWD
  server restart|stop|delete|status|list|doctor|init|self-update ...
  server logs [<name>]                                 # omit name to auto-detect from CWD
  server restart /path/to/app <port>

Global options:
  --dry-run --verbose|-v --yes|-y --user <u> --name <n> --domain <d>
  --no-healthcheck --no-chown --config <path>
`);
    return;
  }

  let verbose = false;
  try {
    const { flags, rest } = parseGlobalFlags(raw);
    verbose = flags.verbose;
    setVerbose(flags.verbose);

    const cmd = rest[0];
    const tail = rest.slice(1);
    if (cmd && KNOWN.has(cmd)) {
      const handled = await routeKnown(cmd, tail, flags);
      if (handled) return;
    }

    const parsed = parseArgs(rest);
    const ctx = await buildResolvedContext(parsed, flags);
    if (ctx.type === 'socket') {
      await runSocket(ctx);
      return;
    }
    if (ctx.type === 'supervisor') {
      await runSupervisor(ctx);
      return;
    }
    if (ctx.type === 'next') {
      await runNext(ctx);
      return;
    }
    if (ctx.type === 'nuxt') {
      await runNuxt(ctx);
      return;
    }
    throw new ServerCliError('unsupported project type', { code: 40 });
  } catch (e) {
    if (e instanceof ServerCliError) {
      logger.error(`✖ ${e.message}`);
      if (e.hint) logger.dim(`→ hint: ${e.hint}`);
      process.exit(e.code);
    }
    if (verbose && e instanceof Error) console.error(e.stack);
    logger.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
