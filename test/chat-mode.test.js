import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDashboard, CHAT_MODELS, CHAT_TOOLS } from '../server/dashboard.js';
import { emptyState } from '../server/store.js';

const HOME = 'C:\\Users\\tester';

function fakeAgentManager() {
  const emitter = new EventEmitter();
  return {
    on: (event, handler) => { emitter.on(event, handler); },
    start() {}, write() {}, resize() {}, stop() {}, stopAll() {}, forget() {},
    readScrollback: () => '',
  };
}

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

function setup({ initial = emptyState(), agentRunner } = {}) {
  let saved = structuredClone(initial);
  const runner = agentRunner === null ? null : fakeRunner();
  let ids = 0;
  const dashboard = createDashboard({
    store: { load: () => structuredClone(saved), save: (s) => { saved = structuredClone(s); } },
    agentManager: fakeAgentManager(),
    agentRunner: runner,
    agents: [{ id: 'claude', name: 'Claude Code', command: 'claude', startArgs: [], resumeArgs: [], installHint: 'h' }],
    pickFolder: async () => null,
    broadcast: () => {},
    now: () => new Date('2026-09-12T10:00:00.000Z'),
    newId: () => `id${++ids}`,
    newSessionId: () => 'session1',
    userName: 'tester',
    chatCwd: HOME,
  });
  const send = (message) => dashboard.handleMessage(message, () => {}, 'window1');
  return { dashboard, send, runner, state: () => dashboard.state(), saved: () => saved };
}

const said = (text) => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
});

async function withChat(t) {
  await t.send({ type: 'chat:create' });
  return t.state().chats[0];
}

test('a chat starts empty, ready, and on the everyday model', async () => {
  const t = setup();
  const chat = await withChat(t);
  assert.equal(chat.title, 'New chat');
  assert.deepEqual(chat.items, []);
  assert.equal(chat.status, 'idle');
  assert.equal(chat.model, 'sonnet');
  assert.equal(chat.sessionId, null);
});

test('the models a chat may use are part of the state, so the UI need not know them', async () => {
  const t = setup();
  assert.deepEqual(t.state().chatModels, CHAT_MODELS);
});

test('asking something runs Claude with no folder of the user to work in', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'What is a pseudo-terminal?' });

  const { options } = t.runner.last();
  assert.equal(options.cwd, HOME);
  assert.equal(options.prompt, 'What is a pseudo-terminal?');
  assert.equal(options.sessionId, null);
  assert.equal(options.model, 'sonnet');
});

test('a chat may look things up, but has no tool that touches the disk', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  assert.deepEqual(t.runner.last().options.tools, CHAT_TOOLS);
  assert.ok(!CHAT_TOOLS.includes('Bash'), 'a chat cannot run commands');
  assert.ok(!CHAT_TOOLS.includes('Read'), 'a chat cannot read files');
  assert.ok(!CHAT_TOOLS.includes('Write'), 'a chat cannot change files');
});

test('the first thing asked becomes the name of the chat', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'What is a pseudo-terminal?' });
  assert.equal(t.state().chats[0].title, 'What is a pseudo-terminal?');

  await t.send({ type: 'chat:send', chatId: chat.id, text: 'and a console?' });
  assert.equal(t.state().chats[0].title, 'What is a pseudo-terminal?', 'the name is set once, not on every message');
});

test('a very long first question is cut down to a name', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'x'.repeat(200) });
  assert.equal(t.state().chats[0].title.length, 60);
  assert.ok(t.state().chats[0].title.endsWith('…'));
});

test('what was asked and what came back both land in the transcript', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  assert.equal(t.state().chats[0].status, 'working');

  t.runner.last().handlers.onEvent(said('Hello back.'));
  t.runner.last().handlers.onDone({ ok: true, message: null });

  const [asked, answered] = t.state().chats[0].items;
  assert.deepEqual(asked, { kind: 'said', by: 'you', text: 'hello' });
  assert.deepEqual(answered, { kind: 'said', by: 'agent', text: 'Hello back.' });
  assert.equal(t.state().chats[0].status, 'idle');
});

test('the session is remembered, so the next message carries on the same chat', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  t.runner.last().handlers.onEvent({ type: 'system', subtype: 'init', session_id: 'cli-1' });
  t.runner.last().handlers.onDone({ ok: true, message: null });

  await t.send({ type: 'chat:send', chatId: chat.id, text: 'and again' });
  assert.equal(t.runner.last().options.sessionId, 'cli-1');
});

test('a second message while it is still answering is ignored', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'again' });
  assert.equal(t.runner.runs.length, 1);
});

test('an empty message asks nothing', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: '   ' });
  assert.equal(t.runner.runs.length, 0);
  assert.deepEqual(t.state().chats[0].items, []);
});

test('a run that fails says so in the chat, which can then be used again', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  t.runner.last().handlers.onDone({ ok: false, message: 'claude is not installed' });

  const live = t.state().chats[0];
  assert.equal(live.status, 'failed');
  assert.deepEqual(live.items.at(-1), { kind: 'failed', text: 'claude is not installed' });

  await t.send({ type: 'chat:send', chatId: chat.id, text: 'again' });
  assert.equal(t.runner.runs.length, 2);
});

test('stopping a chat cancels the run and leaves it ready', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  await t.send({ type: 'chat:cancel', chatId: chat.id });
  assert.deepEqual(t.runner.last().cancelled, [true]);
  assert.equal(t.state().chats[0].status, 'idle');
});

test('an event arriving after the chat was deleted is ignored, not thrown on', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  const { handlers, cancelled } = t.runner.last();
  await t.send({ type: 'chat:remove', chatId: chat.id });

  assert.deepEqual(cancelled, [true]);
  assert.doesNotThrow(() => handlers.onEvent(said('too late')));
  assert.doesNotThrow(() => handlers.onDone({ ok: true, message: null }));
  assert.deepEqual(t.state().chats, []);
});

test('a chat can be renamed, and an empty name is refused', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:rename', chatId: chat.id, title: 'Pseudo-terminals' });
  assert.equal(t.state().chats[0].title, 'Pseudo-terminals');
  await t.send({ type: 'chat:rename', chatId: chat.id, title: '  ' });
  assert.equal(t.state().chats[0].title, 'Pseudo-terminals');
});

test('a chat can be started on the question itself, so nothing has to be named first', async () => {
  const t = setup();
  await t.send({ type: 'chat:create', text: 'What is a pseudo-terminal?' });
  const [chat] = t.state().chats;
  assert.equal(chat.title, 'What is a pseudo-terminal?');
  assert.equal(chat.status, 'working');
  assert.equal(t.runner.last().options.prompt, 'What is a pseudo-terminal?');
});

test('a chat created with nothing to ask is still there, waiting', async () => {
  const t = setup();
  await t.send({ type: 'chat:create', text: '   ' });
  assert.equal(t.state().chats.length, 1);
  assert.equal(t.state().chats[0].status, 'idle');
  assert.equal(t.runner.runs.length, 0);
});

test('the model can be changed, and the next message uses it', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:model', chatId: chat.id, model: 'opus' });
  assert.equal(t.state().chats[0].model, 'opus');
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  assert.equal(t.runner.last().options.model, 'opus');
});

test('a model nobody offers is refused rather than handed to the CLI', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:model', chatId: chat.id, model: 'gpt-4' });
  assert.equal(t.state().chats[0].model, 'sonnet');
});

test('an answer that arrives while you are elsewhere rings the bell', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  t.runner.last().handlers.onDone({ ok: true, message: null });

  const [notification] = t.state().notifications;
  assert.equal(notification.kind, 'chat');
  assert.equal(notification.targetId, chat.id);
  assert.equal(notification.event, 'finished');
  assert.equal(t.state().unread, 1);
});

test('an answer you are sitting in front of does not ring it', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'ui:focus', kind: 'chat', targetId: chat.id });
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  t.runner.last().handlers.onDone({ ok: true, message: null });
  assert.equal(t.state().unread, 0);
  assert.equal(t.state().notifications[0].read, true);
});

test('a run that failed says so in the bell too', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  t.runner.last().handlers.onDone({ ok: false, message: 'no' });
  assert.equal(t.state().notifications[0].event, 'failed');
});

test('deleting a chat takes its notifications with it', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  t.runner.last().handlers.onDone({ ok: true, message: null });
  assert.equal(t.state().notifications.length, 1);

  await t.send({ type: 'chat:remove', chatId: chat.id });
  assert.deepEqual(t.state().notifications, []);
  assert.equal(t.state().unread, 0);
});

test('chats are saved, and come back ready rather than still working', async () => {
  const t = setup();
  const chat = await withChat(t);
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  assert.equal(t.saved().chats[0].status, 'idle', 'a run cannot survive the server');
  assert.equal(t.saved().chats[0].title, 'hello');

  const again = setup({ initial: t.saved() });
  again.dashboard.start();
  assert.equal(again.state().chats[0].title, 'hello');
  assert.equal(again.state().chats[0].status, 'idle');
});

test('a chat saved under a model that no longer exists comes back on the everyday one', () => {
  const t = setup({
    initial: { ...emptyState(), chats: [{ id: 'c1', title: 'old', sessionId: null, items: [], status: 'idle', model: 'claude-2' }] },
  });
  t.dashboard.start();
  assert.equal(t.state().chats[0].model, 'sonnet');
});

test('with no runner behind it, a chat takes nothing rather than half-recording it', async () => {
  const t = setup({ agentRunner: null });
  await t.send({ type: 'chat:create' });
  const chat = t.state().chats[0];
  await t.send({ type: 'chat:send', chatId: chat.id, text: 'hello' });
  assert.deepEqual(t.state().chats[0].items, []);
  assert.equal(t.state().chats[0].status, 'idle');
});
