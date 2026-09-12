import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyTranscript, applyEvent, toolLine, turnLine } from '../shared/transcript.js';

const assistant = (...content) => ({ type: 'assistant', message: { content } });

test('an empty transcript has nothing in it', () => {
  assert.deepEqual(emptyTranscript(), []);
});

test('what the person typed opens the transcript', () => {
  const items = applyEvent(emptyTranscript(), { type: 'prompt', text: 'Find me leads' });
  assert.deepEqual(items, [{ kind: 'said', by: 'you', text: 'Find me leads' }]);
});

test("the agent's prose is added as it arrives", () => {
  const items = applyEvent(emptyTranscript(), assistant({ type: 'text', text: 'Here is what I found.' }));
  assert.deepEqual(items, [{ kind: 'said', by: 'agent', text: 'Here is what I found.' }]);
});

test('two blocks in one message stay two lines of the transcript', () => {
  const items = applyEvent(emptyTranscript(), assistant(
    { type: 'text', text: 'Looking.' },
    { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
  ));
  assert.deepEqual(items.map((i) => i.kind), ['said', 'tool']);
});

test('a tool call arrives as running, and says what it is doing', () => {
  const items = applyEvent(emptyTranscript(), assistant({ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }));
  assert.deepEqual(items, [{ kind: 'tool', id: 't1', verb: 'Run', detail: 'npm test', status: 'running' }]);
});

test('its result marks that same call done, without adding a line', () => {
  let items = applyEvent(emptyTranscript(), assistant({ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }));
  items = applyEvent(items, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } });
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'done');
});

test('a tool that failed is marked failed', () => {
  let items = applyEvent(emptyTranscript(), assistant({ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'nope' } }));
  items = applyEvent(items, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }] } });
  assert.equal(items[0].status, 'failed');
});

test('a result for a call we never saw is ignored rather than throwing', () => {
  const items = applyEvent(emptyTranscript(), { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'ghost' }] } });
  assert.deepEqual(items, []);
});

test('thinking is kept as one line, not as its wording', () => {
  const items = applyEvent(emptyTranscript(), assistant({ type: 'thinking', thinking: 'long private reasoning' }));
  assert.deepEqual(items, [{ kind: 'thought' }]);
});

test('a run that ends badly says so', () => {
  const items = applyEvent(emptyTranscript(), { type: 'result', subtype: 'error_during_execution', result: 'Ran out of turns' });
  assert.deepEqual(items, [{ kind: 'failed', text: 'Ran out of turns' }]);
});

test('a run that ends well adds what the turn took, not its words again', () => {
  const items = applyEvent(emptyTranscript(), {
    type: 'result',
    subtype: 'success',
    result: 'Here is what I found.',
    duration_ms: 1693,
    total_cost_usd: 0.0188,
    usage: { input_tokens: 2, cache_read_input_tokens: 1374, cache_creation_input_tokens: 1781, output_tokens: 13 },
  });
  assert.deepEqual(items, [{ kind: 'done', ms: 1693, cost: 0.0188, read: 3157, wrote: 13 }]);
});

test('a run that ends with nothing to say about itself still ends', () => {
  const [only] = applyEvent(emptyTranscript(), { type: 'result', subtype: 'success' });
  assert.deepEqual(only, { kind: 'done', ms: null, cost: null, read: 0, wrote: 0 });
});

test('the turn line says how long it took and how much went through', () => {
  assert.deepEqual(turnLine({ ms: 1693, cost: 0.0188, read: 3157, wrote: 13 }), {
    text: '1.7s · 3.2k in · 13 out',
    title: 'About $0.019 at list price',
  });
});

test('a turn under a cent is worth more decimals than one over', () => {
  assert.equal(turnLine({ ms: 100, cost: 0.0042 }).title, 'About $0.0042 at list price');
});

test('a long turn is counted in whole seconds', () => {
  assert.equal(turnLine({ ms: 92400, read: 10, wrote: 10 }).text, '92s · 10 in · 10 out');
});

test('a turn that did not say how long it took only says what it used', () => {
  const { text, title } = turnLine({ read: 5, wrote: 6 });
  assert.equal(text, '5 in · 6 out');
  assert.equal(title, '', 'nothing to say about a price nobody reported');
});

test('events we do not draw leave the transcript alone', () => {
  const items = applyEvent(emptyTranscript(), { type: 'system', subtype: 'init', session_id: 'abc' });
  assert.deepEqual(items, []);
});

test('each tool is named the way a person would say it', () => {
  assert.deepEqual(toolLine('Bash', { command: 'git status' }), { verb: 'Run', detail: 'git status' });
  assert.deepEqual(toolLine('Read', { file_path: 'C:\p\a.js' }), { verb: 'Read', detail: 'C:\p\a.js' });
  assert.deepEqual(toolLine('Edit', { file_path: 'a.js' }), { verb: 'Edit', detail: 'a.js' });
  assert.deepEqual(toolLine('Write', { file_path: 'a.js' }), { verb: 'Write', detail: 'a.js' });
  assert.deepEqual(toolLine('Grep', { pattern: 'TODO' }), { verb: 'Search', detail: 'TODO' });
  assert.deepEqual(toolLine('Glob', { pattern: '**/*.js' }), { verb: 'Search', detail: '**/*.js' });
  assert.deepEqual(toolLine('WebSearch', { query: 'node pty' }), { verb: 'Search the web', detail: 'node pty' });
  assert.deepEqual(toolLine('WebFetch', { url: 'https://x.dev' }), { verb: 'Read the web', detail: 'https://x.dev' });
});

test('a tool nobody taught it still gets a sensible line', () => {
  assert.deepEqual(toolLine('mcp__figma__export', { node: '3:1' }), { verb: 'Use', detail: 'mcp__figma__export' });
});

test('a long command is cut so it cannot push the transcript sideways', () => {
  const detail = toolLine('Bash', { command: 'x'.repeat(400) }).detail;
  assert.ok(detail.length < 200, `detail was ${detail.length} characters`);
  assert.ok(detail.endsWith('…'));
});
