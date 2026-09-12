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
    layouts: { 'C:\\Games\\my game': { panelId: 'p1' } },
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

// Real fs, except renameSync fails with the given codes, one per call, then works.
function flakyFs(codes) {
  const failures = [...codes];
  const fakeFs = {
    renameCalls: 0,
    readFileSync: fs.readFileSync,
    mkdirSync: fs.mkdirSync,
    writeFileSync: fs.writeFileSync,
    renameSync(from, to) {
      fakeFs.renameCalls += 1;
      const code = failures.shift();
      if (code) throw Object.assign(new Error(`${code}: rename failed`), { code });
      return fs.renameSync(from, to);
    },
  };
  return fakeFs;
}

const sampleState = { projects: [], panels: [], notifications: [{ id: 'n1' }], layouts: {} };

test('save retries a busy rename and then succeeds', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const fakeFs = flakyFs(['EBUSY', 'EPERM']);
  const store = createStore(path.join(dir, 'state.json'), { fs: fakeFs });
  assert.doesNotThrow(() => store.save(sampleState));
  assert.equal(fakeFs.renameCalls, 3);
  assert.deepEqual(store.load(), sampleState);
  assert.equal(errors.mock.callCount(), 0);
});

test('save logs and returns when the rename keeps failing', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const fakeFs = flakyFs(Array(10).fill('EACCES'));
  const file = path.join(dir, 'state.json');
  const store = createStore(file, { fs: fakeFs });
  assert.doesNotThrow(() => store.save(sampleState));
  assert.equal(fakeFs.renameCalls, 5);
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(fs.existsSync(file), false);
});

test('save logs other errors once without retrying or throwing', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const fakeFs = flakyFs(['EXDEV']);
  const store = createStore(path.join(dir, 'state.json'), { fs: fakeFs });
  assert.doesNotThrow(() => store.save(sampleState));
  assert.equal(fakeFs.renameCalls, 1);
  assert.equal(errors.mock.callCount(), 1);
});

test('save never throws when the temp file cannot be written', (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const fakeFs = {
    ...flakyFs([]),
    writeFileSync() { throw Object.assign(new Error('ENOSPC: no space'), { code: 'ENOSPC' }); },
  };
  const store = createStore(path.join(dir, 'state.json'), { fs: fakeFs });
  assert.doesNotThrow(() => store.save(sampleState));
  assert.equal(errors.mock.callCount(), 1);
});

test('valid JSON that is not an object counts as corrupt', () => {
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '42');
  assert.deepEqual(createStore(file).load(), emptyState());
  assert.equal(fs.existsSync(path.join(dir, 'state.corrupt.json')), true);
});

test('empty state starts with no saved layouts', () => {
  assert.deepEqual(emptyState().layouts, {});
});

test('load fills a missing layouts map with an empty one', () => {
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, JSON.stringify({ projects: [], panels: [], notifications: [] }));
  assert.deepEqual(createStore(file).load().layouts, {});
});

test('a layouts value that is not a plain object is ignored', () => {
  const file = path.join(dir, 'state.json');
  for (const layouts of [[], 'nope', 7, null]) {
    fs.writeFileSync(file, JSON.stringify({ layouts }));
    assert.deepEqual(createStore(file).load().layouts, {}, `layouts=${JSON.stringify(layouts)}`);
  }
});
