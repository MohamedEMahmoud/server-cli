import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import {
  laravelSupervisorProgramName,
  resolveSupervisorConfPath,
} from '../src/core/supervisor-paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, '.tmp-supervisor-path');

afterEach(async () => {
  await fs.remove(tmp).catch(() => undefined);
});

describe('laravelSupervisorProgramName', () => {
  test('includes user and slugified basename', () => {
    expect(laravelSupervisorProgramName('practice', '/home/practice/dashboard.practice.4hoste.com')).toBe(
      'laravel-practice-dashboard-practice-4hoste-com',
    );
  });
});

describe('resolveSupervisorConfPath', () => {
  test('prefers file with real supervisor sections over empty primary', async () => {
    await fs.mkdir(tmp, { recursive: true });
    const primary = path.join(tmp, 'supervisord.conf');
    const alt = path.join(tmp, 'supervisor', 'supervisord.conf');
    await fs.writeFile(primary, '   \n', 'utf8');
    await fs.mkdir(path.dirname(alt), { recursive: true });
    await fs.writeFile(
      alt,
      '[supervisord]\nlogfile=/tmp/s.log\n[include]\nfiles = /etc/supervisor/conf.d/*.conf\n',
      'utf8',
    );
    await expect(resolveSupervisorConfPath(primary, alt)).resolves.toBe(alt);
  });
});
