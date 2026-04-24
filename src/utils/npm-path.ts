import path from 'node:path';
import { exists } from './fs.js';

export type NpmInvocation = { file: string; args: string[] };

/** Paths relative to `node` binary dir where npm-cli.js may live (OS installers differ). */
export function candidateNpmCliJsPaths(nodeDir: string): string[] {
  return [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.normalize(path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')),
  ];
}

function npmCliFromEnv(): string | undefined {
  const raw = process.env.npm_execpath || process.env.NPM_CLI_JS;
  if (!raw) return undefined;
  const p = raw.replace(/^["']|["']$/g, '').trim();
  return p || undefined;
}

/**
 * Resolve how to run the npm CLI even when `npm` is not on PATH (e.g. root login shell
 * without nvm/fnm shims). Prefers the npm that ships with the same Node as `process.execPath`.
 */
export async function resolveNpmInvocation(npmArgs: string[]): Promise<NpmInvocation> {
  const execPath = process.execPath;
  const nodeDir = path.dirname(execPath);

  const fromEnv = npmCliFromEnv();
  if (fromEnv && (await exists(fromEnv))) {
    return { file: execPath, args: [fromEnv, ...npmArgs] };
  }

  // Prefer npm-cli.js + current Node before the `npm` shim. The shim is often a symlink or
  // shell script; broken installs report spawn ENOENT on `/usr/local/bin/npm` even when
  // `../lib/node_modules/npm/bin/npm-cli.js` is valid.
  for (const cli of candidateNpmCliJsPaths(nodeDir)) {
    if (await exists(cli)) {
      return { file: execPath, args: [cli, ...npmArgs] };
    }
  }

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmSibling = path.join(nodeDir, npmCmd);
  if (await exists(npmSibling)) {
    return { file: npmSibling, args: npmArgs };
  }

  return { file: 'npm', args: npmArgs };
}
