import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { startServer, resolveStaticPath } from '../server/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

let dir;
let app;
let base;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents dashboard server '));
  const agentsFile = path.join(dir, 'agents.json');
  fs.writeFileSync(agentsFile, JSON.stringify([{
    id: 'echo',
    name: 'Echo',
    command: 'node',
    startArgs: [fixture('echo-agent.js'), '{sessionId}'],
    resumeArgs: [fixture('echo-agent.js'), '{sessionId}'],
    installHint: 'Install echo',
  }]));
  app = await startServer({
    port: 0,
    stateFile: path.join(dir, 'data', 'state.json'),
    agentsFile,
    pickFolder: async () => dir,
  });
  base = `http://127.0.0.1:${app.port}`;
});

after(async () => {
  await app.stop();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* still in use */ }
});

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: app.port, ...options }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function openSocket(origin) {
  const socket = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { origin });
  const messages = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  const next = (predicate, timeoutMs = 15000) => {
    const found = messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      waiters.push({ predicate, resolve });
      setTimeout(() => reject(new Error('Timed out waiting for a message')), timeoutMs);
    });
  };
  const send = (message) => socket.send(JSON.stringify(message));
  return { socket, messages, next, send };
}

test('resolveStaticPath maps URL paths to project folders and blocks escapes', () => {
  assert.equal(resolveStaticPath('/'), path.join(root, 'web', 'index.html'));
  assert.equal(resolveStaticPath('/app.js'), path.join(root, 'web', 'app.js'));
  assert.equal(resolveStaticPath('/shared/layout.js'), path.join(root, 'shared', 'layout.js'));
  assert.equal(resolveStaticPath('/vendor/xterm/lib/xterm.mjs'), path.join(root, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.mjs'));
  assert.equal(resolveStaticPath('/favicon.ico'), path.join(root, 'assets', 'icon.ico'));
  assert.equal(resolveStaticPath('/shared/../server/index.js'), null);
  assert.equal(resolveStaticPath('/..%2fpackage.json'), null);
  assert.equal(resolveStaticPath('/%E0%A4%A'), null);
});

test('health endpoint identifies the app', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.deepEqual(await response.json(), { ok: true, app: 'agents-dashboard' });
});

test('serves shared files with a JavaScript content type', async () => {
  const response = await fetch(`${base}/shared/layout.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/javascript/);
});

test('rejects requests with a foreign Host header', async () => {
  assert.equal(await request({ path: '/api/health', headers: { Host: 'evil.example.com' } }), 403);
});

test('hook endpoint requires the token', async () => {
  const status = await request({ path: '/api/hook', method: 'POST', headers: { 'Content-Type': 'application/json' } }, '{}');
  assert.equal(status, 401);
});

test('WebSocket rejects a foreign Origin', async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { origin: 'http://evil.example.com' });
  const outcome = await new Promise((resolve) => {
    socket.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    socket.on('error', () => resolve('error'));
    socket.on('open', () => resolve('open'));
  });
  assert.notEqual(outcome, 'open');
});

test('full flow: add project, start agent, receive output, get a hook notification', async () => {
  const client = openSocket(base);
  await new Promise((resolve) => client.socket.on('open', resolve));
  client.send({ type: 'hello' });
  await client.next((m) => m.type === 'state');

  client.send({ type: 'project:add' });
  await client.next((m) => m.type === 'state' && m.projects.length === 1);

  client.send({ type: 'panel:create', agentId: 'echo', cwd: dir });
  const created = await client.next((m) => m.type === 'state' && m.panels.length === 1);
  const panelId = created.panels[0].id;

  let output = '';
  await client.next((m) => {
    if (m.type === 'panel:data' && m.panelId === panelId) output += m.data;
    return /READY session=/.test(output);
  });

  const hookStatus = await request({
    path: '/api/hook',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dashboard-Token': app.token },
  }, JSON.stringify({ panelId, event: 'needs-input' }));
  assert.equal(hookStatus, 204);
  const notified = await client.next((m) => m.type === 'state' && m.unread === 1);
  assert.equal(notified.panels[0].attention, true);

  client.send({ type: 'panel:close', panelId });
  await client.next((m) => m.type === 'state' && m.panels.length === 0);
  client.socket.close();
});
