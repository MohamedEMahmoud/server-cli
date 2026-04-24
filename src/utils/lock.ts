import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { ServerCliError } from './errors.js';
import { logger } from './logger.js';

const LOCK_PATH = path.join(os.tmpdir(), 'server-cli.lock');

interface LockBody {
  pid: number;
  command: string;
  startedAt: string;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquire(command: string): Promise<() => Promise<void>> {
  if (await fs.pathExists(LOCK_PATH)) {
    let body: LockBody;
    try {
      body = (await fs.readJson(LOCK_PATH)) as LockBody;
    } catch {
      await fs.remove(LOCK_PATH);
      body = { pid: 0, command: '', startedAt: '' };
    }
    if (body.pid && isPidAlive(body.pid)) {
      throw new ServerCliError(`another server-cli is running (pid ${body.pid})`, {
        code: 90,
        hint: 'wait for it to finish or remove stale lock if the process died',
      });
    }
    await fs.remove(LOCK_PATH);
  }

  const payload: LockBody = { pid: process.pid, command, startedAt: new Date().toISOString() };
  await fs.writeJson(LOCK_PATH, payload);

  const release = async (): Promise<void> => {
    try {
      if (await fs.pathExists(LOCK_PATH)) {
        const cur = (await fs.readJson(LOCK_PATH)) as LockBody;
        if (cur.pid === process.pid) await fs.remove(LOCK_PATH);
      }
    } catch {
      // ignore
    }
  };

  const onSig = (): void => {
    void (async () => {
      logger.warn('aborted');
      await release();
      process.exit(130);
    })();
  };
  process.once('SIGINT', onSig);
  process.once('SIGTERM', onSig);

  return release;
}
