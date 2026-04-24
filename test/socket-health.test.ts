import * as http from 'node:http';
import { afterEach, describe, expect, test } from 'vitest';
import { socketHealthCheck } from '../src/core/domain.js';

const CFG = { retries: 1, delayMs: 10, timeoutMs: 2000 };

let server: http.Server | undefined;

afterEach(
  () =>
    new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
      server = undefined;
    }),
);

function listen(handler: http.RequestListener): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => {
      server = s;
      const addr = s.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
    });
  });
}

describe('socketHealthCheck', () => {
  test('passes when server returns a Socket.IO OPEN packet', async () => {
    const port = await listen((req, res) => {
      if (req.url?.startsWith('/socket.io/')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('0{"sid":"abc","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
      } else {
        res.writeHead(404).end();
      }
    });
    await expect(socketHealthCheck('127.0.0.1', port, CFG)).resolves.toBeUndefined();
  });

  test('fails when body is not a Socket.IO OPEN packet', async () => {
    const port = await listen((_req, res) => {
      res.writeHead(200).end('hello world');
    });
    await expect(socketHealthCheck('127.0.0.1', port, CFG)).rejects.toMatchObject({
      name: 'ServerCliError',
      code: 80,
    });
  });

  test('fails when nothing is listening on the port', async () => {
    // Pick a high random port unlikely to be listening.
    await expect(socketHealthCheck('127.0.0.1', 1, CFG)).rejects.toMatchObject({
      name: 'ServerCliError',
      code: 80,
    });
  });
});
