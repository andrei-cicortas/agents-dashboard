import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentManager } from '../server/agent-manager.js';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents dashboard manager '));

const agents = [
  {
    id: 'echo',
    name: 'Echo',
    command: 'node',
    startArgs: [fixture('echo-agent.js'), '{sessionId}'],
    resumeArgs: [fixture('exit-agent.js'), '3'],
    installHint: 'Install echo',
  },
  {
    id: 'missing',
    name: 'Missing',
    command: 'definitely-not-installed-xyz',
    startArgs: [],
    resumeArgs: [],
    installHint: 'Install missing',
  },
];

const managers = [];
function makeManager(overrides = {}) {
  const manager = createAgentManager({ agents, ...overrides });
  managers.push(manager);
  return manager;
}

after(() => {
  managers.forEach((manager) => manager.stopAll());
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* still in use */ }
});

function waitFor(manager, event, predicate = () => true, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    manager.on(event, (payload) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        resolve(payload);
      }
    });
  });
}

function waitForOutput(manager, panelId, pattern, timeoutMs = 15000) {
  let text = '';
  return waitFor(manager, 'data', (payload) => {
    if (payload.panelId !== panelId) return false;
    text += payload.data;
    return pattern.test(text);
  }, timeoutMs);
}

function recordStatuses(manager) {
  const statuses = [];
  manager.on('status', (payload) => statuses.push(payload));
  return statuses;
}

const fakeTerm = () => ({ pid: 1, onData() {}, onExit() {}, write() {}, resize() {}, kill() {} });

test('reports not-installed without spawning', () => {
  const manager = makeManager({ spawn: () => assert.fail('must not spawn') });
  const statuses = recordStatuses(manager);
  manager.start({ panelId: 'p1', agentId: 'missing', cwd: workDir, sessionId: 's', mode: 'start' });
  assert.deepEqual(statuses, [{ panelId: 'p1', status: 'not-installed', message: 'Install missing' }]);
  assert.equal(manager.isRunning('p1'), false);
});

test('reports a missing folder without spawning', () => {
  const manager = makeManager({ spawn: () => assert.fail('must not spawn') });
  const statuses = recordStatuses(manager);
  const cwd = path.join(workDir, 'does not exist');
  manager.start({ panelId: 'p2', agentId: 'echo', cwd, sessionId: 's', mode: 'start' });
  assert.deepEqual(statuses, [{ panelId: 'p2', status: 'folder-missing', message: `Folder not found: ${cwd}` }]);
});

test('runs an agent, streams output, tracks the title, accepts input, and reports exit', async () => {
  const manager = makeManager();
  const statuses = recordStatuses(manager);
  const ready = waitForOutput(manager, 'p3', /READY session=session-1 panel=p3/);
  const title = waitFor(manager, 'title', (p) => p.panelId === 'p3');

  manager.start({ panelId: 'p3', agentId: 'echo', cwd: workDir, sessionId: 'session-1', mode: 'start' });
  await ready;
  assert.deepEqual(await title, { panelId: 'p3', title: 'Fake agent title' });
  assert.deepEqual(statuses.slice(0, 2).map((s) => s.status), ['starting', 'running']);
  assert.equal(manager.isRunning('p3'), true);

  const echoed = waitForOutput(manager, 'p3', /ECHO:hello/);
  manager.write('p3', 'hello\r');
  await echoed;
  assert.match(manager.readScrollback('p3'), /READY session=session-1/);

  const exited = waitFor(manager, 'status', (p) => p.panelId === 'p3' && p.status === 'exited');
  manager.write('p3', 'quit\r');
  assert.deepEqual(await exited, { panelId: 'p3', status: 'exited', message: 'Exited with code 0' });
  assert.equal(manager.isRunning('p3'), false);
});

test('falls back to a fresh session when a resume exits quickly', async () => {
  const manager = makeManager({ newSessionId: () => 'fresh-1' });
  const session = waitFor(manager, 'session', (p) => p.panelId === 'p4');
  const ready = waitForOutput(manager, 'p4', /READY session=fresh-1/);

  manager.start({ panelId: 'p4', agentId: 'echo', cwd: workDir, sessionId: 'old', mode: 'resume' });
  assert.deepEqual(await session, { panelId: 'p4', sessionId: 'fresh-1' });
  await ready;
  manager.stop('p4');
});

test('stop kills a running agent without reporting exit', async () => {
  const manager = makeManager();
  const ready = waitForOutput(manager, 'p5', /READY/);
  manager.start({ panelId: 'p5', agentId: 'echo', cwd: workDir, sessionId: 's5', mode: 'start' });
  await ready;

  const statuses = recordStatuses(manager);
  manager.stop('p5');
  assert.equal(manager.isRunning('p5'), false);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.deepEqual(statuses.filter((s) => s.panelId === 'p5'), []);
});

test('resize is remembered for the next start and env carries the panel id', () => {
  let captured;
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    env: { EXTRA: '1' },
    spawn: (file, commandLine, options) => {
      captured = { file, commandLine, options };
      return fakeTerm();
    },
  });
  manager.resize('p6', 100, 40);
  manager.start({ panelId: 'p6', agentId: 'echo', cwd: workDir, sessionId: 's6', mode: 'start' });
  assert.equal(captured.file, 'cmd.exe');
  assert.match(captured.commandLine, /^\/d \/s \/c "node /);
  assert.equal(captured.options.cols, 100);
  assert.equal(captured.options.rows, 40);
  assert.equal(captured.options.cwd, workDir);
  assert.equal(captured.options.env.AGENTS_DASHBOARD_PANEL_ID, 'p6');
  assert.equal(captured.options.env.EXTRA, '1');
});
