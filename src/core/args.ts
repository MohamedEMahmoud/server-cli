import path from 'node:path';
import type { ParsedArgs, ProjectType } from '../types.js';
import { ServerCliError } from '../utils/errors.js';

const TYPES = new Set<ProjectType>(['next', 'nuxt', 'supervisor', 'socket']);

function isPort(tok: string): boolean {
  if (!/^\d+$/.test(tok)) return false;
  const n = Number(tok);
  return n >= 1 && n <= 65535;
}

function isDir(tok: string): boolean {
  if (tok.startsWith('/') || tok.startsWith('./') || tok.startsWith('.\\')) return true;
  if (/^[a-zA-Z]:[\\/]/.test(tok)) return true;
  if (tok.includes('/') || tok.includes('\\')) return true;
  return false;
}

export function parseArgs(tokens: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (const tok of tokens) {
    if (TYPES.has(tok as ProjectType)) out.type = tok as ProjectType;
    else if (isDir(tok)) out.dir = path.resolve(tok);
    else if (isPort(tok)) out.port = Number(tok);
    else if (tok === 'auto') out.auto = true;
    else throw new ServerCliError(`unknown argument: ${tok}`, { code: 10 });
  }
  return out;
}
