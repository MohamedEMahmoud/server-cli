import fs from 'fs-extra';
import path from 'node:path';

export async function exists(p: string): Promise<boolean> {
  return fs.pathExists(p);
}

export async function isEmptyDir(p: string): Promise<boolean> {
  if (!(await exists(p))) return true;
  const entries = await fs.readdir(p);
  return entries.length === 0;
}

export async function backup(p: string, keep = 5): Promise<string | null> {
  if (!(await exists(p))) return null;
  const dir = path.dirname(p);
  const base = path.basename(p);
  const stamp = Date.now();
  const dest = path.join(dir, `${base}.bak.${stamp}`);
  await fs.copy(p, dest);
  const siblings = (await fs.readdir(dir))
    .filter((f) => f.startsWith(`${base}.bak.`))
    .map((f) => path.join(dir, f))
    .sort();
  while (siblings.length > keep) {
    const oldest = siblings.shift();
    if (oldest) await fs.remove(oldest).catch(() => undefined);
  }
  return dest;
}

export async function writeAtomic(p: string, data: string | Buffer): Promise<void> {
  const dir = path.dirname(p);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, p);
}

export async function readJson<T>(p: string): Promise<T> {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw) as T;
}

export async function writeJson(p: string, obj: unknown): Promise<void> {
  await writeAtomic(p, `${JSON.stringify(obj, null, 2)}\n`);
}
