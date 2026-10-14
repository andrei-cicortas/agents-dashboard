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
  {
    id: 'discovering',
    name: 'Names its own session',
    command: 'node',
    startArgs: [fixture('echo-agent.js'), 'x'],
    resumeArgs: [fixture('echo-agent.js'), '{sessionId}'],
    installHint: 'Install it',
    // Like Codex: it picks its own session, so the id is read back afterwards.
    sessionSource: 'codex',
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
  assert.deepEqual(await session, { panelId: 'p4', sessionId: 'fresh-1', reason: 'restarted' });
  await ready;
  manager.stop('p4');
});

test('reports exited when the fresh start after a quick resume exit throws', () => {
  let exitHandler;
  let spawns = 0;
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    newSessionId: () => 'fresh-2',
    spawn: () => {
      spawns += 1;
      if (spawns > 1) throw new Error('spawn failed');
      return { ...fakeTerm(), onExit(handler) { exitHandler = handler; } };
    },
  });
  const statuses = recordStatuses(manager);
  manager.start({ panelId: 'p7', agentId: 'echo', cwd: workDir, sessionId: 'old', mode: 'resume' });
  assert.doesNotThrow(() => exitHandler({ exitCode: 1 }));
  assert.equal(spawns, 2);
  assert.deepEqual(statuses.at(-1), { panelId: 'p7', status: 'exited', message: 'spawn failed' });
  assert.equal(manager.isRunning('p7'), false);
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

test('a resume that dies is retried however long it took to die', () => {
  // The old rule gave a resume five seconds to fail in. On a slow start the
  // agent spent longer than that printing its notices before giving up, so the
  // panel was left dead instead of being started fresh.
  let exitHandler;
  const spawned = [];
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    newSessionId: () => 'fresh-3',
    now: () => 0,
    spawn: (file, commandLine) => {
      spawned.push(String(commandLine));
      return { ...fakeTerm(), onExit(handler) { exitHandler = handler; } };
    },
  });
  manager.start({ panelId: 'p20', agentId: 'echo', cwd: workDir, sessionId: 'old', mode: 'resume' });
  exitHandler({ exitCode: 1 });
  assert.equal(spawned.length, 2, 'the panel should have been started again');
  assert.match(spawned[1], /fresh-3/);
});

test('an agent that was typed into and then exits is left alone', () => {
  // Quitting an agent you were using is a thing you meant to do; starting it
  // again behind your back would be wrong.
  let exitHandler;
  const spawned = [];
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    spawn: (file, commandLine) => {
      spawned.push(String(commandLine));
      return { ...fakeTerm(), onExit(handler) { exitHandler = handler; } };
    },
  });
  const statuses = recordStatuses(manager);
  manager.start({ panelId: 'p21', agentId: 'echo', cwd: workDir, sessionId: 'old', mode: 'resume' });
  manager.write('p21', '/exit\r');
  exitHandler({ exitCode: 0 });
  assert.equal(spawned.length, 1, 'it should not have been started again');
  assert.equal(statuses.at(-1).status, 'exited');
});

test('a Codex panel learns which conversation it opened, so it can resume its own', async () => {
  // Codex names its own session and will only resume "the most recent one in
  // this folder", which is the same one for every panel. The id is read back
  // from what Codex wrote instead.
  let announced = null;
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    findSessionId: () => 'codex-abc',
    discoverEveryMs: 5,
    spawn: () => fakeTerm(),
  });
  const session = waitFor(manager, 'session', (p) => p.panelId === 'p30');
  manager.start({ panelId: 'p30', agentId: 'discovering', cwd: workDir, sessionId: null, mode: 'start' });
  announced = await session;
  assert.deepEqual(announced, { panelId: 'p30', sessionId: 'codex-abc', reason: 'discovered' });
  manager.stop('p30');
});

test('an agent that names its own session is not asked about for other kinds', async () => {
  let asked = 0;
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    findSessionId: () => { asked += 1; return 'nope'; },
    discoverEveryMs: 5,
    spawn: () => fakeTerm(),
  });
  manager.start({ panelId: 'p31', agentId: 'echo', cwd: workDir, sessionId: 's', mode: 'start' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(asked, 0, 'only an agent configured that way should be looked up');
  manager.stop('p31');
});

test('two Codex panels in one folder do not claim the same conversation', async () => {
  const handed = ['codex-1', 'codex-2'];
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    findSessionId: ({ taken }) => handed.find((id) => !taken.has(id)) ?? null,
    discoverEveryMs: 5,
    spawn: () => fakeTerm(),
  });
  const first = waitFor(manager, 'session', (p) => p.panelId === 'p32');
  manager.start({ panelId: 'p32', agentId: 'discovering', cwd: workDir, sessionId: null, mode: 'start' });
  const one = await first;
  const second = waitFor(manager, 'session', (p) => p.panelId === 'p33');
  manager.start({ panelId: 'p33', agentId: 'discovering', cwd: workDir, sessionId: null, mode: 'start' });
  const two = await second;
  assert.notEqual(one.sessionId, two.sessionId);
  manager.stop('p32');
  manager.stop('p33');
});

test('a failed resume of an agent that names its own session starts it without an invented one', () => {
  let exitHandler;
  const spawned = [];
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    newSessionId: () => 'invented',
    // Codex still has the conversation, so it is resumed, and fails anyway.
    hasSession: () => true,
    spawn: (file, commandLine) => {
      spawned.push(commandLine);
      return { ...fakeTerm(), onExit(handler) { exitHandler = handler; } };
    },
  });
  const seen = [];
  manager.on('session', (payload) => seen.push(payload));
  manager.start({ panelId: 'p35', agentId: 'discovering', cwd: workDir, sessionId: 'gone', mode: 'resume' });
  exitHandler({ exitCode: 1 });
  assert.deepEqual(seen.at(-1), { panelId: 'p35', sessionId: null, reason: 'restarted' });
  assert.doesNotMatch(spawned.at(-1), /invented/);
  manager.stop('p35');
});

test('an agent that names its own session is not asked to resume one it no longer has', () => {
  const spawned = [];
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    hasSession: ({ id }) => id !== 'gone',
    spawn: (file, commandLine) => {
      spawned.push(commandLine);
      return fakeTerm();
    },
  });
  const seen = [];
  manager.on('session', (payload) => seen.push(payload));
  manager.start({ panelId: 'p36', agentId: 'discovering', cwd: workDir, sessionId: 'gone', mode: 'resume' });
  assert.deepEqual(seen, [{ panelId: 'p36', sessionId: null, reason: 'restarted' }]);
  // Its start arguments, not the resume ones that name the session.
  assert.match(spawned[0], /echo-agent\.js"? x"?$/);
  manager.start({ panelId: 'p37', agentId: 'discovering', cwd: workDir, sessionId: 'kept', mode: 'resume' });
  assert.match(spawned[1], /echo-agent\.js"? kept"?$/);
  manager.stop('p36');
  manager.stop('p37');
});

test('a resume that failed says so, so the panel knows its conversation is gone', () => {
  let exitHandler;
  const manager = makeManager({
    exists: () => true,
    kill: () => {},
    newSessionId: () => 'fresh-9',
    spawn: () => ({ ...fakeTerm(), onExit(handler) { exitHandler = handler; } }),
  });
  const seen = [];
  manager.on('session', (payload) => seen.push(payload));
  manager.start({ panelId: 'p34', agentId: 'echo', cwd: workDir, sessionId: 'old', mode: 'resume' });
  exitHandler({ exitCode: 1 });
  assert.deepEqual(seen.at(-1), { panelId: 'p34', sessionId: 'fresh-9', reason: 'restarted' });
});
