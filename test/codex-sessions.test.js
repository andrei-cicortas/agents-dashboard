import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findSessionId, codexHome } from '../server/codex-sessions.js';

const GAME = 'C:\\Games\\my game';
const OTHER = 'C:\\Games\\other';

let counter = 0;
function tempCodexHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `codex-${counter += 1}-`));
  return dir;
}

// Writes a rollout the way Codex does: a dated folder, and a first line of
// metadata naming the session and the folder it ran in.
function writeRollout(home, { id, cwd, at }) {
  const day = path.join(home, 'sessions', '2026', '09', '12');
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, `rollout-2026-09-12T00-00-00-${id}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { session_id: id, cwd } })}\n{"type":"other"}\n`);
  fs.utimesSync(file, at / 1000, at / 1000);
  return file;
}

test('the session of a run in this folder is found', () => {
  const home = tempCodexHome();
  writeRollout(home, { id: 'aaa', cwd: GAME, at: 2000 });
  assert.equal(findSessionId({ home, cwd: GAME, startedAt: 1000 }), 'aaa');
});

test('a run in another folder is not ours', () => {
  const home = tempCodexHome();
  writeRollout(home, { id: 'aaa', cwd: OTHER, at: 2000 });
  assert.equal(findSessionId({ home, cwd: GAME, startedAt: 1000 }), null);
});

test('the folder is matched the way Windows means it', () => {
  const home = tempCodexHome();
  writeRollout(home, { id: 'aaa', cwd: 'c:\\games\\MY GAME\\', at: 2000 });
  assert.equal(findSessionId({ home, cwd: GAME, startedAt: 1000 }), 'aaa');
});

test('a run from before this panel started belongs to something else', () => {
  const home = tempCodexHome();
  writeRollout(home, { id: 'old', cwd: GAME, at: 500 });
  assert.equal(findSessionId({ home, cwd: GAME, startedAt: 1000 }), null);
});

test('a session another panel already claimed is skipped', () => {
  const home = tempCodexHome();
  writeRollout(home, { id: 'first', cwd: GAME, at: 2000 });
  writeRollout(home, { id: 'second', cwd: GAME, at: 3000 });
  assert.equal(findSessionId({ home, cwd: GAME, startedAt: 1000, taken: new Set(['first']) }), 'second');
});

test('panels started together claim the runs in the order they appeared', () => {
  const home = tempCodexHome();
  writeRollout(home, { id: 'second', cwd: GAME, at: 3000 });
  writeRollout(home, { id: 'first', cwd: GAME, at: 2000 });
  const taken = new Set();
  const one = findSessionId({ home, cwd: GAME, startedAt: 1000, taken });
  taken.add(one);
  const two = findSessionId({ home, cwd: GAME, startedAt: 1000, taken });
  assert.deepEqual([one, two], ['first', 'second']);
});

test('no sessions at all is not an error', () => {
  assert.equal(findSessionId({ home: tempCodexHome(), cwd: GAME, startedAt: 0 }), null);
});

test('a half-written rollout is skipped rather than throwing', () => {
  const home = tempCodexHome();
  const day = path.join(home, 'sessions', '2026', '09', '12');
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, 'rollout-2026-09-12T00-00-00-partial.jsonl');
  fs.writeFileSync(file, '{"type":"session_meta","payl');
  fs.utimesSync(file, 2, 2);
  writeRollout(home, { id: 'good', cwd: GAME, at: 3000 });
  assert.equal(findSessionId({ home, cwd: GAME, startedAt: 1000 }), 'good');
});

test('files that are not rollouts are ignored', () => {
  const home = tempCodexHome();
  const day = path.join(home, 'sessions', '2026', '09', '12');
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, 'notes.txt'), 'hello');
  assert.equal(findSessionId({ home, cwd: GAME, startedAt: 0 }), null);
});

test('Codex conversations are looked for where Codex keeps them', () => {
  // The caller should not have to know; forgetting to say where meant the
  // lookup silently found nothing and every panel started fresh.
  const home = codexHome();
  assert.ok(home.endsWith('.codex') || home === process.env.CODEX_HOME, `unexpected home: ${home}`);
  assert.doesNotThrow(() => findSessionId({ cwd: GAME, startedAt: Date.now() + 1000 }));
});
