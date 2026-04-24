import * as http from 'node:http';
import * as https from 'node:https';
import type { GlobalConfig } from '../types.js';
import { ServerCliError } from '../utils/errors.js';

export async function healthCheck(url: string, cfg: GlobalConfig['healthcheck']): Promise<void> {
  const attempts = cfg.retries + 1;
  let lastNote = 'no response';
  for (let i = 0; i < attempts; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
      lastNote = `HTTP ${res.status}`;
      if (res.status >= 200 && res.status < 400) return;
    } catch (e) {
      lastNote = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(t);
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, cfg.delayMs));
  }
  throw new ServerCliError(`health check failed: ${url} — ${lastNote} (${attempts} attempts)`, {
    code: 80,
    hint: 'try --no-healthcheck, or increase healthcheck.retries/delayMs in ~/.server-cli/config.json',
  });
}

interface ProbeResult {
  status: number;
  body: string;
}

function probe(url: URL, timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : http;
    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      timeout: timeoutMs,
    };
    if (isHttps) {
      (options as https.RequestOptions).rejectUnauthorized = false;
    }
    const req = mod.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer | string) => {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8').slice(0, 256),
        });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.end();
  });
}

/**
 * Health-check a Socket.IO v4 server by hitting the long-polling handshake
 * endpoint and asserting the response is an OPEN packet (status 200, body
 * starts with "0"). Tries HTTPS first (with rejectUnauthorized disabled to
 * tolerate cPanel combined certs), then HTTP.
 */
export async function socketHealthCheck(
  domain: string,
  port: number,
  cfg: GlobalConfig['healthcheck'],
  name?: string,
): Promise<void> {
  const attempts = cfg.retries + 1;
  const candidates = [
    new URL(`https://${domain}:${port}/socket.io/?EIO=4&transport=polling`),
    new URL(`http://${domain}:${port}/socket.io/?EIO=4&transport=polling`),
  ];
  let lastNote = 'no response';
  for (let i = 0; i < attempts; i++) {
    for (const url of candidates) {
      try {
        const { status, body } = await probe(url, cfg.timeoutMs);
        lastNote = `${url.protocol}//… ${status} ${body.slice(0, 40)}`;
        if (status === 200 && body.startsWith('0')) return;
      } catch (e) {
        lastNote = `${url.protocol}//… ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, cfg.delayMs));
  }
  throw new ServerCliError(
    `socket health check failed: ${domain}:${port} — ${lastNote} (${attempts} attempts)`,
    {
      code: 80,
      hint: `check pm2 logs ${name ?? '<name>'} for the socket app; ensure it binds to port ${port}`,
    },
  );
}
