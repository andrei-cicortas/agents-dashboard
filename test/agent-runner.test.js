import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runArgs, READ_ONLY_TOOLS, createAgentRunner } from '../server/agent-runner.js';

function fakeSpawn() {
  const calls = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => calls.push(['kill']);
  const spawn = (command, args, options) => {
    calls.push(['spawn', command, args, options]);
    return child;
  };
  return { spawn, child, calls };
}

function collect(options = {}) {
  const { spawn, child, calls } = fakeSpawn();
  const events = [];
  const ended = [];
  const runner = createAgentRunner({ spawn, command: 'claude' });
  const run = runner.run({ cwd: 'C:\p', prompt: 'hi', ...options }, {
    onEvent: (event) => events.push(event),
    onDone: (outcome) => ended.push(outcome),
  });
  return { child, calls, events, ended, run };
}

test('a first message asks for a fresh session, in the folder it belongs to', () => {
  const args = runArgs({ prompt: 'Find leads' });
  assert.ok(args.includes('--print'));
  assert.ok(args.includes('Find leads'));
  assert.deepEqual(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 2), ['--output-format', 'stream-json']);
  // stream-json only streams when it is also asked to be verbose.
  assert.ok(args.includes('--verbose'));
  assert.ok(!args.includes('--resume'));
});

test('a later message continues the same thread', () => {
  const args = runArgs({ prompt: 'And the next ten', sessionId: 'abc' });
  assert.deepEqual(args.slice(args.indexOf('--resume'), args.indexOf('--resume') + 2), ['--resume', 'abc']);
});

test("an agent's own instructions are appended to the system prompt", () => {
  const args = runArgs({ prompt: 'go', instructions: 'You only answer in lists.' });
  assert.deepEqual(
    args.slice(args.indexOf('--append-system-prompt'), args.indexOf('--append-system-prompt') + 2),
    ['--append-system-prompt', 'You only answer in lists.'],
  );
});

test('instructions that are blank are left out rather than sent empty', () => {
  assert.ok(!runArgs({ prompt: 'go', instructions: '   ' }).includes('--append-system-prompt'));
});

test('an agent may only read, unless it was given a wider list on purpose', () => {
  const args = runArgs({ prompt: 'go' });
  const at = args.indexOf('--allowedTools');
  assert.deepEqual(args.slice(at + 1, at + 1 + READ_ONLY_TOOLS.length), READ_ONLY_TOOLS);
  assert.ok(!READ_ONLY_TOOLS.includes('Bash'), 'the safe list must not be able to run commands');
  assert.ok(!READ_ONLY_TOOLS.includes('Write'), 'the safe list must not be able to write files');
  assert.ok(!READ_ONLY_TOOLS.includes('Edit'), 'the safe list must not be able to edit files');

  const wider = runArgs({ prompt: 'go', tools: ['Read', 'Edit'] });
  const widerAt = wider.indexOf('--allowedTools');
  assert.deepEqual(wider.slice(widerAt + 1, widerAt + 3), ['Read', 'Edit']);
});

test('the agent runs in its own folder', () => {
  const { calls } = collect({ cwd: 'C:\projects\orbit' });
  const [, , , options] = calls[0];
  assert.equal(options.cwd, 'C:\projects\orbit');
});

test('each line of the stream is reported as it arrives', () => {
  const { child, events } = collect();
  child.stdout.emit('data', Buffer.from('{"type":"system"}\n{"type":"result","subtype":"success"}\n'));
  assert.deepEqual(events, [{ type: 'system' }, { type: 'result', subtype: 'success' }]);
});

test('a line split across two chunks is still read once, whole', () => {
  const { child, events } = collect();
  child.stdout.emit('data', Buffer.from('{"type":"assis'));
  assert.deepEqual(events, []);
  child.stdout.emit('data', Buffer.from('tant"}\n'));
  assert.deepEqual(events, [{ type: 'assistant' }]);
});

test('a line that is not JSON is skipped instead of ending the run', () => {
  const { child, events } = collect();
  child.stdout.emit('data', Buffer.from('not json\n\n{"type":"system"}\n'));
  assert.deepEqual(events, [{ type: 'system' }]);
});

test('a last line without its newline is not lost when the agent exits', () => {
  const { child, events } = collect();
  child.stdout.emit('data', Buffer.from('{"type":"result","subtype":"success"}'));
  child.emit('close', 0);
  assert.deepEqual(events, [{ type: 'result', subtype: 'success' }]);
});

test('finishing tells the caller whether it went well', () => {
  const { child, ended } = collect();
  child.emit('close', 0);
  assert.deepEqual(ended, [{ ok: true, message: null }]);
});

test('a crash is reported with whatever the agent complained about', () => {
  const { child, ended } = collect();
  child.stderr.emit('data', Buffer.from('claude: not logged in'));
  child.emit('close', 1);
  assert.deepEqual(ended, [{ ok: false, message: 'claude: not logged in' }]);
});

test('an agent that will not start is reported instead of throwing', () => {
  const { child, ended } = collect();
  child.emit('error', new Error('spawn ENOENT'));
  assert.deepEqual(ended, [{ ok: false, message: 'spawn ENOENT' }]);
});

test('it only finishes once, however the agent goes away', () => {
  const { child, ended } = collect();
  child.emit('error', new Error('spawn ENOENT'));
  child.emit('close', 1);
  assert.equal(ended.length, 1);
});

test('a run can be called off', () => {
  const { run, calls } = collect();
  run.cancel();
  assert.ok(calls.some(([name]) => name === 'kill'));
});
