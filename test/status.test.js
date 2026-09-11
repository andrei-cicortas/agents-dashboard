import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotClass, isActive, sameFolder } from '../shared/status.js';

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
