import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScrollback, DEFAULT_LIMIT } from '../server/scrollback.js';

test('default limit is 256 KB', () => {
  assert.equal(DEFAULT_LIMIT, 256 * 1024);
});

test('keeps appended data in order', () => {
  const buffer = createScrollback(100);
  buffer.append('hello ');
  buffer.append('world');
  assert.equal(buffer.read(), 'hello world');
});

test('drops the oldest data when over the limit', () => {
  const buffer = createScrollback(10);
  buffer.append('aaaaa');
  buffer.append('bbbbb');
  buffer.append('ccc');
  assert.equal(buffer.read(), 'bbbbbccc');
});

test('keeps only the tail of a single chunk larger than the limit', () => {
  const buffer = createScrollback(4);
  buffer.append('abcdefgh');
  assert.equal(buffer.read(), 'efgh');
});

test('clear empties the buffer', () => {
  const buffer = createScrollback(10);
  buffer.append('abc');
  buffer.clear();
  assert.equal(buffer.read(), '');
});
