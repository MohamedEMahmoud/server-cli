import net from 'node:net';
import * as processJson from './process-json.js';
import type { GlobalConfig } from '../types.js';
import { ServerCliError } from '../utils/errors.js';
import { run } from '../utils/exec.js';

async function getFirewallRanges(): Promise<[number, number][]> {
  const ranges: [number, number][] = [];

  try {
    const out = await run('firewall-cmd', ['--list-ports'], {});
    for (const tok of out.split(/\s+/)) {
      const m = tok.match(/^(\d+)(?:-(\d+))?\/tcp$/i);
      if (m) ranges.push([Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])]);
    }
  } catch {}
  if (ranges.length) return ranges;

  try {
    const out = await run('iptables', ['-L', 'INPUT', '-n'], {});
    for (const line of out.split('\n')) {
      const m = line.match(/dpts?:(\d+)(?::(\d+))?/);
      if (m) ranges.push([Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])]);
    }
  } catch {}
  if (ranges.length) return ranges;

  try {
    const out = await run('ufw', ['status'], {});
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+)(?::(\d+))?\/tcp/);
      if (m) ranges.push([Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])]);
    }
  } catch {}

  return ranges;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findFreePort(config: GlobalConfig): Promise<number> {
  const doc = await processJson.read(config.processJsonPath);
  const used = new Set(
    doc.apps.map((a) => Number(a.env?.PORT)).filter((n) => Number.isFinite(n) && n > 0),
  );

  // Priority 1: scan sequentially above the highest existing app port in the
  // typical app-port band (1024–29999), keeping new ports near the existing cluster.
  const bandPorts = [...used].filter((p) => p >= 1024 && p < 30000).sort((a, b) => a - b);
  const bandStart = bandPorts.length ? (bandPorts[bandPorts.length - 1]! + 1) : 4000;
  for (let p = bandStart; p <= 29999; p++) {
    if (used.has(p)) continue;
    if (await isPortFree(p)) return p;
  }

  // Priority 2: firewall-declared ranges (firewall-cmd / iptables / ufw).
  const ranges = await getFirewallRanges();
  if (ranges.length) {
    // Prefer larger ranges and higher-start ranges (more likely to be app zones).
    const sorted = [...ranges].sort((a, b) => {
      const sizeA = a[1] - a[0];
      const sizeB = b[1] - b[0];
      if (sizeB !== sizeA) return sizeB - sizeA;
      return b[0] - a[0];
    });
    for (const [start, end] of sorted) {
      for (let p = Math.max(start, 1024); p <= end; p++) {
        if (used.has(p)) continue;
        if (await isPortFree(p)) return p;
      }
    }
  }

  throw new ServerCliError('no free port found', {
    code: 30,
    hint: 'pass a port explicitly (e.g. server next /dir 4000)',
  });
}
