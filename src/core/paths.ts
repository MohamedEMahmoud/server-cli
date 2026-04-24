import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

const MARKER = 'static-server.cjs';

function hasMarker(templatesDir: string): boolean {
  return existsSync(path.join(templatesDir, MARKER));
}

/**
 * Templates ship next to the CLI entry (`dist/server.js` → `dist/templates/`).
 * `process.cwd()` is wrong when the user runs `server` from their project (e.g. public_html).
 */
function templatesBesideCliEntry(): string | undefined {
  const main = process.argv[1];
  if (!main) return undefined;
  let entryDir: string;
  try {
    entryDir = path.dirname(realpathSync(main));
  } catch {
    entryDir = path.dirname(path.resolve(main));
  }
  const beside = path.join(entryDir, 'templates');
  if (hasMarker(beside)) return beside;
  // Rare: shim lives in package bin/ but assets in dist/
  const viaDist = path.join(entryDir, '..', 'dist', 'templates');
  if (hasMarker(viaDist)) return viaDist;
  return undefined;
}

/** When running tests or dev tools, cwd is often the server-cli repo root. */
function templatesFromRepoCwd(): string | undefined {
  const fromDist = path.join(process.cwd(), 'dist', 'templates');
  if (hasMarker(fromDist)) return fromDist;
  const fromSrc = path.join(process.cwd(), 'src', 'templates');
  if (hasMarker(fromSrc)) return fromSrc;
  return undefined;
}

export function getTemplatesDir(): string {
  return (
    templatesBesideCliEntry() ??
    templatesFromRepoCwd() ??
    path.join(process.cwd(), 'src', 'templates')
  );
}
