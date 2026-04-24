# server-cli

Deploy and manage **Next.js**, **Nuxt.js**, **Laravel** (Supervisor), and **Socket.IO** apps on a Linux/cPanel server using PM2 and supervisord.

```bash
npm i -g @node-software-ts/server-cli
server --version
```

---

## How it works

Each deploy command runs a fixed pipeline:

1. **Port check** — fails fast if the port is already bound by a different app
2. **Install** — `npm install` (or `npm run build` for Next.js)
3. **Artifacts** — writes `.htaccess`, injects `.env` keys, syncs config files
4. **`chown`** — sets ownership to the project user (skippable with `--no-chown`)
5. **process.json** — upserts the PM2 entry, sorts all apps by port (descending)
6. **PM2** — `pm2 start` on first deploy, `pm2 restart` on subsequent deploys
7. **pm2 save** — persists the process list across reboots
8. **Health check** — HTTP or Socket.IO probe to confirm the app is responding

All steps log their number (`[1/13]`), so you always know where you are.

---

## Commands

### `server nuxt <dir> <port>`

Deploys a **Nuxt 4 / Nitro** app (built output must exist at `.output/server/index.mjs`).

```bash
server nuxt /home/practice/public_html 4988
```

**What it does:**
- Strips foreign `@img/sharp` binaries from `package-lock.json` (cross-platform safety)
- Removes and reinstalls `.output/server/node_modules`
- Writes a reverse-proxy `.htaccess` pointing to the port
- Clears nginx cache (`whmapi1 nginxmanager_clear_cache`)
- Locks `.htaccess` against accidental overwrite (`chattr +ia`)
- Registers / restarts the PM2 cluster process

---

### `server next <dir> <port>`

Deploys a **Next.js** app (SSR or static export).

```bash
server next /home/practice/provider.practice.4hoste.com 4990
```

**What it does:**
- Detects whether the project is a static export (`out/` directory or `output: 'export'` in config)
  - **SSR:** starts `next start` via PM2 cluster
  - **Static:** copies `static-server.cjs` and serves the `out/` directory
- Cleans and reinstalls `node_modules`
- Runs `npm run build`
- Writes `.htaccess` and clears nginx cache

---

### `server socket <dir> <port>`

Deploys a **Socket.IO v4** Node.js server.

```bash
server socket /home/practice/dashboard.practice.4hoste.com 4995
```

**What it does:**
1. Clones `https://github.com/MohamedEMahmoud/node.git` into `<dir>/node/` (skips if already present, removes `.git` after clone)
2. Runs `npm install` inside `node/`
3. Injects managed `.env` keys into the project root `.env`:
   - `APP_URL=https://<domain>`
   - `NODE_HOST=<domain>` · `NODE_PORT=<port>` · `NODE_MODE=live`
   - `KEY`, `CERT`, `CA` → cPanel SSL cert paths for the domain
   - `STORAGE`, `IMAGES`, `ROOMS` → filled only if missing (user values preserved)
4. Adds `/node/node_modules` to `.gitignore`
5. Rewrites domain tokens in all `node/*.md` docs
6. Updates `node/SOCKET-EVENTS.md` with current domain and port
7. Syncs any hardcoded port references in config files
8. Starts PM2 with `instances: 1`, `exec_mode: cluster`
9. Runs a Socket.IO handshake health check: `https://<domain>:<port>/socket.io/?EIO=4&transport=polling`

---

### `server supervisor <dir>`

Registers a **Laravel** project with **supervisord** for PHP queue workers.

```bash
server supervisor /home/practice/dashboard.practice.4hoste.com
```

**What it does:**
- Reads `artisan` + `composer.json` to confirm it's a Laravel project
- Writes a `[program:laravel-<user>-<slug>]` block to `/etc/supervisord.conf`
- Reloads supervisord
- Waits up to 10 seconds for `laravel-worker.log` to appear (confirms the worker started)

---

### `server auto [<type>] <dir>`

Automatically picks the first free port from the firewall range and deploys.

```bash
server next   auto /home/practice/provider.practice.4hoste.com
server nuxt   auto /home/practice/public_html
server socket auto /home/practice/dashboard.practice.4hoste.com
server auto   /home/practice/public_html   # type auto-detected
```

**Port selection logic:**
1. Reads all existing ports from `process.json`
2. Finds the highest app port in the `1024–29999` band
3. Scans sequentially from `highest + 1` for the first unbound port
4. Falls back to firewall-declared ranges (`firewall-cmd` → `iptables` → `ufw`) if no existing apps

---

### `server change [--domain <d>] [--port <p>] [<dir>]`

Changes the domain or port of a **live** deployment without a full redeploy.

```bash
# Change port (auto-detect app from CWD)
cd /home/practice/public_html
server change --port=4989

# Change socket domain + port (also rewrites .env and SOCKET-EVENTS.md)
server socket change --domain=dashboard.practice.4hoste.com --port=4995 \
  /home/practice/dashboard.practice.4hoste.com
```

**What it does:**
1. Looks up the PM2 entry in `process.json` by project directory
2. Updates `PORT` in the entry and rewrites `process.json` (sorted descending by port)
3. For **socket** type with `--domain`: re-runs `injectSocketEnvBlock` and `rewriteSocketEventsDoc`
4. Restarts the PM2 process (`pm2 restart` or `pm2 start`)
5. Runs `pm2 save`
6. Runs health check if domain is known

---

### `server restart [<dir|port|name>]`

Restarts a running app. Runs a health check after the restart.

```bash
server restart /home/practice/public_html   # by directory
server restart 4988                          # by port
server restart practice-nuxt-practice.4hoste.com   # by name
server restart all                           # restart everything
```

---

### `server logs [<name>] [--lines <n>]`

Tails PM2 logs. When called from a deployed project directory, the app name is auto-detected.

```bash
server logs                      # auto-detect from CWD
server logs practice-nuxt-practice.4hoste.com
server logs practice-nuxt-practice.4hoste.com --lines=100
```

---

### `server stop <name|port>`

Stops a PM2 process (keeps it in process.json).

```bash
server stop practice-nuxt-practice.4hoste.com
server stop 4988
```

---

### `server delete <name|port>`

Deletes a PM2 process and removes it from `process.json`.

```bash
server delete practice-nuxt-practice.4hoste.com
server delete 4988
```

---

### `server status` / `server list`

Lists all currently registered PM2 app names.

```bash
server list
server status
```

---

### `server doctor`

Checks the environment: Node.js, PM2, supervisord, whmapi1, process.json read/write, and whether running as root.

```bash
server doctor
```

---

### `server init [--yes]`

Creates or updates `~/.server-cli/config.json` with global defaults interactively.  
Use `--yes` to skip all prompts.

```bash
server init
server init --yes
```

---

### `server self-update`

Updates the CLI itself to the latest published version.

```bash
server self-update
server self-update --dry-run   # preview only
```

---

## Auto-detection

When you don't specify a type, the CLI detects it from the project files:

| Detection order | Files checked | Detected type |
|----------------|---------------|---------------|
| 1 | `.output/server/index.mjs` or `nuxt.config.*` | `nuxt` |
| 2 | `.next/` or `next.config.*` | `next` |
| 3 | `node/app.js` + `socket.io` in `node/package.json` | `socket` |
| 4 | `artisan` + `composer.json` | `supervisor` |

**User** is extracted from the path (`/home/<user>/...`), then `--user`, then `$USER`.

**Domain** is resolved in order:
1. `--domain` flag
2. cPanel userdata: `/var/cpanel/userdata/<user>/<domain>` where `documentroot` matches the project dir
3. Directory basename (if it looks like a domain)
4. `main_domain` from `/var/cpanel/userdata/<user>/main`
5. `server_name` from nginx `.conf` files

**PM2 name** pattern: `<user>-<type>-<domain>` (or `<user>-<type>` if no domain).  
Override with `--name` or `name:` in `server.yaml`.

---

## Config files

### Global config — `~/.server-cli/config.json`

Created by `server init`. Controls PM2 process file path, supervisord config, and health check tuning.

```json
{
  "processJsonPath": "/root/Scripts/process.json",
  "supervisordConfPath": "/etc/supervisord.conf",
  "defaultUser": "root",
  "healthcheck": {
    "retries": 3,
    "delayMs": 2000,
    "timeoutMs": 5000
  }
}
```

Override the config path with `--config=/path/to/config.json`.

### Per-project config — `server.yaml`

Place at the project root to set persistent defaults:

```yaml
name: practice-nuxt-main   # PM2 app name
type: nuxt                 # next | nuxt | socket | supervisor
port: 4988                 # default port
env:                       # extra env vars merged into PM2 entry
  NODE_ENV: production
```

**Precedence:** built-in defaults → `~/.server-cli/config.json` → `server.yaml` → CLI flags

---

## Global flags

| Flag | Short | Effect |
|------|-------|--------|
| `--dry-run` | | Print every action, execute nothing. `process.json` is not written. |
| `--verbose` | `-v` | Stream child process output (npm, pm2) directly to terminal |
| `--yes` | `-y` | Non-interactive mode — accept all defaults |
| `--no-healthcheck` | | Skip HTTP/socket health check after deploy |
| `--no-chown` | | Skip `chown -R user:user dir` step |
| `--user <u>` | | Override Linux user (auto-detected from path) |
| `--name <n>` | | Override PM2 app name |
| `--domain <d>` | | Override domain (used for health check and socket SSL paths) |
| `--config <path>` | | Use a custom global config JSON |

All flags accept both `--flag value` (space) and `--flag=value` (equals) syntax.

---

## process.json

The shared PM2 ecosystem file (default: `/root/Scripts/process.json`).

- Every deploy **upserts** the entry for the project (matched by `cwd`)
- After every write the file is **sorted by PORT descending**
- `--dry-run` never writes to this file

---

## Health check

After every deploy and restart, the CLI probes the app:

- **next / nuxt:** HTTP GET `http://<domain>/` — passes on 2xx or 3xx
- **socket:** Socket.IO handshake `https://<domain>:<port>/socket.io/?EIO=4&transport=polling` — passes when response body starts with `0`

Skip with `--no-healthcheck`. Tune retries/timeout in `~/.server-cli/config.json`.

---

## Exit codes

| Code | Meaning | Common fix |
|------|---------|------------|
| 0 | Success | — |
| 10 | Bad arguments | Check command syntax |
| 20 | Missing or empty directory | Ensure build artifacts exist |
| 30 | Port in use / no free port | Use `server stop <port>` or pick a different port |
| 40 | Unknown project type | Pass type explicitly: `server next ...` |
| 50 | Build failed | Check `npm run build` output with `--verbose` |
| 60 | PM2 or permission error | Ensure pm2 is installed; check file permissions |
| 70 | Supervisor failure | Check supervisord is installed and running |
| 80 | Health check failed | App started but not responding; check `server logs` |
| 90 | Deploy lock held | Another deploy is running for the same app |

---

## License

MIT
