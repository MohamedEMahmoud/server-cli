# Server CLI — Architecture & Implementation Plan (TypeScript)

> A global npm CLI (`server`) written in **TypeScript**, shipped as a compiled
> CJS binary, for deploying and managing Next.js (static export), Nuxt.js,
> Laravel (Supervisor), and Socket.io projects on a Linux server with PM2.

---

## 1. Goals

1. **One command, zero ceremony.** `server 4989` from inside a project directory should Just Work.
2. **Auto-detect everything possible.** Project type, user, app name, domain — inferred from the path and files.
3. **Fail safe, fail loud.** Port conflicts, empty dirs, missing binaries → clear error with a fix suggestion. Never silently corrupt `process.json` or `supervisord.conf`.
4. **Idempotent.** Running the same command twice does the right thing (reuses existing PM2 entry, doesn't duplicate supervisor programs).
5. **Type-safe.** All inputs, configs, and PM2 payloads have TS interfaces. No `any` without a comment.
6. **Publishable.** `tsup` bundles everything into `dist/` → `npm publish --access public` → `npm i -g @your-scope/server-cli`.

---

## 2. Supported Project Types (reflecting your actual servers)

| Type         | Directory shape                                       | Trigger files                                            | PM2 script                           |
| ------------ | ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------ |
| `next`       | `out/` (static export) + `static-server.cjs` at root  | `next.config.{ts,js,mjs}` **or** `.next/` present        | `<dir>/static-server.cjs`            |
| `nuxt`       | `.output/server/index.mjs` + `.output/public/`        | `nuxt.config.{ts,js}` **or** `.output/server/index.mjs`  | `<dir>/.output/server/index.mjs`     |
| `supervisor` | Laravel root with `artisan`                           | `artisan` + `composer.json`                              | (supervisord, not PM2)               |
| `socket`     | `socket/app.js` inside project dir (cloned repo)      | `socket/app.js` + `socket.io` in `socket/package.json`   | `<dir>/socket/app.js`                |

Detection order: **nuxt → next → socket → supervisor** (nuxt wins if `.output/server/index.mjs` exists).

### 2.1 Why Next.js uses a static server (important)

Your `static-server.cjs` serves the `out/` directory produced by `next build` with `output: 'export'`. It is **not** the Next.js SSR server. So the Next flow is:

```
npm i → npm run build   (produces ./out)
     → pm2 starts static-server.cjs  (serves ./out on PORT)
```

### 2.2 Why Nuxt installs inside `.output/server/`

Nuxt's Nitro build bundles a minimal server under `.output/server/` that has its own `package.json` listing only the runtime deps it needs. Installing there (rather than at the project root) keeps the runtime footprint small and matches your current workflow.

---

## 3. Command Surface

### 3.1 Deploy / main commands

```
server <type> [dir] [port] [flags]     # explicit
server [dir] [port] [flags]            # auto-detect type
server [port] [flags]                  # auto-detect type, use cwd
```

Positional arguments are **order-independent** (parser detects by shape):
- numeric `1..65535` → port
- starts with `/` or `./` → directory
- one of `next|nuxt|supervisor|socket` → type

All equivalent:
```bash
server next /home/offroads/provider.offroadsapp.com 4989
server 4989 /home/offroads/provider.offroadsapp.com
server 4989              # inside the directory
```

### 3.2 Lifecycle commands

| Command                                   | Purpose                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `server restart [dir] [port]`             | Restart PM2 app (skips port conflict check).                   |
| `server restart all`                      | Restart every app in `process.json`.                           |
| `server stop <name\|port>`                | `pm2 stop`.                                                    |
| `server delete <name\|port>`              | `pm2 delete` + remove from `process.json` (with backup).       |
| `server status`                           | Pretty table: name, type, port, status, uptime, memory, CPU.   |
| `server list`                             | Plain list of managed apps.                                    |
| `server logs <name> [--lines N] [--follow]` | Tail PM2 logs.                                               |
| `server doctor`                           | Check node, pm2, supervisord, whmapi1, process.json perms.     |
| `server init`                             | Interactive wizard → writes `~/.server-cli/config.json`.       |
| `server self-update`                      | `npm i -g @your-scope/server-cli@latest`.                      |
| `server --version` / `-V`                 | Print version.                                                 |
| `server --help` / `-h`                    | Help (per-command help supported).                             |

### 3.3 Global flags

| Flag               | Meaning                                                    |
| ------------------ | ---------------------------------------------------------- |
| `--dry-run`        | Print every shell command and file edit, execute nothing.  |
| `--verbose` / `-v` | Stream full child process output.                          |
| `--yes` / `-y`     | Skip all interactive prompts (CI mode).                    |
| `--user <u>`       | Override auto-detected Linux user.                         |
| `--name <n>`       | Override auto-detected app name.                           |
| `--domain <d>`     | Override domain for the post-deploy health check.          |
| `--no-healthcheck` | Skip the final HTTP probe.                                 |
| `--config <path>`  | Use a non-default global config.                           |

---

## 4. Argument Parsing Rules

```ts
// pseudocode
function parseArgs(tokens: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (const tok of tokens) {
    if (isTypeKeyword(tok))      out.type = tok;
    else if (isDirectoryPath(tok)) out.dir = resolve(tok);
    else if (isPort(tok))          out.port = Number(tok);
    else throw new ServerCliError(`unknown argument: ${tok}`, { code: 10 });
  }
  out.dir  ??= process.cwd();
  out.type ??= detectType(out.dir);
  // port required except for supervisor and for "restart" resolved by cwd
  return out;
}
```

---

## 5. Auto-Detection

### 5.1 User (Linux account)
Extract from directory path: `/home/<user>/...` → `user`.
Fallback: `--user` flag, then `$USER`, then error.

### 5.2 App name
1. `package.json` → `name` field (next / nuxt / socket).
2. `composer.json` → `name` field, slugified (supervisor).
3. Fallback: basename of the user's home (`/home/offroads/...` → `offroads`), appended with a short hash of the dir to avoid collisions.
4. Override: `--name`.

### 5.3 Domain (for health check)
1. `--domain` flag.
2. `/var/cpanel/userdata/<user>/main` → `main_domain` (cPanel).
3. Nginx vhost: `server_name` directive in a config under `/etc/nginx/`.
4. If the directory basename looks like a domain (`provider.offroadsapp.com`) → use it.
5. Still unresolved → skip health check with a warning.

### 5.4 Project type — ordered checks
```ts
async function detectType(dir: string): Promise<ProjectType> {
  if (await exists(join(dir, '.output/server/index.mjs')))           return 'nuxt';
  if (await hasAny(dir, ['nuxt.config.ts','nuxt.config.js','nuxt.config.mjs'])) return 'nuxt';
  if (await exists(join(dir, '.next'))
      || await hasAny(dir, ['next.config.ts','next.config.js','next.config.mjs'])) return 'next';
  if (await exists(join(dir, 'socket/app.js'))
      && await hasDep(join(dir, 'socket/package.json'), 'socket.io')) return 'socket';
  if (await exists(join(dir, 'artisan'))
      && await exists(join(dir, 'composer.json')))                    return 'supervisor';
  throw new ServerCliError('could not detect project type', {
    hint: 'pass one of: next, nuxt, supervisor, socket',
    code: 40,
  });
}
```

---

## 6. Per-Type Flow

### 6.1 Next.js (static export)

```
1. Validate:
     - dir exists, non-empty
     - port free (skip if `restart`)
2. If <dir>/node_modules exists → rm -rf <dir>/node_modules     (per your spec)
3. cd <dir>; npm i
4. npm run build                                                  (produces ./out)
5. Write <dir>/static-server.cjs from template                    (uses your exact file)
6. Write <dir>/.htaccess from template htaccess-next.tpl         (port placeholder replaced)
7. whmapi1 nginxmanager_clear_cache user=<user>
8. chattr +ia <dir>/.htaccess
9. Update /root/Scripts/process.json:
     - match by cwd; if present → keep, just `pm2 restart <name>`
     - if absent → append:
         { name, script: "<dir>/static-server.cjs", cwd: "<dir>",
           exec_mode: "cluster", instances: 1,
           env: { NODE_ENV: "production", PORT: "<port>", HOST: "0.0.0.0" } }
10. pm2 start /root/Scripts/process.json --only <name>  (or pm2 restart)
11. pm2 save
12. Health check: GET http://<domain>/ → expect 2xx/3xx, 3 retries × 2s
```

### 6.2 Nuxt.js

```
1. Validate (as above)
2. Enter <dir>/.output/server
3. If node_modules exists → rm -rf node_modules
4. npm i
5. Back to <dir>
6. Write <dir>/.htaccess from template htaccess-nuxt.tpl         (with firebase SW + port)
7. whmapi1 nginxmanager_clear_cache user=<user>
8. chattr +ia <dir>/.htaccess
9. Update process.json:
     { name, script: "<dir>/.output/server/index.mjs", cwd: "<dir>",
       exec_mode: "cluster",
       env: { NODE_ENV: "production", PORT: "<port>" } }
10. pm2 start / restart
11. pm2 save
12. Health check
```

### 6.3 Supervisor (Laravel queue worker)

```
1. Validate <dir>/artisan exists
2. Locate supervisord.conf:
     - /etc/supervisord.conf (CentOS/RHEL — your case)
     - /etc/supervisor/supervisord.conf (Debian/Ubuntu)
3. Parse config; if [program:laravel-<user>] already present → error "already registered"
4. Backup conf → <path>.bak.<timestamp>
5. Append program block (templated with USER + DIR)
6. sudo systemctl stop supervisord
7. sudo systemctl restart supervisord
8. Verify <dir>/laravel-worker.log appears within 10s (poll every 500ms)
```

### 6.4 Socket

```
1. Ensure <dir>/socket/ exists:
     - if missing or empty → git clone https://github.com/MohamedEMahmoud/socket.git <dir>/socket
2. cd <dir>/socket; npm i     (via npmInstallWithForeignSharpRecovery)
3. Inject SSL + NODE_* block into <dir>/.env using detected domain:
     - NODE_HOST, NODE_PORT, NODE_MODE=live
     - KEY, CERT, CA paths under /var/cpanel/ssl/apache_tls/<domain>/
     - STORAGE, IMAGES, ROOMS constants
     - existing keys in <dir>/.env are preserved (only missing keys appended
       under "# --- merged from socket/.env ---" header)
     - rm <dir>/socket/.env if present
4. Ensure <dir>/.gitignore ignores socket/node_modules
5. Rewrite domain-shaped tokens on URL / DOMAIN= lines inside <dir>/socket/*.md
6. Sync declared PORT in ecosystem / .env files under <dir>/socket/
7. Upsert process.json entry:
     { name, script: "<dir>/socket/app.js", cwd: "<dir>/socket",
       exec_mode: "cluster", instances: 1,
       env: { NODE_ENV: "production", PORT: "<port>" } }
8. pm2 start / restart (+ pm2 save)
9. Health check against detected domain
```

Restart:
- `server restart socket` (from project root) → matches entry by cwd `<dir>/socket`
- `server restart` (from project root) → matches entry by project root cwd

---

## 7. Port Management

Before any non-restart deploy:

```
1. Parse /root/Scripts/process.json → any entry with env.PORT === <port>?
2. `pm2 jlist` → any process binding <port>?
3. `lsof -i:<port> -sTCP:LISTEN`     (fallback: `ss -ltn | grep :<port>`)
```

If any hits:
```
✖ port 4989 is already in use by "off-roads-insurance-dashboard" (pm2 id 3).
  → hint: change the port, or run: server restart /home/offroads/provider.offroadsapp.com
```

`server restart ...` always skips this check.

---

## 8. Package Layout (TypeScript)

```
server-cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
├── LICENSE                        (MIT)
├── .npmignore
├── .gitignore
├── bin/
│   └── server.js                  ← built by tsup, shebang-prefixed
├── src/
│   ├── index.ts                   ← entry (installs unhandled-rejection handler, calls cli())
│   ├── cli.ts                     ← commander setup + global flags
│   ├── types.ts                   ← shared types & interfaces
│   ├── commands/
│   │   ├── deploy.ts              ← shared deploy orchestrator
│   │   ├── next.ts
│   │   ├── nuxt.ts
│   │   ├── supervisor.ts
│   │   ├── socket.ts              ← stub
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
│   │   ├── exec.ts                ← execa wrapper with dry-run
│   │   ├── fs.ts                  ← safe read/write + backups
│   │   ├── lock.ts                ← /tmp/server-cli.lock
│   │   └── errors.ts              ← ServerCliError
│   └── templates/
│       ├── static-server.cjs      ← COPIED AS-IS from your upload
│       ├── htaccess-next.tpl      ← lean version for Next static
│       ├── htaccess-nuxt.tpl      ← full version with firebase SW (your upload, port templated)
│       └── supervisor-program.tpl ← Laravel queue worker block
├── dist/                          ← tsup output (published, not checked in)
└── test/
    ├── args.test.ts
    ├── detect.test.ts
    ├── process-json.test.ts
    └── fixtures/
        ├── next-project/          (has next.config.ts + out/)
        ├── nuxt-project/          (has .output/server/index.mjs)
        ├── socket-project/        (has server/app.js + socket.io dep)
        └── laravel-project/       (has artisan + composer.json)
```

---

## 9. TypeScript Types (central file)

```ts
// src/types.ts
export type ProjectType = 'next' | 'nuxt' | 'supervisor' | 'socket';

export interface ParsedArgs {
  type?: ProjectType;
  dir?: string;
  port?: number;
}

export interface ResolvedContext {
  type: ProjectType;
  dir: string;
  port?: number;       // required for next/nuxt/socket
  user: string;
  name: string;
  domain?: string;
  isRestart: boolean;
  flags: GlobalFlags;
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
  processJsonPath: string;        // default "/root/Scripts/process.json"
  supervisordConfPath: string;    // default "/etc/supervisord.conf"
  defaultUser?: string;
  healthcheck: { retries: number; delayMs: number; timeoutMs: number };
}
```

---

## 10. Templates

- **`static-server.cjs`** — **ships byte-for-byte from your upload**. No placeholders; port comes from `process.env.PORT` which PM2 injects.
- **`htaccess-next.tpl`** — minimal proxy (port replaced via `{{PORT}}`).
- **`htaccess-nuxt.tpl`** — your uploaded version with `{{PORT}}` placeholder everywhere the hard-coded `4989` appears.
- **`supervisor-program.tpl`** — the program block with `{{USER}}` and `{{DIR}}`.

Rendering is trivial string replacement:
```ts
const rendered = template.replace(/\{\{PORT\}\}/g, String(port))
                         .replace(/\{\{USER\}\}/g, user)
                         .replace(/\{\{DIR\}\}/g,  dir);
```

---

## 11. Configuration Layering

Precedence (later wins):

1. Compiled-in defaults.
2. `~/.server-cli/config.json` (global, created by `server init`).
3. `./server.yaml` in the project directory (per-project override).
4. CLI flags.

Example global config:
```json
{
  "processJsonPath": "/root/Scripts/process.json",
  "supervisordConfPath": "/etc/supervisord.conf",
  "defaultUser": null,
  "healthcheck": { "retries": 3, "delayMs": 2000, "timeoutMs": 5000 }
}
```

Example `server.yaml`:
```yaml
name: off-roads-insurance-dashboard
type: next
port: 4989
env:
  NEXT_PUBLIC_API_URL: "https://api.offroadsapp.com"
```

---

## 12. Safety & Idempotency

- **Backups** — before every write to `process.json` or `supervisord.conf`, copy to `<path>.bak.<unix-ts>`. Keep last 5.
- **Atomic writes** — write to `<path>.tmp`, then `rename()`.
- **Lock file** — `/tmp/server-cli.lock` holds `{ pid, command, startedAt }`. Refuse to run if held by a live pid. Clean up on exit + SIGINT/SIGTERM.
- **process.json merging** — parse, find entry by `cwd` (names collide across servers), update in place, preserve unknown fields.
- **Dry-run everywhere** — every `exec`, `writeFile`, `chattr` routes through `src/utils/exec.ts` which honors `flags.dryRun`.
- **Build rollback** — if `npm run build` fails, restore prior `process.json` from the backup and don't touch PM2.
- **`chattr -i` before re-write** — `.htaccess` is made immutable (`chattr +ia`) after writing. On re-deploy, CLI must run `chattr -ia` first, then rewrite, then re-lock.

---

## 13. Error Handling

```ts
export class ServerCliError extends Error {
  constructor(message: string, public opts: { hint?: string; code?: number } = {}) {
    super(message);
    this.name = 'ServerCliError';
  }
}
```

Top-level handler prints red `✖`, dim `→ hint:` line, and exits with `opts.code ?? 1`.

Exit codes:

| Code | Meaning                    |
| ---- | -------------------------- |
| 0    | OK                         |
| 10   | Bad arguments              |
| 20   | Directory empty or missing |
| 30   | Port in use                |
| 40   | Project type not detected  |
| 50   | Build failed               |
| 60   | PM2 failure                |
| 70   | Supervisor failure         |
| 80   | Health check failed        |
| 90   | Lock held by another pid   |

---

## 14. Dependencies (lean)

**Runtime:**
- `commander` — CLI framework
- `execa` — child processes
- `chalk` — colors
- `fs-extra` — safer fs
- `yaml` — parse `server.yaml`

(Native `fetch` is used for the health check — no `node-fetch`.)

**Build / dev:**
- `typescript`
- `tsup` — bundler (single `dist/server.js` CJS output)
- `vitest` — tests
- `@types/node`
- `@types/fs-extra`

**Minimum Node version:** `>=18`.

---

## 15. Build & Distribution

`tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { server: 'src/index.ts' },
  format: ['cjs'],
  target: 'node18',
  clean: true,
  bundle: true,
  minify: false,
  sourcemap: false,
  outDir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
  // copy templates next to the bundle
  onSuccess: 'cp -r src/templates dist/templates',
});
```

`package.json` essentials:
```json
{
  "name": "@your-scope/server-cli",
  "version": "1.0.0",
  "bin": { "server": "dist/server.js" },
  "engines": { "node": ">=18" },
  "files": ["dist", "README.md", "LICENSE"],
  "preferGlobal": true,
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  }
}
```

Publish:
```bash
npm login
npm publish --access public
```

Install:
```bash
npm i -g @your-scope/server-cli
server --version
```

---

## 16. Testing Strategy

- **Unit (vitest)**
  - `args.ts` — every permutation in §3.1
  - `detect.ts` — fixture dirs under `test/fixtures/`
  - `process-json.ts` — merge new entry, existing entry, port conflict
  - `port.ts` — mock `pm2 jlist` output + process.json
- **Dry-run smoke test**
  - `server next test/fixtures/next-project 4989 --dry-run` prints the planned commands and exits 0 with zero side effects.
- **Integration** (opt-in, `TEST_INTEGRATION=1`)
  - Spin up a minimal Next static export in `/tmp`, run the real CLI, `curl` the port.

---

## 17. Roadmap

| Version | Scope |
| ------- | ----- |
| 1.0     | next, nuxt, supervisor, restart, stop, delete, status, logs, doctor, dry-run, lock file, backups |
| 1.1     | socket setup (WebSocket handshake health check) |
| 1.2     | `server init` wizard, `server.yaml` per-project config |
| 1.3     | Remote mode: run against another host over SSH |
| 2.0     | Read-only dashboard: `server dashboard --port 9000` |

---

## 18. Command Cheat Sheet (all paths equivalent)

```
# Next.js
server next /home/offroads/provider.offroadsapp.com 4989
  = server next 4989             (from inside the dir)
  = server 4989                  (type auto-detected)

# Restart (no port check)
server restart /home/offroads/provider.offroadsapp.com 4989
  = server restart /home/offroads/provider.offroadsapp.com
  = server restart               (from inside the dir)

# Nuxt.js
server nuxt /home/wesellco/public_html 4988
  = server nuxt 4988
  = server 4988

# Laravel / Supervisor
server supervisor /home/aladarba/public_html
  = server supervisor            (from inside the dir)

# Socket
server socket /home/practice/dashboard.practice.4hoste.com 4998
  = server socket 4998           (from inside the dir)
server restart socket            (restart just the socket app)
```
