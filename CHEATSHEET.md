# server-cli Cheat Sheet

> Every command shown twice: **short form** (minimum required args) and **full form** (all flags explicit).  
> Both `--flag value` and `--flag=value` are accepted everywhere.

---

## Install & Update

```bash
# Install
npm i -g @node-software-ts/server-cli

# Update to latest
server self-update
# = full form:
npm i -g @node-software-ts/server-cli@latest

# Version
server --version
server -V
```

---

## Deploy — Nuxt.js

```bash
# Short form  (type + dir + port)
server nuxt /home/practice/public_html 4988

# Full form  (= sign syntax)
server nuxt /home/practice/public_html 4988 \
  --domain=practice.4hoste.com \
  --name=practice-nuxt-main \
  --user=practice

# From inside the project directory
cd /home/practice/public_html
server nuxt 4988
server 4988        # type auto-detected from .output/server/index.mjs
server             # type + port auto-detected (needs server.yaml)
```

---

## Deploy — Next.js

```bash
# Short form
server next /home/practice/provider.practice.4hoste.com 4990

# Full form
server next /home/practice/provider.practice.4hoste.com 4990 \
  --domain=provider.practice.4hoste.com \
  --name=practice-next-provider \
  --user=practice

# From inside dir
cd /home/practice/provider.practice.4hoste.com
server next 4990
server 4990
```

---

## Deploy — Socket.IO

```bash
# Short form  (clones node/ from GitHub, injects .env, starts PM2)
server socket /home/practice/dashboard.practice.4hoste.com 4995

# Full form
server socket /home/practice/dashboard.practice.4hoste.com 4995 \
  --domain=dashboard.practice.4hoste.com \
  --name=practice-socket-dashboard \
  --user=practice

# Second socket project
server socket /home/practice/delegate.practice.4hoste.com 4996 \
  --domain=delegate.practice.4hoste.com
```

---

## Deploy — Supervisor (Laravel PHP workers)

```bash
# Short form  (detects artisan + composer.json)
server supervisor /home/practice/dashboard.practice.4hoste.com

# Full form
server supervisor /home/practice/dashboard.practice.4hoste.com \
  --user=practice \
  --domain=dashboard.practice.4hoste.com

# From inside dir
cd /home/practice/dashboard.practice.4hoste.com
server supervisor
```

---

## Auto Port — pick first free port automatically

```bash
# Short form  (type prefix + auto keyword + dir)
server next   auto /home/practice/provider.practice.4hoste.com
server nuxt   auto /home/practice/public_html
server socket auto /home/practice/dashboard.practice.4hoste.com

# Without type prefix  (type auto-detected from project files)
server auto /home/practice/public_html

# From inside dir
cd /home/practice/public_html
server nuxt auto
server auto
```

---

## Change — update domain or port without full redeploy

```bash
# Change port  (auto-detect app from CWD)
cd /home/practice/public_html
server change --port=4989
# = space form:
server change --port 4989

# Change port  (explicit dir)
server change --port=4989 /home/practice/public_html
# = with type prefix:
server nuxt change --port=4989 /home/practice/public_html

# Change domain  (nuxt/next — updates process.json + restarts)
server change --domain=practice.4hoste.com /home/practice/public_html

# Change domain + port  (socket — also rewrites .env & SOCKET-EVENTS.md)
server socket change \
  --domain=dashboard.practice.4hoste.com \
  --port=4995 \
  /home/practice/dashboard.practice.4hoste.com
# = from CWD:
cd /home/practice/dashboard.practice.4hoste.com
server socket change --domain=dashboard.practice.4hoste.com --port=4995

# All type prefixes supported
server nuxt   change --port=4989 /home/practice/public_html
server next   change --port=4991 /home/practice/provider.practice.4hoste.com
server socket change --domain=delegate.practice.4hoste.com --port=4996 \
  /home/practice/delegate.practice.4hoste.com
```

---

## Restart

```bash
# By directory
server restart /home/practice/public_html
server restart /home/practice/provider.practice.4hoste.com
server restart /home/practice/dashboard.practice.4hoste.com
server restart /home/practice/delegate.practice.4hoste.com

# By port
server restart 4988
server restart 4990
server restart 4995
server restart 4996

# By PM2 app name
server restart practice-nuxt-practice.4hoste.com
server restart practice-next-provider.practice.4hoste.com
server restart practice-socket-dashboard.practice.4hoste.com
server restart practice-socket-delegate.practice.4hoste.com

# Restart all
server restart all

# From inside dir
cd /home/practice/public_html && server restart
```

---

## Logs

```bash
# Auto-detect app from CWD  (no name needed)
cd /home/practice/public_html                   && server logs
cd /home/practice/provider.practice.4hoste.com  && server logs
cd /home/practice/dashboard.practice.4hoste.com && server logs
cd /home/practice/delegate.practice.4hoste.com  && server logs

# By name
server logs practice-nuxt-practice.4hoste.com
server logs practice-next-provider.practice.4hoste.com
server logs practice-socket-dashboard.practice.4hoste.com
server logs practice-socket-delegate.practice.4hoste.com

# With line count  (space or = form — both work)
server logs practice-nuxt-practice.4hoste.com --lines 50
server logs practice-nuxt-practice.4hoste.com --lines=50

# From CWD with line count
cd /home/practice/public_html && server logs --lines=100
```

---

## Status & Inspection

```bash
server list      # list all PM2 app names
server status    # alias for list
server doctor    # check pm2, node, npm, supervisord, process.json, permissions
```

---

## Stop

```bash
# By name
server stop practice-nuxt-practice.4hoste.com
server stop practice-next-provider.practice.4hoste.com
server stop practice-socket-dashboard.practice.4hoste.com
server stop practice-socket-delegate.practice.4hoste.com

# By port
server stop 4988
server stop 4990
server stop 4995
server stop 4996
```

---

## Delete (removes from PM2 + process.json)

```bash
# By name
server delete practice-nuxt-practice.4hoste.com
server delete practice-socket-dashboard.practice.4hoste.com

# By port
server delete 4988
server delete 4995
```

---

## Utility

```bash
# Create ~/.server-cli/config.json with defaults
server init
server init --yes           # skip all prompts, accept defaults
server init --yes -v        # = verbose form

# Self-update CLI to latest version
server self-update
server self-update --dry-run   # preview only, nothing executed

# Help
server --help
server -h
```

---

## Global Flags — both forms always work

| Short form | `=` sign form | Effect |
|-----------|---------------|--------|
| `--dry-run` | `--dry-run` | Print what would run, execute nothing |
| `--verbose` | `--verbose` | Show full output from child processes |
| `-v` | `-v` | Alias for `--verbose` |
| `--yes` | `--yes` | Accept all prompts non-interactively |
| `-y` | `-y` | Alias for `--yes` |
| `--no-healthcheck` | `--no-healthcheck` | Skip HTTP/socket health check |
| `--no-chown` | `--no-chown` | Skip `chown -R user:user dir` |
| `--user practice` | `--user=practice` | Override detected Linux user |
| `--name my-app` | `--name=my-app` | Override auto-generated PM2 name |
| `--domain foo.com` | `--domain=foo.com` | Override auto-detected domain |
| `--config /path` | `--config=/root/.server-cli/config.json` | Custom config file |

```bash
# Dry run — safe preview, writes nothing
server nuxt /home/practice/public_html 4988 --dry-run

# Verbose — full npm + pm2 output
server next /home/practice/provider.practice.4hoste.com 4990 -v

# Skip health check  (useful when firewall blocks direct port access)
server socket /home/practice/dashboard.practice.4hoste.com 4995 --no-healthcheck

# All flags together
server nuxt /home/practice/public_html 4988 \
  --domain=practice.4hoste.com \
  --name=practice-main \
  --user=practice \
  --no-healthcheck \
  --verbose
```

---

## server.yaml — per-project defaults (optional)

Place `server.yaml` at the project root to avoid passing args every time.

```yaml
# /home/practice/public_html/server.yaml
name: practice-nuxt-main
type: nuxt
port: 4988
```

```yaml
# /home/practice/provider.practice.4hoste.com/server.yaml
name: practice-next-provider
type: next
port: 4990
```

```yaml
# /home/practice/dashboard.practice.4hoste.com/server.yaml
name: practice-socket-dashboard
type: socket
port: 4995
```

With `server.yaml` in place you can just run:

```bash
server /home/practice/public_html
cd /home/practice/public_html && server
```

---

## Auto-generated PM2 App Names

Pattern: **`<user>-<type>-<domain>`**

| Project dir | Type | Auto name |
|-------------|------|-----------|
| `/home/practice/public_html` | nuxt | `practice-nuxt-practice.4hoste.com` |
| `/home/practice/provider.practice.4hoste.com` | next | `practice-next-provider.practice.4hoste.com` |
| `/home/practice/dashboard.practice.4hoste.com` | socket | `practice-socket-dashboard.practice.4hoste.com` |
| `/home/practice/delegate.practice.4hoste.com` | socket | `practice-socket-delegate.practice.4hoste.com` |
| `/home/practice/dashboard.practice.4hoste.com` | supervisor | `laravel-practice-dashboard-practice-4hoste-com` |
| `/home/practice/delegate.practice.4hoste.com` | supervisor | `laravel-practice-delegate-practice-4hoste-com` |

Override with `--name=custom-name` or `name:` in `server.yaml`.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 10 | Bad arguments |
| 20 | Missing or empty directory |
| 30 | Port in use / no free port found |
| 40 | Unknown project type |
| 50 | Build failed |
| 60 | PM2 or permission error |
| 70 | Supervisor failure |
| 80 | Health check failed |
| 90 | Deploy lock held |
