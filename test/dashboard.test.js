import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDashboard } from '../server/dashboard.js';
import { emptyState } from '../server/store.js';

const agents = [
  { id: 'claude', name: 'Claude Code', command: 'claude', startArgs: [], resumeArgs: [], installHint: 'h' },
  { id: 'codex', name: 'Codex', command: 'codex', startArgs: [], resumeArgs: [], installHint: 'h', sessionSource: 'codex' },
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

function setup({ initial = emptyState(), picked = null, pickFolder = async () => picked, userName = 'tester', folderExists = () => true, listFolders } = {}) {
  const store = memoryStore(initial);
  const manager = fakeAgentManager();
  const opened = [];
  const sent = [];
  let ids = 0;
  let sessions = 0;
  const dashboard = createDashboard({
    store,
    agentManager: manager,
    agents,
    pickFolder,
    folderExists,
    ...(listFolders ? { listFolders } : {}),
    openFolder: (folder) => opened.push(folder),
    broadcast: (message) => sent.push(message),
    requestStop: () => sent.push({ type: 'stop-requested' }),
    now: () => new Date('2026-09-11T10:00:00.000Z'),
    newId: () => `id${++ids}`,
    newSessionId: () => `session${++sessions}`,
    userName,
  });
  const lastState = () => sent.filter((m) => m.type === 'state').at(-1);
  const send = (message, clientId = 'window1') => dashboard.handleMessage(message, () => {}, clientId);
  return { dashboard, store, manager, opened, sent, lastState, send };
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
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  assert.deepEqual(manager.calls.at(-1), ['start', { panelId: 'id1', agentId: 'claude', cwd: GAME, sessionId: 'session1', mode: 'start' }]);
  // The session is not written down until the panel has been used: an id for a
  // conversation that was never started cannot be resumed later.
  assert.deepEqual(store.saved.panels, [{ id: 'id1', agentId: 'claude', cwd: GAME, sessionId: null, title: null }]);
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
  // A fresh session arrives because resuming the old one failed. That panel no
  // longer has a conversation behind it, so its id is not written down until
  // someone types into it — otherwise the dead id is simply replaced by
  // another dead id, and the panel comes back broken every time.
  manager.emit('session', { panelId: 'p1', sessionId: 'fresh' });
  assert.equal(store.saved.panels[0].sessionId, null);
});

test('a panel whose resume failed can be used again and is then remembered', async () => {
  const { dashboard, store, manager, send } = setup({ initial: withPanel() });
  dashboard.start();
  manager.emit('session', { panelId: 'p1', sessionId: 'fresh' });
  await send({ type: 'panel:input', panelId: 'p1', data: 'hello' });
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
    { id: 'id1', kind: 'panel', targetId: 'p1', event: 'needs-input', at: '2026-09-11T10:00:00.000Z', read: false },
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
  await send({ type: 'ui:focus', kind: 'panel', targetId: 'p1' });
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().unread, 0);
  assert.equal(lastState().notifications[0].read, true);
});

test('a hook is unread once the client that focused the panel disconnects', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'ui:focus', kind: 'panel', targetId: 'p1' }, 'window1');
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, true);
  dashboard.disconnect('window1');
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, false);
  assert.equal(lastState().unread, 1);
});

test('a focus report with no target clears the focus', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'ui:focus', kind: 'panel', targetId: 'p1' });
  await send({ type: 'ui:focus', kind: 'panel', targetId: null });
  dashboard.handleHook({ panelId: 'p1', event: 'finished' });
  assert.equal(lastState().notifications[0].read, false);
});

test('focus is tracked per client', async () => {
  const { dashboard, lastState, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'ui:focus', kind: 'panel', targetId: 'p1' }, 'window1');
  await send({ type: 'ui:focus', kind: 'panel', targetId: null }, 'window2');
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

test('panel:restart leaves an agent that names its own session to name the new one', async () => {
  // Restarting Codex with an id we made up would skip reading its real one
  // back, and the next launch would ask it to resume a conversation it never had.
  const { dashboard, store, manager, send } = setup({ initial: { ...withPanel(), panels: [{ ...savedPanel, agentId: 'codex', sessionId: 'codex-old' }] } });
  dashboard.start();
  await send({ type: 'panel:restart', panelId: 'p1' });
  assert.equal(manager.calls.at(-1)[1].sessionId, null);
  assert.equal(store.saved.panels[0].sessionId, null);
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

test('start restores the layouts that were saved', () => {
  const saved = { ...withPanel(), layouts: { [GAME]: { panelId: 'p1' } } };
  const { dashboard, lastState } = setup({ initial: saved });
  dashboard.start();
  assert.deepEqual(lastState().layouts, { [GAME]: { panelId: 'p1' } });
});

test('layout:set stores the layout for one workspace and tells every window', async () => {
  const { dashboard, store, send, lastState } = setup({ initial: withPanel() });
  dashboard.start();
  const layout = { direction: 'row', sizes: [0.5, 0.5], children: [{ panelId: 'p1' }, { panelId: 'p2' }] };
  await send({ type: 'layout:set', path: GAME, layout });
  assert.deepEqual(store.saved.layouts, { [GAME]: layout });
  assert.deepEqual(lastState().layouts, { [GAME]: layout });
});

test('layout:set with a null layout forgets that workspace', async () => {
  const { dashboard, store, send } = setup({ initial: { ...withPanel(), layouts: { [GAME]: { panelId: 'p1' } } } });
  dashboard.start();
  await send({ type: 'layout:set', path: GAME, layout: null });
  assert.deepEqual(store.saved.layouts, {});
});

test('layout:set ignores anything that is not a path and a layout', async () => {
  const { dashboard, send, lastState } = setup({ initial: withPanel() });
  dashboard.start();
  const before = lastState().layouts;
  await send({ type: 'layout:set', path: 7, layout: { panelId: 'p1' } });
  await send({ type: 'layout:set', path: GAME, layout: 'nope' });
  await send({ type: 'layout:set', path: GAME, layout: [] });
  assert.deepEqual(lastState().layouts, before);
});

test('removing a project forgets the layout that went with it', async () => {
  const initial = { projects: [{ path: GAME, name: 'my game', pinned: false }], panels: [], notifications: [], layouts: { [GAME]: { panelId: 'p1' } } };
  const { dashboard, store, send } = setup({ initial });
  dashboard.start();
  await send({ type: 'project:remove', path: GAME });
  assert.deepEqual(store.saved.layouts, {});
});

test('a new panel takes its place in the layout of its workspace', async () => {
  const { dashboard, store, send } = setup({ initial: { projects: [{ path: GAME, name: 'my game', pinned: false }], panels: [], notifications: [], layouts: {} } });
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  assert.deepEqual(store.saved.layouts[GAME], { panelId: 'id1' });
});

test('a new panel asked for beside another splits that one', async () => {
  const { dashboard, store, send } = setup({ initial: { projects: [{ path: GAME, name: 'my game', pinned: false }], panels: [], notifications: [], layouts: {} } });
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  await send({ type: 'panel:create', agentId: 'codex', cwd: GAME, nextTo: 'id1', direction: 'column' });
  assert.deepEqual(store.saved.layouts[GAME], {
    direction: 'column',
    sizes: [0.5, 0.5],
    children: [{ panelId: 'id1' }, { panelId: 'id2' }],
  });
});

test('closing a panel takes it out of the layout', async () => {
  const { dashboard, store, send } = setup({ initial: { projects: [{ path: GAME, name: 'my game', pinned: false }], panels: [], notifications: [], layouts: {} } });
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  await send({ type: 'panel:create', agentId: 'codex', cwd: GAME });
  await send({ type: 'panel:close', panelId: 'id1' });
  assert.deepEqual(store.saved.layouts[GAME], { panelId: 'id2' });
});

test('closing the last panel leaves the workspace without a layout', async () => {
  const { dashboard, store, send } = setup({ initial: { projects: [{ path: GAME, name: 'my game', pinned: false }], panels: [], notifications: [], layouts: {} } });
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  await send({ type: 'panel:close', panelId: 'id1' });
  assert.deepEqual(store.saved.layouts, {});
});

test('a restored panel that the saved layout never knew about is taken in', () => {
  const saved = { ...withPanel(), layouts: {} };
  const { dashboard, lastState } = setup({ initial: saved });
  dashboard.start();
  assert.deepEqual(lastState().layouts[GAME], { panelId: 'p1' });
});

const BROWSER = { type: 'panel:create', kind: 'browser', cwd: GAME, url: 'http://localhost:3000' };
const withProject = () => ({ projects: [{ path: GAME, name: 'my game', pinned: false }], panels: [], notifications: [], layouts: {} });

test('a browser pane is created without starting an agent', async () => {
  const { dashboard, manager, send, lastState } = setup({ initial: withProject() });
  dashboard.start();
  await send(BROWSER);
  assert.deepEqual(manager.calls, [], 'nothing was launched');
  const panel = lastState().panels[0];
  assert.equal(panel.kind, 'browser');
  assert.equal(panel.url, 'http://localhost:3000');
  assert.equal(panel.status, 'browser');
});

test('a browser pane takes its place on the canvas like any other', async () => {
  const { dashboard, store, send } = setup({ initial: withProject() });
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  await send({ ...BROWSER, nextTo: 'id1', direction: 'row' });
  assert.deepEqual(store.saved.layouts[GAME], {
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [{ panelId: 'id1' }, { panelId: 'id2' }],
  });
});

test('a browser pane is saved with its address and restored without resuming', () => {
  const saved = {
    ...withProject(),
    panels: [{ id: 'b1', kind: 'browser', cwd: GAME, url: 'http://localhost:5173' }],
  };
  const { dashboard, manager, lastState } = setup({ initial: saved });
  dashboard.start();
  assert.deepEqual(manager.calls, [], 'nothing was resumed');
  assert.equal(lastState().panels[0].url, 'http://localhost:5173');
});

test('a browser pane can be pointed somewhere else', async () => {
  const { dashboard, store, send } = setup({ initial: withProject() });
  dashboard.start();
  await send(BROWSER);
  await send({ type: 'panel:url', panelId: 'id1', url: 'http://127.0.0.1:8080/admin' });
  assert.equal(store.saved.panels[0].url, 'http://127.0.0.1:8080/admin');
});

test('only http and https addresses are accepted', async () => {
  const { dashboard, send, lastState } = setup({ initial: withProject() });
  dashboard.start();
  for (const url of ['javascript:alert(1)', 'file:///C:/Windows', 'data:text/html,hi', '', 42]) {
    await send({ ...BROWSER, url });
  }
  assert.deepEqual(lastState().panels, [], `nothing should have been created`);

  await send(BROWSER);
  await send({ type: 'panel:url', panelId: 'id1', url: 'javascript:alert(1)' });
  assert.equal(lastState().panels[0].url, 'http://localhost:3000', 'the address is left alone');
});

test('typing into a browser pane goes nowhere', async () => {
  const { dashboard, manager, send } = setup({ initial: withProject() });
  dashboard.start();
  await send(BROWSER);
  await send({ type: 'panel:input', panelId: 'id1', data: 'ls\r' });
  await send({ type: 'panel:resize', panelId: 'id1', cols: 80, rows: 24 });
  assert.deepEqual(manager.calls, []);
});

test('state names the person at the keyboard, for the sidebar account card', () => {
  const { dashboard } = setup({ userName: 'ada' });
  assert.deepEqual(dashboard.state().user, { name: 'ada' });
});

test('a panel nobody has typed into is saved without a session to resume', () => {
  const { send, store, lastState } = setup({ picked: GAME });
  send({ type: 'project:add' });
  send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  // The agent was given a session id to start with, but Claude only writes the
  // conversation once there is one. Saving that id would leave the panel asking
  // on every restart to resume something that was never created.
  assert.ok(lastState().panels[0].sessionId, 'it still starts with an id of its own');
  assert.equal(store.saved.panels[0].sessionId, null);
});

test('a panel that was typed into keeps its session, so it can be resumed', async () => {
  const { send, store } = setup({ picked: GAME });
  await send({ type: 'project:add' });
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  const panelId = store.saved.panels[0].id;
  await send({ type: 'panel:input', panelId, data: 'hello\r' });
  assert.equal(store.saved.panels[0].sessionId, 'session1');
});

test('a panel restored without a session starts a new agent instead of resuming nothing', () => {
  const saved = {
    projects: [{ path: GAME, name: 'my game', pinned: false }],
    panels: [{ id: 'p1', agentId: 'claude', cwd: GAME, sessionId: null, title: null }],
    notifications: [],
  };
  const { dashboard, manager } = setup({ initial: saved });
  dashboard.start();
  const [[, options]] = manager.calls;
  assert.equal(options.mode, 'start');
  assert.ok(options.sessionId, 'it needs an id to start under');
});

test('a folder can be added by its path, without opening the picker', async () => {
  let pickerOpened = false;
  const { send, store } = setup({
    pickFolder: async () => { pickerOpened = true; return null; },
    folderExists: (dir) => dir === GAME,
  });
  await send({ type: 'project:add', path: GAME });
  assert.equal(pickerOpened, false, 'a path was given, so nothing should pop up');
  assert.deepEqual(store.saved.projects, [{ path: GAME, name: 'my game', pinned: false }]);
});

test('a path that is not a folder is refused, and says so', async () => {
  const replies = [];
  const { dashboard } = setup({ folderExists: () => false });
  await dashboard.handleMessage({ type: 'project:add', path: 'C:\\nope' }, (m) => replies.push(m));
  assert.equal(dashboard.state().projects.length, 0);
  assert.deepEqual(replies.at(-1), { type: 'project:add-failed', path: 'C:\\nope', message: 'That folder does not exist.' });
});

test('adding the same folder twice by path changes nothing', async () => {
  const { send, dashboard } = setup({ folderExists: () => true });
  await send({ type: 'project:add', path: GAME });
  await send({ type: 'project:add', path: 'c:\\games\\MY GAME' });
  assert.equal(dashboard.state().projects.length, 1);
});

test('a blank path still opens the picker', async () => {
  let pickerOpened = false;
  const { send } = setup({ pickFolder: async () => { pickerOpened = true; return null; } });
  await send({ type: 'project:add', path: '   ' });
  assert.equal(pickerOpened, true);
});

test('a path with a trailing slash is stored as a plain folder path', async () => {
  const { send, dashboard } = setup({ folderExists: () => true });
  await send({ type: 'project:add', path: 'C:\\Games\\my game\\' });
  assert.equal(dashboard.state().projects[0].name, 'my game');
});

test('a session the agent named itself is remembered straight away', () => {
  // Codex writes the conversation as soon as it opens it, so unlike an id we
  // made up, this one really can be resumed.
  const { dashboard, store, manager } = setup({ initial: withPanel() });
  dashboard.start();
  manager.emit('session', { panelId: 'p1', sessionId: 'codex-abc', reason: 'discovered' });
  assert.equal(store.saved.panels[0].sessionId, 'codex-abc');
});

test('an agent that names its own session is not handed one we invented', async () => {
  // Codex ignores any id we pass and picks its own. Writing ours down would
  // mean asking, on every restart, to resume a conversation Codex never had.
  const { dashboard, store, manager, send } = setup();
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'codex', cwd: GAME });
  assert.equal(manager.calls.at(-1)[1].sessionId, null);
  assert.equal(store.saved.panels[0].sessionId, null);
});

test('an agent we name the session for still gets one', async () => {
  const { dashboard, manager, send } = setup();
  dashboard.start();
  await send({ type: 'panel:create', agentId: 'claude', cwd: GAME });
  assert.equal(manager.calls.at(-1)[1].sessionId, 'session1');
});

test('a restored panel of a self-naming agent is not given an invented session either', () => {
  const saved = {
    projects: [{ path: GAME, name: 'my game', pinned: false }],
    panels: [{ id: 'p1', agentId: 'codex', cwd: GAME, sessionId: null, title: null }],
    notifications: [],
  };
  const { dashboard, manager } = setup({ initial: saved });
  dashboard.start();
  assert.deepEqual(manager.calls[0][1], { panelId: 'p1', agentId: 'codex', cwd: GAME, sessionId: null, mode: 'start' });
});

test('a folder the dashboard is showing can be opened in Explorer', async () => {
  const { opened, send } = setup();
  await send({ type: 'project:add', path: GAME });
  await send({ type: 'folder:open', path: GAME });
  assert.deepEqual(opened, [GAME]);
});

test('the folder of a running panel counts as one it is showing', async () => {
  const { dashboard, opened, send } = setup({ initial: withPanel() });
  dashboard.start();
  await send({ type: 'folder:open', path: GAME });
  assert.deepEqual(opened, [GAME]);
});

test('the same folder written differently is still the same folder', async () => {
  const { opened, send } = setup();
  await send({ type: 'project:add', path: GAME });
  await send({ type: 'folder:open', path: 'c:/games/my game' });
  assert.equal(opened.length, 1);
});

test('a folder it is not showing is not opened, whoever asks', async () => {
  const { opened, send } = setup();
  await send({ type: 'project:add', path: GAME });
  await send({ type: 'folder:open', path: 'C:\\Windows\\System32' });
  await send({ type: 'folder:open', path: '' });
  await send({ type: 'folder:open' });
  assert.deepEqual(opened, []);
});

test('the app can ask what folders are inside one, to offer its own browser', async () => {
  const replies = [];
  const { dashboard } = setup({
    listFolders: ({ path: asked }) => ({ path: asked, parent: null, entries: [{ name: 'src', path: 'X' }], error: null }),
  });
  await dashboard.handleMessage({ type: 'folders:list', path: 'C:\\Games' }, (m) => replies.push(m));
  assert.deepEqual(replies.at(-1), {
    type: 'folders:listed',
    path: 'C:\\Games',
    parent: null,
    entries: [{ name: 'src', path: 'X' }],
    error: null,
  });
});
