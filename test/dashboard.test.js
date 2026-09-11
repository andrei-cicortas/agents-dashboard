import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDashboard } from '../server/dashboard.js';
import { emptyState } from '../server/store.js';

const agents = [
  { id: 'claude', name: 'Claude Code', command: 'claude', startArgs: [], resumeArgs: [], installHint: 'h' },
  { id: 'codex', name: 'Codex', command: 'codex', startArgs: [], resumeArgs: [], installHint: 'h' },
];
const GAME = 'C:\\Games\\my game';

function fakeAgentManager() {
  const emitter = new EventEmitter();
  const calls = [];
  return {
    calls,
    emit: (event, payload) => emitter.emit(event, payload),
    on: (event, handler) => { emitter.on(event, handler); },
    start: (options) => calls.push(['start', options]),
    write: (panelId, data) => calls.push(['write', panelId, data]),
    resize: (panelId, cols, rows) => calls.push(['resize', panelId, cols, rows]),
    stop: (panelId) => calls.push(['stop', panelId]),
    stopAll: () => calls.push(['stopAll']),
    forget: (panelId) => calls.push(['forget', panelId]),
    readScrollback: (panelId) => `scrollback of ${panelId}`,
  };
}

function memoryStore(initial) {
  let saved = structuredClone(initial);
  return {
    load: () => structuredClone(saved),
    save: (state) => { saved = structuredClone(state); },
    get saved() { return saved; },
  };
}

function setup({ initial = emptyState(), picked = null, pickFolder = async () => picked } = {}) {
  const store = memoryStore(initial);
  const manager = fakeAgentManager();
  const sent = [];
  let ids = 0;
  let sessions = 0;
  const dashboard = createDashboard({
    store,
    agentManager: manager,
    agents,
    pickFolder,
    broadcast: (message) => sent.push(message),
    requestStop: () => sent.push({ type: 'stop-requested' }),
    now: () => new Date('2026-09-11T10:00:00.000Z'),
    newId: () => `id${++ids}`,
    newSessionId: () => `session${++sessions}`,
  });
  const lastState = () => sent.filter((m) => m.type === 'state').at(-1);
  const send = (message, clientId = 'window1') => dashboard.handleMessage(message, () => {}, clientId);
  return { dashboard, store, manager, sent, lastState, send };
}

const savedPanel = { id: 'p1', agentId: 'claude', cwd: GAME, sessionId: 's1', title: 'Old title' };
const withPanel = () => ({ projects: [{ path: GAME, name: 'my game', pinned: false }], panels: [savedPanel], notifications: [] });

test('start restores saved panels and resumes them', () => {
  const { dashboard, manager, lastState } = setup({ initial: withPanel() });
  dashboard.start();
  assert.deepEqual(manager.calls, [['start', { panelId: 'p1', agentId: 'claude', cwd: GAME, sessionId: 's1', mode: 'resume' }]]);
  const panel = lastState().panels[0];
  assert.equal(panel.status, 'starting');
  assert.equal(panel.agentName, 'Claude Code');
  assert.equal(panel.attention, false);
  assert.deepEqual(lastState().agents, [{ id: 'claude', name: 'Claude Code' }, { id: 'codex', name: 'Codex' }]);
});

test('hello replies with the state and each panel scrollback', async () => {
  const { dashboard } = setup({ initial: withPanel() });
  dashboard.start();
  const replies = [];
  await dashboard.handleMessage({ type: 'hello' }, (message) => replies.push(message));
  assert.equal(replies[0].type, 'state');
  assert.deepEqual(replies[1], { type: 'panel:replay', panelId: 'p1', data: 'scrollback of p1' });
});

test('project:add adds the picked folder once', async () => {
  const { dashboard, store, send } = setup({ picked: GAME });
  dashboard.start();
  await send({ type: 'project:add' });
  await send({ type: 'project:add' });
  assert.deepEqual(store.saved.projects, [{ path: GAME, name: 'my game', pinned: false }]);
});

test('project:add does nothing when the picker is cancelled', async () => {
  const { dashboard, store, send } = setup({ picked: null });
  dashboard.start();
  await send({ type: 'project:add' });
  assert.deepEqual(store.saved.projects, []);
});

test('project:add ignores a repeated click while the picker is still open', async () => {
  const calls = [];
  let resolvePick;
  const pickFolder = () => new Promise((resolve) => {
    calls.push('call');
    resolvePick = resolve;
  });
  const { dashboard, store, send } = setup({ pickFolder });
  dashboard.start();
  const first = send({ type: 'project:add' });
  send({ type: 'project:add' });
  assert.equal(calls.length, 1);
  resolvePick(GAME);
  await first;
  assert.deepEqual(store.saved.projects, [{ path: GAME, name: 'my game', pinned: false }]);
});

test('project:add calls the picker again once it has resolved', async () => {
  const calls = [];
  let resolvePick;
  const pickFolder = () => new Promise((resolve) => {
    calls.push('call');
    resolvePick = resolve;
  });
  const { dashboard, send } = setup({ pickFolder });
  dashboard.start();
  const first = send({ type: 'project:add' });
  resolvePick(null);
  await first;
  send({ type: 'project:add' });
  assert.equal(calls.length, 2);
});

test('project:add resets the in-progress flag when the picker rejects', async () => {
  const calls = [];
  const pickFolder = () => {
    calls.push('call');
    return Promise.reject(new Error('boom'));
  };
  const { dashboard, send } = setup({ pickFolder });
  dashboard.start();
  await assert.rejects(send({ type: 'project:add' }));
  await assert.rejects(send({ type: 'project:add' }));
  assert.equal(calls.length, 2);
});

test('project:pin toggles pinned and project:remove is blocked while a panel uses the folder', async () => {
  const { dashboard, store, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'project:pin', path: 'c:\\games\\MY GAME', pinned: true });
  assert.equal(store.saved.projects[0].pinned, true);
  await send({ type: 'project:remove', path: GAME });
  assert.equal(store.saved.projects.length, 1);
  await send({ type: 'panel:close', panelId: 'p1' });
  await send({ type: 'project:remove', path: GAME });
  assert.deepEqual(store.saved.projects, []);
});

test('panel:create starts a fresh agent and saves only persistent fields', async () => {
  const { dashboard, store, manager, send } = setup();
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'codex', cwd: GAME });
  assert.deepEqual(manager.calls.at(-1), ['start', { panelId: 'id1', agentId: 'codex', cwd: GAME, sessionId: 'session1', mode: 'start' }]);
  assert.deepEqual(store.saved.panels, [{ id: 'id1', agentId: 'codex', cwd: GAME, sessionId: 'session1', title: null }]);
});

test('panel:create ignores an unknown agent', async () => {
  const { dashboard, store, manager, send } = setup();
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'gemini', cwd: GAME });
  assert.deepEqual(store.saved.panels, []);
  assert.deepEqual(manager.calls, []);
});

test('agent events update panels, forward data, and save titles and sessions', () => {
  const { dashboard, store, manager, sent, lastState } = setup({ initial: withPanel() });
  dashboard.start();
  manager.emit('status', { panelId: 'p1', status: 'running', message: null });
  assert.equal(lastState().panels[0].status, 'running');
  manager.emit('data', { panelId: 'p1', data: 'hello' });
  assert.deepEqual(sent.at(-1), { type: 'panel:data', panelId: 'p1', data: 'hello' });
  manager.emit('title', { panelId: 'p1', title: 'Add double jump' });
  assert.equal(store.saved.panels[0].title, 'Add double jump');
  manager.emit('session', { panelId: 'p1', sessionId: 'fresh' });
  assert.equal(store.saved.panels[0].sessionId, 'fresh');
});

test('panel:input writes to the agent and panel:resize resizes it', async () => {
  const { dashboard, manager, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'panel:input', panelId: 'p1', data: 'hi\r' });
  await send({ type: 'panel:resize', panelId: 'p1', cols: 90, rows: 20 });
  await send({ type: 'panel:resize', panelId: 'p1', cols: 'x', rows: 20 });
  assert.deepEqual(manager.calls.slice(1), [['write', 'p1', 'hi\r'], ['resize', 'p1', 90, 20]]);
});

test('a needs-input hook sets attention and adds an unread notification; typing clears attention', async () => {
  const { dashboard, store, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  assert.equal(dashboard.handleHook({ panelId: 'p1', event: 'needs-input' }), true);
  assert.equal(lastState().panels[0].attention, true);
  assert.equal(lastState().unread, 1);
  assert.deepEqual(store.saved.notifications, [
    { id: 'id1', panelId: 'p1', event: 'needs-input', at: '2026-09-11T10:00:00.000Z', read: false },
  ]);
  await send({ type: 'panel:input', panelId: 'p1', data: 'y' });
  assert.equal(lastState().panels[0].attention, false);
});

test('a lone terminal focus-report does not clear attention, but is still forwarded to the agent', async () => {
  const { dashboard, manager, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  assert.equal(dashboard.handleHook({ panelId: 'p1', event: 'needs-input' }), true);
  await send({ type: 'panel:input', panelId: 'p1', data: '\x1b[O' });
  assert.equal(lastState().panels[0].attention, true);
  assert.deepEqual(manager.calls.at(-1), ['write', 'p1', '\x1b[O']);
});

test('concatenated focus-report sequences do not clear attention either', async () => {
  const { dashboard, manager, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  assert.equal(dashboard.handleHook({ panelId: 'p1', event: 'needs-input' }), true);
  await send({ type: 'panel:input', panelId: 'p1', data: '\x1b[I\x1b[O' });
  assert.equal(lastState().panels[0].attention, true);
  assert.deepEqual(manager.calls.at(-1), ['write', 'p1', '\x1b[I\x1b[O']);
});

test('a real keystroke after a focus-report still clears attention', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  assert.equal(dashboard.handleHook({ panelId: 'p1', event: 'needs-input' }), true);
  await send({ type: 'panel:input', panelId: 'p1', data: '\x1b[O' });
  assert.equal(lastState().panels[0].attention, true);
  await send({ type: 'panel:input', panelId: 'p1', data: 'y' });
  assert.equal(lastState().panels[0].attention, false);
});

test('a hook for the focused panel is added already read', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'panel:focus', panelId: 'p1' });
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().unread, 0);
  assert.equal(lastState().notifications[0].read, true);
});

test('a hook is unread once the client that focused the panel disconnects', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'panel:focus', panelId: 'p1' }, 'window1');
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, true);
  dashboard.disconnect('window1');
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, false);
  assert.equal(lastState().unread, 1);
});

test('panel:focus with a null panelId clears the focus', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'panel:focus', panelId: 'p1' });
  await send({ type: 'panel:focus', panelId: null });
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, false);
});

test('focus is tracked per client', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'panel:focus', panelId: 'p1' }, 'window1');
  await send({ type: 'panel:focus', panelId: null }, 'window2');
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, true);
  dashboard.disconnect('window1');
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, false);
});
test('handleHook rejects unknown panels and events', () => {
  const { dashboard } = setup({ initial: withPanel() });
  dashboard.start();
  assert.equal(dashboard.handleHook({ panelId: 'nope', event: 'finished' }), false);
  assert.equal(dashboard.handleHook({ panelId: 'p1', event: 'exploded' }), false);
});

test('notifications:read marks one or all as read', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  await send({ type: 'notifications:read', id: 'id1' });
  assert.equal(lastState().unread, 1);
  await send({ type: 'notifications:read', all: true });
  assert.equal(lastState().unread, 0);
});

test('panel:close forgets the agent and removes its notifications', async () => {
  const { dashboard, store, manager, send } = setup({ initial: withPanel() });
  dashboard.start();
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  await send({ type: 'panel:close', panelId: 'p1' });
  assert.deepEqual(manager.calls.at(-1), ['forget', 'p1']);
  assert.deepEqual(store.saved.panels, []);
  assert.deepEqual(store.saved.notifications, []);
});

test('panel:restart starts the agent fresh with a new session', async () => {
  const { dashboard, store, manager, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'panel:restart', panelId: 'p1' });
  assert.deepEqual(manager.calls.at(-1), ['start', { panelId: 'p1', agentId: 'claude', cwd: GAME, sessionId: 'session1', mode: 'start' }]);
  assert.equal(store.saved.panels[0].sessionId, 'session1');
  assert.equal(store.saved.panels[0].title, null);
});

test('server:stop asks the transport to stop, and shutdown stops agents and saves', async () => {
  const { dashboard, store, manager, sent, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'server:stop' });
  assert.deepEqual(sent.at(-1), { type: 'stop-requested' });
  dashboard.shutdown();
  assert.deepEqual(manager.calls.at(-1), ['stopAll']);
  assert.equal(store.saved.panels.length, 1);
});

test('unknown message types are ignored', async () => {
  const { dashboard, store, manager, sent, send } = setup();
  dashboard.start();
  const sentBefore = sent.length;
  await send({ type: 'does-not-exist' });
  await send({ type: 'toString' });
  await send(null);
  assert.equal(sent.length, sentBefore);
  assert.deepEqual(manager.calls, []);
  assert.deepEqual(store.saved, emptyState());
});
