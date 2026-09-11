import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { eventFromArgs } from '../server/hook-client.js';

const hookClientPath = fileURLToPath(new URL('../server/hook-client.js', import.meta.url));

test('eventFromArgs understands Claude Code and Codex arguments', () => {
  assert.equal(eventFromArgs(['claude', 'finished']), 'finished');
  assert.equal(eventFromArgs(['claude', 'needs-input']), 'needs-input');
  assert.equal(eventFromArgs(['claude', 'other']), null);
  assert.equal(eventFromArgs(['codex', '{"type":"agent-turn-complete","turn-id":"1"}']), 'finished');
  assert.equal(eventFromArgs(['codex', '{"type":"something-else"}']), null);
  assert.equal(eventFromArgs(['codex', 'not json']), null);
  assert.equal(eventFromArgs([]), null);
});

function runHookClient(args, env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [hookClientPath, ...args], { env: { ...process.env, ...env }, timeout: 10000 }, (error) => {
      resolve(error ? error.code ?? 1 : 0);
    });
  });
}

test('the script posts the event with the token to the server', async () => {
  let received;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received = { url: req.url, method: req.method, token: req.headers['x-dashboard-token'], body: JSON.parse(body) };
      res.writeHead(204).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const code = await runHookClient(['claude', 'needs-input'], {
    AGENTS_DASHBOARD_PORT: String(port),
    AGENTS_DASHBOARD_TOKEN: 'secret-token',
    AGENTS_DASHBOARD_PANEL_ID: 'p1',
  });
  server.close();

  assert.equal(code, 0);
  assert.deepEqual(received, {
    url: '/api/hook',
    method: 'POST',
    token: 'secret-token',
    body: { panelId: 'p1', event: 'needs-input' },
  });
});

test('the script exits 0 quickly when the server is not running', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));

  const startedAt = Date.now();
  const code = await runHookClient(['claude', 'finished'], {
    AGENTS_DASHBOARD_PORT: String(port),
    AGENTS_DASHBOARD_TOKEN: 'secret-token',
    AGENTS_DASHBOARD_PANEL_ID: 'p1',
  });
  assert.equal(code, 0);
  assert.ok(Date.now() - startedAt < 5000);
});
