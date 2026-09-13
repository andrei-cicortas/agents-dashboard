import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newlyUnread } from '../shared/toasts.js';

const note = (id, read = false) => ({ id, read, kind: 'panel', targetId: 'p1', event: 'finished' });

test('the first state a window sees announces nothing', () => {
  const { fresh, seen } = newlyUnread(null, [note('a'), note('b')]);
  assert.deepEqual(fresh, []);
  assert.deepEqual([...seen].sort(), ['a', 'b']);
});

test('an unread notification that was not there before is new', () => {
  const first = newlyUnread(null, [note('a')]);
  const { fresh } = newlyUnread(first.seen, [note('a'), note('b')]);
  assert.deepEqual(fresh.map((one) => one.id), ['b']);
});

test('one that arrived already read is not announced', () => {
  // The server marks it read when a window was looking straight at the thing.
  const first = newlyUnread(null, []);
  const { fresh } = newlyUnread(first.seen, [note('a', true)]);
  assert.deepEqual(fresh, []);
});

test('a notification is announced once, however many states mention it', () => {
  const first = newlyUnread(null, []);
  const second = newlyUnread(first.seen, [note('a')]);
  const third = newlyUnread(second.seen, [note('a')]);
  assert.deepEqual(second.fresh.map((one) => one.id), ['a']);
  assert.deepEqual(third.fresh, []);
});

test('ids that are gone are forgotten, so the set does not grow for ever', () => {
  const first = newlyUnread(null, [note('a'), note('b')]);
  const { seen } = newlyUnread(first.seen, [note('b')]);
  assert.deepEqual([...seen], ['b']);
});
