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

test('the tools an agent has are the only ones that exist for it', () => {
  // A deny list does not hold: denied Bash, the agent reached for another
  // tool that also runs commands. --tools decides what exists at all, so the
  // list has to be given that way, and named as allowed so nothing stops to
  // ask a person who is not there.
  const args = runArgs({ prompt: 'go' });
  const at = args.indexOf('--tools');
  assert.notEqual(at, -1, 'the set of tools must be stated, not left at the default');
  assert.equal(args[at + 1], READ_ONLY_TOOLS.join(','));
  const allowed = args.indexOf('--allowedTools');
  assert.deepEqual(args.slice(allowed + 1, allowed + 1 + READ_ONLY_TOOLS.length), READ_ONLY_TOOLS);
});

test('the reading set cannot run anything or change anything', () => {
  for (const tool of ['Bash', 'PowerShell', 'Write', 'Edit', 'NotebookEdit', 'Task', 'Monitor']) {
    assert.ok(!READ_ONLY_TOOLS.includes(tool), `${tool} must not be in the reading set`);
  }
});

test('an agent trusted with more gets exactly what it was trusted with', () => {
  const args = runArgs({ prompt: 'go', tools: ['Read', 'Edit', 'Bash'] });
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Edit,Bash');
});

test('an agent runs without the setup belonging to this PC, so it follows its own instructions', () => {
  // Skills, hooks, MCP servers and CLAUDE.md belong to whoever is at the
  // keyboard; a named agent should behave the same whatever they have installed.
  assert.ok(runArgs({ prompt: 'go' }).includes('--safe-mode'));
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
