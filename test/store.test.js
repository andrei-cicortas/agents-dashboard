import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, emptyState } from '../server/store.js';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents dashboard store ')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

test('load returns empty state when the file is missing', () => {
  const store = createStore(path.join(dir, 'nested', 'state.json'));
  assert.deepEqual(store.load(), emptyState());
});

test('save then load round-trips the state and creates folders', () => {
  const store = createStore(path.join(dir, 'nested', 'state.json'));
  const state = {
    projects: [{ path: 'C:\\Games\\my game', name: 'my game', pinned: true }],
    panels: [{ id: 'p1', agentId: 'claude', cwd: 'C:\\Games\\my game', sessionId: 'abc', title: null }],
    notifications: [],
  };
  store.save(state);
  assert.deepEqual(store.load(), state);
});

test('load fills missing lists with defaults', () => {
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, JSON.stringify({ projects: [] }));
  assert.deepEqual(createStore(file).load(), emptyState());
});

test('a corrupt file is renamed, not deleted, and empty state is returned', () => {
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(createStore(file).load(), emptyState());
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(dir, 'state.corrupt.json'), 'utf8'), '{ not json');
});

test('valid JSON that is not an object counts as corrupt', () => {
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '42');
  assert.deepEqual(createStore(file).load(), emptyState());
  assert.equal(fs.existsSync(path.join(dir, 'state.corrupt.json')), true);
});
