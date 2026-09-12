import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotClass, folderState, isActive, sameFolder } from '../shared/status.js';

test('dotClass shows attention first, then the process status', () => {
  assert.equal(dotClass({ status: 'running', attention: true }), 'attention');
  assert.equal(dotClass({ status: 'running', attention: false }), 'running');
  assert.equal(dotClass({ status: 'starting', attention: false }), 'starting');
  assert.equal(dotClass({ status: 'exited', attention: false }), 'stopped');
  assert.equal(dotClass({ status: 'not-installed', attention: false }), 'stopped');
});

test('isActive is true only while starting or running', () => {
  assert.equal(isActive({ status: 'running' }), true);
  assert.equal(isActive({ status: 'starting' }), true);
  assert.equal(isActive({ status: 'exited' }), false);
  assert.equal(isActive({ status: 'folder-missing' }), false);
});

test('sameFolder ignores case, trailing slashes, and slash direction', () => {
  assert.equal(sameFolder('C:\\Games\\My Game', 'c:/games/my game/'), true);
  assert.equal(sameFolder('C:\\Games\\My Game', 'C:\\Games\\Other'), false);
});

test('a browser pane has a look of its own and is not counted as an agent', () => {
  const pane = { kind: 'browser', status: 'browser', url: 'http://localhost:3000' };
  assert.equal(dotClass(pane), 'browser');
  assert.equal(isActive(pane), false, 'it is not an agent that could be left running');
});

const running = (extra = {}) => ({ status: 'running', attention: false, ...extra });

test('a folder where everything is running says so and looks ordinary', () => {
  assert.deepEqual(folderState([running(), running()]), { tone: '', note: '2 agents running' });
  assert.equal(folderState([running()]).note, '1 agent running');
});

test('a folder with an agent waiting says that first', () => {
  const { tone, note } = folderState([running(), running({ attention: true }), { status: 'exited' }]);
  assert.equal(tone, 'attention');
  assert.equal(note, 'An agent in here needs your input');
});

test('a folder with a stopped agent says so when nothing is waiting', () => {
  assert.equal(folderState([running(), { status: 'exited', attention: false }]).tone, 'stopped');
});

test('a web pane is not an agent, so it never makes a folder look stopped', () => {
  const pane = { kind: 'browser', status: 'browser' };
  assert.equal(folderState([running(), pane]).tone, '');
  assert.equal(folderState([running(), pane]).note, '1 agent running');
});

test('a folder holding only web panes has no agents to report on', () => {
  assert.deepEqual(folderState([{ kind: 'browser', status: 'browser' }]), { tone: '', note: '0 agents running' });
});
