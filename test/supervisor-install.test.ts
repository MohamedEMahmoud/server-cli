import { describe, expect, test } from 'vitest';
import {
  confLooksUsable,
  extractProgramBlocks,
  parseIncludeDir,
} from '../src/core/supervisor-install.js';

describe('extractProgramBlocks', () => {
  test('pulls out every [program:*] block and stops at the next section', () => {
    const raw = [
      '[supervisord]',
      'logfile=/var/log/supervisord.log',
      '',
      '[program:foo]',
      'command=/bin/foo',
      'user=foo',
      '',
      '[program:bar]',
      'command=/bin/bar',
      '',
      '[include]',
      'files = supervisord.d/*.ini',
    ].join('\n');
    const blocks = extractProgramBlocks(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatch(/\[program:foo\]/);
    expect(blocks[0]).toMatch(/command=\/bin\/foo/);
    expect(blocks[1]).toMatch(/\[program:bar\]/);
    expect(blocks[1]).not.toMatch(/\[include\]/);
  });

  test('handles a file that is nothing but a program block', () => {
    const raw = '\n\n[program:solo]\ncommand=/bin/solo\nuser=x\n';
    const blocks = extractProgramBlocks(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/\[program:solo\]/);
  });

  test('returns empty array when no programs are defined', () => {
    expect(extractProgramBlocks('[supervisord]\nlogfile=/x\n')).toEqual([]);
  });
});

describe('confLooksUsable', () => {
  test('true when core daemon sections are present', () => {
    expect(confLooksUsable('[supervisord]\nlogfile=/x')).toBe(true);
    expect(confLooksUsable('[unix_http_server]\nfile=/x')).toBe(true);
  });
  test('false for a conf that is only program blocks', () => {
    expect(confLooksUsable('[program:foo]\ncommand=/bin/foo')).toBe(false);
    expect(confLooksUsable('')).toBe(false);
  });
});

describe('parseIncludeDir', () => {
  test('returns absolute dir when include uses a glob relative to confPath', () => {
    const raw = '[include]\nfiles = supervisord.d/*.ini\n';
    expect(parseIncludeDir(raw, '/etc/supervisord.conf')).toBe('/etc/supervisord.d');
  });
  test('returns absolute dir when include uses an absolute glob', () => {
    const raw = '[include]\nfiles = /etc/supervisor/conf.d/*.conf\n';
    expect(parseIncludeDir(raw, '/etc/supervisord.conf')).toBe('/etc/supervisor/conf.d');
  });
  test('undefined when no [include] section or no glob', () => {
    expect(parseIncludeDir('[supervisord]\nlogfile=/x\n', '/etc/supervisord.conf')).toBeUndefined();
    expect(
      parseIncludeDir('[include]\nfiles = /etc/only-one-file.ini\n', '/etc/supervisord.conf'),
    ).toBeUndefined();
  });
});
