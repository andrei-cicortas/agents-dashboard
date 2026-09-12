import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDashboard } from '../server/dashboard.js';
import { emptyState } from '../server/store.js';

const GAME = 'C:\\Games\\my game';

function fakeAgentManager() {
  const emitter = new EventEmitter();
  return {
    on: (event, handler) => { emitter.on(event, handler); },
    start() {}, write() {}, resize() {}, stop() {}, stopAll() {}, forget() {},
    readScrollback: () => '',
  };
}

// Stands in for the Claude CLI: remembers how it was asked to run, and lets the
// test push events back at its own pace.
function fakeRunner() {
  const runs = [];
  return {
    runs,
    last: () => runs.at(-1),
    run(options, handlers) {
      const cancelled = [];
      runs.push({ options, handlers, cancelled });
      return { cancel: () => cancelled.push(true) };
    },
  };
}

function setup({ initial = emptyState() } = {}) {
  let saved = structuredClone(initial);
  const runner = fakeRunner();
  const sent = [];
  let ids = 0;
  const dashboard = createDashboard({
    store: { load: () => structuredClone(saved), save: (s) => { saved = structuredClone(s); } },
    agentManager: fakeAgentManager(),
    agentRunner: runner,
    agents: [{ id: 'claude', name: 'Claude Code', command: 'claude', startArgs: [], resumeArgs: [], installHint: 'h' }],
    pickFolder: async () => null,
    broadcast: (message) => sent.push(message),
    now: () => new Date('2026-09-12T10:00:00.000Z'),
    newId: () => `id${++ids}`,
    newSessionId: () => 'session1',
    userName: 'tester',
  });
  const send = (message) => dashboard.handleMessage(message, () => {}, 'window1');
  return { dashboard, send, runner, sent, state: () => dashboard.state(), saved: () => saved };
}

async function withProfile(t) {
  await t.send({ type: 'profile:create', name: 'Lead finder', cwd: GAME, instructions: 'Answer in lists.' });
  return t.state().profiles[0];
}

async function withThread(t) {
  const profile = await withProfile(t);
  await t.send({ type: 'thread:create', profileId: profile.id });
  return { profile, threadId: t.state().threads[0].id };
}

test('a named agent can be added, and starts with no threads', async () => {
  const t = setup();
  const profile = await withProfile(t);
  assert.equal(profile.name, 'Lead finder');
  assert.equal(profile.cwd, GAME);
  assert.equal(profile.instructions, 'Answer in lists.');
  assert.ok(profile.colour, 'a named agent needs a colour to be told apart by');
  assert.deepEqual(t.state().threads, []);
});

test('a named agent without a name is not created', async () => {
  const t = setup();
  await t.send({ type: 'profile:create', name: '   ', cwd: GAME });
  assert.deepEqual(t.state().profiles, []);
});

test('a thread belongs to its agent and opens empty', async () => {
  const t = setup();
  const { profile, threadId } = await withThread(t);
  const thread = t.state().threads.find((one) => one.id === threadId);
  assert.equal(thread.profileId, profile.id);
  assert.deepEqual(thread.items, []);
  assert.equal(thread.status, 'idle');
});

test('sending the first message runs the agent in its own folder, with its instructions', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'Find me leads' });

  const { options } = t.runner.last();
  assert.equal(options.cwd, GAME);
  assert.equal(options.prompt, 'Find me leads');
  assert.equal(options.instructions, 'Answer in lists.');
  assert.equal(options.sessionId, null, 'the first message has no session to resume');

  const after = t.state().threads[0];
  assert.equal(after.status, 'working');
  assert.deepEqual(after.items, [{ kind: 'said', by: 'you', text: 'Find me leads' }]);
});

test('an empty message is not sent', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: '  ' });
  assert.equal(t.runner.runs.length, 0);
  assert.deepEqual(t.state().threads[0].items, []);
});

test('the first message becomes the thread title, so the tab can be read', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'Find leads for the launch' });
  assert.equal(t.state().threads[0].title, 'Find leads for the launch');
});

test('what the agent says lands in the thread as it arrives', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });

  t.runner.last().handlers.onEvent({ type: 'assistant', message: { content: [{ type: 'text', text: 'Found 41.' }] } });
  assert.deepEqual(t.state().threads[0].items.at(-1), { kind: 'said', by: 'agent', text: 'Found 41.' });
});

test('the session it opened is kept, so the next message continues the same thread', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });

  t.runner.last().handlers.onEvent({ type: 'system', subtype: 'init', session_id: 'sess-abc' });
  t.runner.last().handlers.onDone({ ok: true, message: null });
  assert.equal(t.state().threads[0].status, 'idle');

  await t.send({ type: 'thread:send', threadId, text: 'and ten more' });
  assert.equal(t.runner.last().options.sessionId, 'sess-abc');
});

test('a thread that failed says so, and can be used again', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });
  t.runner.last().handlers.onDone({ ok: false, message: 'not logged in' });

  const thread = t.state().threads[0];
  assert.equal(thread.status, 'failed');
  assert.deepEqual(thread.items.at(-1), { kind: 'failed', text: 'not logged in' });

  await t.send({ type: 'thread:send', threadId, text: 'again' });
  assert.equal(t.state().threads[0].status, 'working');
});

test('a second message while the agent is still working is ignored', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });
  await t.send({ type: 'thread:send', threadId, text: 'and again' });
  assert.equal(t.runner.runs.length, 1);
});

test('a run in progress can be called off', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });
  await t.send({ type: 'thread:cancel', threadId });
  assert.deepEqual(t.runner.last().cancelled, [true]);
  assert.equal(t.state().threads[0].status, 'idle');
});

test('agents and their threads come back after a restart', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });
  t.runner.last().handlers.onEvent({ type: 'system', subtype: 'init', session_id: 'sess-abc' });
  t.runner.last().handlers.onDone({ ok: true, message: null });

  const again = setup({ initial: t.saved() });
  again.dashboard.start();
  assert.equal(again.state().profiles[0].name, 'Lead finder');
  const [thread] = again.state().threads;
  assert.equal(thread.sessionId, 'sess-abc');
  assert.deepEqual(thread.items, [{ kind: 'said', by: 'you', text: 'go' }]);
});

test('a thread left working when the app closed is not still working when it opens', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });

  const again = setup({ initial: t.saved() });
  again.dashboard.start();
  assert.equal(again.state().threads[0].status, 'idle');
});

test('removing an agent takes its threads with it', async () => {
  const t = setup();
  const { profile } = await withThread(t);
  await t.send({ type: 'profile:remove', profileId: profile.id });
  assert.deepEqual(t.state().profiles, []);
  assert.deepEqual(t.state().threads, []);
});

test('a thread can be closed on its own', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:remove', threadId });
  assert.deepEqual(t.state().threads, []);
  assert.equal(t.state().profiles.length, 1);
});

test('an agent can be renamed and told something new', async () => {
  const t = setup();
  const profile = await withProfile(t);
  await t.send({ type: 'profile:update', profileId: profile.id, name: 'Lead scout', instructions: 'Be terse.' });
  assert.equal(t.state().profiles[0].name, 'Lead scout');
  assert.equal(t.state().profiles[0].instructions, 'Be terse.');
});

test('events for a thread that was closed mid-run are dropped', async () => {
  const t = setup();
  const { threadId } = await withThread(t);
  await t.send({ type: 'thread:send', threadId, text: 'go' });
  const { handlers } = t.runner.last();
  await t.send({ type: 'thread:remove', threadId });
  handlers.onEvent({ type: 'assistant', message: { content: [{ type: 'text', text: 'late' }] } });
  handlers.onDone({ ok: true, message: null });
  assert.deepEqual(t.state().threads, []);
});
