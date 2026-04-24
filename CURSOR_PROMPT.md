# Cursor Prompt — Build `server-cli` (TypeScript)

> **How to use:** open a fresh Cursor project, paste this whole file into the
> chat, then say:
> **"Build the package exactly as specified. Create every file, install deps, compile, and run the tests."**

---

## Role

You are a senior Node.js/TypeScript engineer. Build a production-ready npm
package named **`@your-scope/server-cli`** that deploys and manages Next.js
(static export), Nuxt.js, Laravel (via Supervisor), and Socket.io projects on
a Linux server with PM2. Ship it as a compiled CJS binary with a single
`server` command.

---

## Deliverables

A git-ready repo that compiles cleanly, passes `npm test`, and is ready for
`npm publish --access public`. Every file in §4 must exist and be functional.
**Only `src/commands/socket.ts` is a stub for v1.0** — print
`"Socket setup — coming in v1.1"` and exit 0.

---

## 1. Hard Requirements

- **TypeScript** source in `src/**/*.ts`; compiled to **CommonJS** via `tsup`.
- **Node ≥ 18** (use native `fetch`).
- **Strict TS** — `"strict": true` in tsconfig, no `any` without a `// TODO` comment.
- **Single bundled binary** — `dist/server.js` with `#!/usr/bin/env node` banner.
- **Templates copied** to `dist/templates/` during build (do not embed as strings).
- **All shell exec goes through `utils/exec.ts`** — which honors `--dry-run` globally.

---

## 2. `package.json`

```json
{
  "name": "@your-scope/server-cli",
  "version": "1.0.0",
  "description": "Deploy and manage Next.js, Nuxt.js, Laravel (Supervisor) and Socket apps on a Linux server.",
  "bin": { "server": "dist/server.js" },
  "engines": { "node": ">=18" },
  "files": ["dist", "README.md", "LICENSE"],
  "preferGlobal": true,
  "type": "commonjs",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  },
  "keywords": ["cli", "pm2", "nextjs", "nuxt", "laravel", "supervisor", "deploy", "server"],
  "license": "MIT",
  "dependencies": {
    "commander": "^12.1.0",
    "execa": "^8.0.1",
    "chalk": "^5.3.0",
    "fs-extra": "^11.2.0",
    "yaml": "^2.5.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsup": "^8.2.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.14.0",
    "@types/fs-extra": "^11.0.4"
  }
}
```

> `chalk@5` is ESM-only. Since we bundle with tsup → CJS, tsup will inline it.
> If any ESM interop issue appears, pin `chalk@4.1.2` instead.

---

## 3. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

## `tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/index.ts' },
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  clean: true,
  bundle: true,
  minify: false,
  sourcemap: false,
  outDir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
  onSuccess: 'cp -r src/templates dist/templates && chmod +x dist/server.js',
});
```

---

## 4. Exact File Tree (create every one)

```
server-cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── LICENSE                         (MIT — boilerplate is fine)
├── .npmignore
├── .gitignore
├── src/
│   ├── index.ts                    Entry point (shebang via tsup banner)
│   ├── cli.ts                      Commander setup + routing
│   ├── types.ts                    All shared types/interfaces
│   ├── commands/
│   │   ├── deploy.ts               Shared orchestrator used by next/nuxt
│   │   ├── next.ts
│   │   ├── nuxt.ts
│   │   ├── supervisor.ts
│   │   ├── socket.ts               Stub for v1.0
│   │   ├── restart.ts
│   │   ├── stop.ts
│   │   ├── delete.ts
│   │   ├── status.ts
│   │   ├── list.ts
│   │   ├── logs.ts
│   │   ├── doctor.ts
│   │   ├── init.ts
│   │   └── self-update.ts
│   ├── core/
│   │   ├── detect.ts
│   │   ├── args.ts
│   │   ├── port.ts
│   │   ├── pm2.ts
│   │   ├── process-json.ts
│   │   ├── supervisor-conf.ts
│   │   ├── htaccess.ts
│   │   ├── domain.ts
│   │   └── config.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── exec.ts
│   │   ├── fs.ts
│   │   ├── lock.ts
│   │   └── errors.ts
│   └── templates/
│       ├── static-server.cjs       COPY BYTE-FOR-BYTE from the reference block in §10
│       ├── htaccess-next.tpl       See §10
│       ├── htaccess-nuxt.tpl       See §10 (port templated as {{PORT}})
│       └── supervisor-program.tpl  See §10
└── test/
    ├── args.test.ts
    ├── detect.test.ts
    ├── process-json.test.ts
    └── fixtures/
        ├── next-project/
        │   ├── next.config.ts      (empty "export default {}")
        │   ├── package.json        ({ "name": "next-fixture" })
        │   └── out/index.html      (<html>ok</html>)
        ├── nuxt-project/
        │   ├── nuxt.config.ts
        │   └── .output/server/index.mjs  (export const x = 1)
        ├── socket-project/
        │   └── server/
        │       ├── app.js
        │       └── package.json    ({ "name":"sock","dependencies":{"socket.io":"^4"} })
        └── laravel-project/
            ├── artisan             (empty)
            └── composer.json       ({ "name":"a/b" })
```

---

## 5. Central Types (`src/types.ts`)

```ts
export type ProjectType = 'next' | 'nuxt' | 'supervisor' | 'socket';

export interface ParsedArgs {
  type?: ProjectType;
  dir?: string;
  port?: number;
}

export interface GlobalFlags {
  dryRun: boolean;
  verbose: boolean;
  yes: boolean;
  user?: string;
  name?: string;
  domain?: string;
  noHealthcheck: boolean;
  configPath?: string;
}

export interface ResolvedContext {
  type: ProjectType;
  dir: string;
  port?: number;
  user: string;
  name: string;
  domain?: string;
  isRestart: boolean;
  flags: GlobalFlags;
  config: GlobalConfig;
}

export interface PM2AppEntry {
  name: string;
  script: string;
  cwd: string;
  exec_mode: 'cluster' | 'fork';
  instances?: number;
  env: Record<string, string>;
}

export interface ProcessJson {
  apps: PM2AppEntry[];
}

export interface GlobalConfig {
  processJsonPath: string;
  supervisordConfPath: string;
  defaultUser?: string;
  healthcheck: { retries: number; delayMs: number; timeoutMs: number };
}

export interface ProjectYaml {
  name?: string;
  type?: ProjectType;
  port?: number;
  env?: Record<string, string>;
}
```

---

## 6. Per-File Specifications

### `src/index.ts`
- Install handlers for `uncaughtException` and `unhandledRejection` that print via `logger.fatal` and exit `1`.
- `import { cli } from './cli'; cli(process.argv);`

### `src/cli.ts`
- Use `commander`. Program name `server`, version from `package.json`.
- Register global flags from §3.3 of PLAN.
- Subcommands: `next`, `nuxt`, `supervisor`, `socket`, `restart`, `stop`, `delete`, `status`, `list`, `logs`, `doctor`, `init`, `self-update`.
- **Default action** (no subcommand): parse positional args with `core/args.ts`, auto-detect type, dispatch to the matching command.
- Every command wraps its body in `try/catch`; on `ServerCliError` → pretty print + exit with `code`; on any other error → log stack if `--verbose`, exit 1.

### `src/core/args.ts`
```ts
export function parseArgs(tokens: string[]): ParsedArgs;
```
Rules:
- known type keyword → `type`
- starts with `/` or `./` → `dir` (resolved absolute)
- numeric, `1..65535` → `port`
- else → `ServerCliError('unknown argument: ' + tok, { code: 10 })`
- after loop: `dir ??= process.cwd()`; `type ??= detectType(dir)` (detect is async — caller awaits).

### `src/core/detect.ts`
Implements the ordered checks from §5.4 of PLAN. Exports:
```ts
export async function detectType(dir: string): Promise<ProjectType>;
export function detectUser(dir: string, flag?: string): string;        // from /home/<user>/... or flag or $USER
export async function detectName(dir: string, type: ProjectType, flag?: string): Promise<string>;
export async function detectDomain(user: string, dir: string, flag?: string): Promise<string | undefined>;
```

### `src/core/port.ts`
```ts
export async function assertPortFree(port: number, ctx: ResolvedContext): Promise<void>;
// Throws ServerCliError(code:30) if taken. Skipped in restart path.
```
Internally runs all three checks from §7 of PLAN in order, reports which one hit.

### `src/core/pm2.ts`
Thin wrappers that shell out via `utils/exec`:
```ts
export async function pm2List(): Promise<Array<{ name: string; pm_id: number; status: string; port?: number }>>;
export async function pm2Start(processJsonPath: string, only?: string): Promise<void>;
export async function pm2Restart(name: string): Promise<void>;
export async function pm2Stop(name: string): Promise<void>;
export async function pm2Delete(name: string): Promise<void>;
export async function pm2Save(): Promise<void>;
```

### `src/core/process-json.ts`
```ts
export async function read(path: string): Promise<ProcessJson>;
export async function writeAtomic(path: string, data: ProcessJson): Promise<void>;   // +.bak.<ts>
export function findByCwd(doc: ProcessJson, cwd: string): PM2AppEntry | undefined;
export function upsert(doc: ProcessJson, entry: PM2AppEntry): ProcessJson;           // replace by cwd
```

### `src/core/supervisor-conf.ts`
```ts
export async function hasProgram(confPath: string, programName: string): Promise<boolean>;
export async function appendProgram(confPath: string, block: string): Promise<void>; // +.bak.<ts>
```

### `src/core/htaccess.ts`
```ts
export async function writeHtaccess(
  dir: string,
  template: 'next' | 'nuxt',
  port: number
): Promise<void>;
// 1. runs `chattr -ia <path>` (ignore error if missing)
// 2. writes file from templates/htaccess-<template>.tpl with {{PORT}} replaced
// 3. runs `whmapi1 nginxmanager_clear_cache user=<user>`  (accepts user arg)
// 4. runs `chattr +ia <path>`
export async function clearNginxCache(user: string): Promise<void>;
```

### `src/core/domain.ts`
```ts
export async function healthCheck(url: string, cfg: GlobalConfig['healthcheck']): Promise<void>;
// GET url, expect 2xx/3xx. Retries `cfg.retries` times, waits `cfg.delayMs` between.
// Throws ServerCliError(code: 80) on final failure.
```

### `src/core/config.ts`
- Load `~/.server-cli/config.json`, merge over defaults.
- Load `./server.yaml` if present, merge over global.
- CLI flags override everything.
- Export `loadConfig(flags: GlobalFlags): Promise<GlobalConfig & { project?: ProjectYaml }>`.

### `src/utils/exec.ts`
```ts
export interface ExecOpts { cwd?: string; env?: Record<string,string>; verbose?: boolean }
export async function run(cmd: string, args: string[], opts?: ExecOpts & { dryRun?: boolean }): Promise<string>;
export async function runSh(line: string, opts?: ExecOpts & { dryRun?: boolean }): Promise<string>;
```
- If `dryRun` → log `DRY $ cmd args` and return `''`.
- If `verbose` → stream stdout/stderr live; else capture both and return stdout trimmed.
- On non-zero exit → throw plain Error (commands decide whether to wrap as `ServerCliError`).

### `src/utils/fs.ts`
```ts
export async function exists(p: string): Promise<boolean>;
export async function isEmptyDir(p: string): Promise<boolean>;
export async function backup(p: string, keep?: number): Promise<string | null>;   // returns .bak path or null if source absent
export async function writeAtomic(p: string, data: string | Buffer): Promise<void>; // .tmp then rename
export async function readJson<T>(p: string): Promise<T>;
export async function writeJson(p: string, obj: unknown): Promise<void>;          // pretty 2-space
```

### `src/utils/lock.ts`
```ts
export async function acquire(command: string): Promise<() => Promise<void>>;
// returns release fn. Throws ServerCliError(code:90) if held by a live pid.
// Auto-releases on SIGINT/SIGTERM/exit.
```

### `src/utils/logger.ts`
- `logger.info|warn|error|fatal|step|success|dim(text)` using chalk.
- `step` used between pipeline stages: `[1/12] cleaning node_modules...`.
- In `--verbose`, also logs timestamps.

### `src/utils/errors.ts`
```ts
export class ServerCliError extends Error {
  readonly hint?: string;
  readonly code: number;
  constructor(message: string, opts: { hint?: string; code?: number } = {}) {
    super(message);
    this.name = 'ServerCliError';
    this.hint = opts.hint;
    this.code = opts.code ?? 1;
  }
}
```

### `src/commands/deploy.ts`
Shared orchestrator signature:
```ts
export async function deploy(ctx: ResolvedContext, opts: {
  install(ctx: ResolvedContext): Promise<void>;    // rm node_modules + npm i (+ build)
  writeArtifacts(ctx: ResolvedContext): Promise<void>;  // static-server.cjs, .htaccess, chattr
  pm2Entry(ctx: ResolvedContext): PM2AppEntry;
}): Promise<void>;
```
Handles: validation, port check (skipped if restart), process.json upsert, PM2 start/restart, save, health check.

### `src/commands/next.ts`
Implements §6.1 of PLAN using `deploy()`:
- `install`: `rm -rf <dir>/node_modules` (if exists) → `npm i` → `npm run build`
- `writeArtifacts`:
   - `cp templates/static-server.cjs <dir>/static-server.cjs` (chmod 644)
   - `writeHtaccess(dir, 'next', port)`
- `pm2Entry`: as in §6.1.9

### `src/commands/nuxt.ts`
§6.2 of PLAN.
- `install`: inside `<dir>/.output/server`, `rm -rf node_modules` if present → `npm i`
- `writeArtifacts`: `writeHtaccess(dir, 'nuxt', port)`
- `pm2Entry`: as in §6.2.9

### `src/commands/supervisor.ts`
§6.3 of PLAN — completely separate path (no PM2, no deploy orchestrator).

### `src/commands/restart.ts`
- Resolve `{dir, port?}` from args (port optional).
- Load process.json, find entry by `cwd === dir`.
- If missing → `ServerCliError('no app registered at ' + dir, { code: 10, hint: 'deploy first: server <type> <dir> <port>' })`.
- `pm2 restart <name>`.
- **Do not** run port check.
- Health check unless `--no-healthcheck`.

### `src/commands/status.ts`
- `pm2 jlist` → cross-reference with `process.json` → print a table:
  `NAME  TYPE  PORT  STATUS  UPTIME  CPU  MEM`
- Colors: green `online`, yellow `launching`, red `errored`/`stopped`.
- No external table lib — implement a minimal aligned-column printer (≤40 LOC).

### `src/commands/logs.ts`
- `pm2 logs <name>` with `--lines` passed through; `--follow` default true unless `--no-follow`.
- Use `execa` with `stdio: 'inherit'`.

### `src/commands/doctor.ts`
Checks (each prints ✓ or ✖):
- `node --version` ≥ 18
- `pm2 --version` present
- `supervisord -v` present
- `whmapi1 --version` present (optional — warn, don't fail)
- `/root/Scripts/process.json` readable+writable
- `/etc/supervisord.conf` readable+writable
- Current user is root (warn if not)

### `src/commands/init.ts`
Interactive prompts (skip if `--yes`, use defaults):
- process.json path → `/root/Scripts/process.json`
- supervisord.conf path → `/etc/supervisord.conf`
- default user → `$USER`
Write to `~/.server-cli/config.json`. Print path on success.

### `src/commands/self-update.ts`
`npm i -g @your-scope/server-cli@latest` (respects `--dry-run`).

---

## 7. Argument Parser — must pass these tests

```ts
// test/args.test.ts
import { parseArgs } from '../src/core/args';

test('type + dir + port in any order', () => {
  expect(parseArgs(['next','/home/a','4989'])).toEqual({ type:'next', dir:'/home/a', port:4989 });
  expect(parseArgs(['4989','/home/a','next'])).toEqual({ type:'next', dir:'/home/a', port:4989 });
  expect(parseArgs(['/home/a','next','4989'])).toEqual({ type:'next', dir:'/home/a', port:4989 });
});

test('just a port', () => {
  expect(parseArgs(['4989'])).toEqual({ port: 4989 });
});

test('just a dir', () => {
  expect(parseArgs(['/home/a'])).toEqual({ dir: '/home/a' });
});

test('invalid port is treated as unknown', () => {
  expect(() => parseArgs(['70000'])).toThrow(/unknown argument/);
});
```

---

## 8. Project Type Detection — must pass these tests

Use the `test/fixtures/*` directories. Assertions:
- `detectType('test/fixtures/next-project')` → `'next'`
- `detectType('test/fixtures/nuxt-project')` → `'nuxt'`
- `detectType('test/fixtures/socket-project')` → `'socket'`
- `detectType('test/fixtures/laravel-project')` → `'supervisor'`
- `detectType('/tmp/empty-xyz')` → throws `ServerCliError` with `code: 40`.

---

## 9. `process.json` Merge — must pass these tests

- Empty file → create with `{apps:[{...}]}`.
- Existing entry with matching `cwd` → replace in place, preserve array order.
- Existing entry with different `cwd` but same `name` → still append (names allowed to collide across different `cwd` values? **No** — also fail with `ServerCliError(code:10, hint: 'duplicate name')`).
- After each write, a `.bak.<ts>` file must exist alongside it.

---

## 10. Reference Templates (copy these exactly into `src/templates/`)

### 10.1 `src/templates/static-server.cjs` — byte-for-byte

```js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const port = Number(process.env.PORT || 4989);
const host =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const rootDir = process.env.STATIC_ROOT
  ? path.resolve(process.env.STATIC_ROOT)
  : path.resolve(__dirname, "out");

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".eot", "application/vnd.ms-fontobject"],
  [".map", "application/json; charset=utf-8"],
]);

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function safeJoin(base, target) {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request");

  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname || "/");
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  const joined = safeJoin(rootDir, "." + pathname);
  if (!joined) return send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");

  let candidate = joined;
  if (dirExists(candidate)) candidate = path.join(candidate, "index.html");
  if (!path.extname(candidate) && !fileExists(candidate) && fileExists(`${candidate}.html`)) {
    candidate = `${candidate}.html`;
  }
  if (!path.extname(candidate) && !fileExists(candidate)) {
    candidate = path.join(rootDir, "index.html");
  }
  if (!fileExists(candidate)) {
    return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
  }

  const ext = path.extname(candidate).toLowerCase();
  const contentType = mime.get(ext) || "application/octet-stream";
  try {
    const stat = fs.statSync(candidate);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable");
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(candidate).pipe(res);
  } catch {
    return send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, "Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`Static server listening on http://${host}:${port} (root: ${rootDir})`);
});
```

### 10.2 `src/templates/htaccess-next.tpl`

```apache
# Generated by server-cli. Do not edit manually.
<IfModule mod_rewrite.c>
RewriteEngine On

RewriteCond %{HTTP_HOST} ^www\.(.*)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [L,R=301]

RewriteCond %{SERVER_PORT} !=80 [OR]
RewriteCond %{SERVER_PORT} !=443
RewriteRule ^index.php(.*) http://%{HTTP_HOST}:{{PORT}}/$1 [P,L,E=no-gzip:1]

# Serve static assets directly if present on disk
RewriteCond %{REQUEST_URI} \.(svg|svgz|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|otf|css|js|map|pdf|mp4|webm|ogg|mp3|wav)$ [NC]
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]

RewriteRule (.*) http://%{HTTP_HOST}:{{PORT}}/$1 [P,L,E=no-gzip:1]
</IfModule>
```

### 10.3 `src/templates/htaccess-nuxt.tpl`

Use the full `.htaccess` the user uploaded, with every occurrence of the port
number `4989` replaced by `{{PORT}}`. Keep:
- Firebase service-worker handler block (Nuxt-specific)
- HTTPS/www canonicalisation
- `.output/public/` direct-serve rules
- Static asset bypass
- Compression, cache headers, cPanel PHP handler blocks

### 10.4 `src/templates/supervisor-program.tpl`

```ini
[program:laravel-{{USER}}]
command=/usr/local/bin/php {{DIR}}/artisan queue:work --sleep=3 --tries=3
process_name=%(program_name)s
numprocs=1
autostart=true
autorestart=true
startsecs=10
startretries=3
user={{USER}}
redirect_stderr=true
stdout_logfile={{DIR}}/laravel-worker.log
```

---

## 11. Command Behaviour — Golden Examples

Run these in your head against the code you write. Every one must produce the
listed output (in `--dry-run` they print the plan and exit 0).

```bash
# Inside /home/offroads/provider.offroadsapp.com
server 4989
# → detects `next` (has next.config.ts + .next/)
# → [1/12] port 4989 free
# → [2/12] removing node_modules
# → [3/12] npm i
# → [4/12] npm run build
# → [5/12] writing static-server.cjs
# → [6/12] writing .htaccess
# → [7/12] clearing nginx cache for user=offroads
# → [8/12] locking .htaccess (chattr +ia)
# → [9/12] updating /root/Scripts/process.json (new entry)
# → [10/12] pm2 start process.json --only <name>
# → [11/12] pm2 save
# → [12/12] health check http://provider.offroadsapp.com/ → 200 ✓
# ✔ deployed provider.offroadsapp.com on port 4989

server restart
# → reads cwd, finds app in process.json by cwd, pm2 restart <name>, health check, done

server status
# → prints a colored table with every app in process.json + its pm2 state

server doctor
# → node ✓ 20.5.0
# → pm2 ✓ 5.3.1
# → supervisord ✓ 4.2.5
# → whmapi1 ✓
# → /root/Scripts/process.json rw ✓
# → running as root ✓
```

---

## 12. Edge Cases You Must Handle

1. **Empty directory** → `ServerCliError(code:20, 'directory is empty', hint:'deploy a build first')`.
2. **Missing `package.json` for next/nuxt** → `ServerCliError(code:40)`.
3. **`pm2` binary not installed** → `ServerCliError(code:60, hint:'npm i -g pm2')`.
4. **Existing entry with same port but different cwd** → port conflict error with the offending cwd in the message.
5. **`process.json` malformed** → back it up to `.bak.<ts>.broken`, start fresh with a warning.
6. **User runs without root and tries to write `/root/Scripts/process.json`** → `ServerCliError(code:60, hint:'run with sudo')`.
7. **Health check times out** → keep the deploy (PM2 already started), but exit with `code:80` and warn the user to investigate.
8. **Ctrl-C mid-deploy** → release lock, print `aborted`, exit 130.
9. **`chattr` binary missing** (non-standard distro) → warn, continue without locking.
10. **`.htaccess` is locked (`chattr +i`) but we're redeploying** → run `chattr -ia` first, then rewrite, then re-lock.

---

## 13. README.md Contents (write this too)

Sections:
1. Install (`npm i -g @your-scope/server-cli`)
2. Quick start — copy the command cheat sheet from §18 of PLAN.
3. Auto-detection — how user / name / domain are inferred.
4. Supported project types — table.
5. Config — where `~/.server-cli/config.json` lives, what `server.yaml` overrides.
6. Flags — every global flag with one-line description.
7. Troubleshooting — the 10 edge cases above, each with the error code and fix.
8. License — MIT.

---

## 14. Definition of Done

- [ ] `npm install` with zero warnings.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` — all tests green (args, detect, process-json).
- [ ] `npm run build` produces `dist/server.js` (executable) + `dist/templates/`.
- [ ] `node dist/server.js --version` prints `1.0.0`.
- [ ] `node dist/server.js next test/fixtures/next-project 4989 --dry-run` prints the full plan and exits 0 with no side effects.
- [ ] `node dist/server.js doctor` runs and reports.
- [ ] README.md covers install, usage, config, flags, troubleshooting.

---

## 15. Implementation Order (suggested)

1. `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `.npmignore`
2. `src/types.ts`, `src/utils/errors.ts`, `src/utils/logger.ts`
3. `src/utils/fs.ts`, `src/utils/exec.ts`, `src/utils/lock.ts`
4. `src/core/args.ts` + tests
5. `src/core/detect.ts` + fixtures + tests
6. `src/core/process-json.ts` + tests
7. `src/core/port.ts`, `src/core/pm2.ts`
8. `src/core/htaccess.ts`, `src/core/domain.ts`, `src/core/supervisor-conf.ts`, `src/core/config.ts`
9. `src/templates/` — copy the three templates
10. `src/commands/deploy.ts` → `next.ts`, `nuxt.ts`, `supervisor.ts`, `socket.ts` (stub)
11. `src/commands/restart.ts`, `stop.ts`, `delete.ts`, `status.ts`, `list.ts`, `logs.ts`, `doctor.ts`, `init.ts`, `self-update.ts`
12. `src/cli.ts`, `src/index.ts`
13. README.md
14. Build, run all DoD checks.

---

**Now build it.** When each file is done, write the next. At the end, run
`npm run typecheck && npm test && npm run build` and show me the output.
