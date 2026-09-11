import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeAgo } from '../shared/time-ago.js';

const now = new Date('2026-09-11T12:00:00.000Z');
const before = (seconds) => new Date(now.getTime() - seconds * 1000).toISOString();

test('timeAgo gives short relative times', () => {
  assert.equal(timeAgo(before(10), now), 'just now');
  assert.equal(timeAgo(before(-30), now), 'just now');
  assert.equal(timeAgo(before(45), now), '1m ago');
  assert.equal(timeAgo(before(30 * 60), now), '30m ago');
  assert.equal(timeAgo(before(60 * 60), now), '1h ago');
  assert.equal(timeAgo(before(5 * 3600), now), '5h ago');
  assert.equal(timeAgo(before(26 * 3600), now), '1d ago');
});
