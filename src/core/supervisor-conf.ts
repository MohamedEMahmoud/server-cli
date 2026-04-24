import fs from 'fs-extra';
import path from 'node:path';
import { backup } from '../utils/fs.js';
import { extractProgramBlocks, parseIncludeDir } from './supervisor-install.js';

export async function hasProgram(confPath: string, programName: string): Promise<boolean> {
  return !!(await findProgramFile(confPath, programName));
}

/**
 * Replace the `[program:<name>]` block inside `raw` with `block` (in place). Returns
 * the updated text. When no such block exists, appends `block` to the end.
 */
export function replaceProgramBlock(raw: string, programName: string, block: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let skipping = false;
  let replaced = false;
  const needle = `program:${programName}`;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      if (header[1] === needle) {
        if (!replaced) {
          out.push(block.trim());
          replaced = true;
        }
        skipping = true;
        continue;
      }
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  if (!replaced) return `${out.join('\n').trimEnd()}\n\n${block.trim()}\n`;
  return out.join('\n');
}

/** Read the `[program:<name>]` block from `file`, or undefined if absent. */
export async function readProgramBlock(
  file: string,
  programName: string,
): Promise<string | undefined> {
  const raw = await fs.readFile(file, 'utf8').catch(() => '');
  return extractProgramBlocks(raw).find((b) => b.startsWith(`[program:${programName}]`));
}

/**
 * Locate a `[program:<name>]` definition in the main conf or any `[include]`-glob file.
 * Returns the absolute path of the file that contains it, or undefined.
 */
export async function findProgramFile(
  confPath: string,
  programName: string,
): Promise<string | undefined> {
  const needle = `[program:${programName}]`;
  if (await fs.pathExists(confPath)) {
    const raw = await fs.readFile(confPath, 'utf8');
    if (raw.includes(needle)) return confPath;
    const includeDir = parseIncludeDir(raw, confPath);
    if (includeDir && (await fs.pathExists(includeDir))) {
      for (const entry of await fs.readdir(includeDir)) {
        const full = path.join(includeDir, entry);
        const stat = await fs.stat(full).catch(() => undefined);
        if (!stat || !stat.isFile()) continue;
        const content = await fs.readFile(full, 'utf8').catch(() => '');
        if (content.includes(needle)) return full;
      }
    }
  }
  return undefined;
}

/**
 * Write a program block to the appropriate location: the `[include]` directory
 * when one is configured, otherwise append to the main conf. Returns the path written.
 */
export async function writeProgram(confPath: string, programName: string, block: string): Promise<string> {
  const raw = (await fs.pathExists(confPath)) ? await fs.readFile(confPath, 'utf8') : '';
  const includeDir = parseIncludeDir(raw, confPath);
  if (includeDir) {
    await fs.mkdir(includeDir, { recursive: true });
    const dest = path.join(includeDir, `${programName}.ini`);
    await fs.writeFile(dest, `${block.trim()}\n`, 'utf8');
    return dest;
  }
  return appendProgram(confPath, block);
}

export async function appendProgram(confPath: string, block: string): Promise<string> {
  await backup(confPath, 5);
  const prev = (await fs.pathExists(confPath)) ? await fs.readFile(confPath, 'utf8') : '';
  await fs.writeFile(confPath, `${prev.trimEnd()}\n\n${block.trim()}\n`, 'utf8');
  return confPath;
}
