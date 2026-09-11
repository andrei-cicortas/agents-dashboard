import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTitleTracker, isUsefulTitle } from '../server/terminal-title.js';

test('reads an OSC 0 title terminated by BEL', () => {
  const tracker = createTitleTracker();
  assert.equal(tracker.push('before\x1b]0;Fix the login bug\x07after'), 'Fix the login bug');
});

test('reads an OSC 2 title terminated by ST', () => {
  const tracker = createTitleTracker();
  assert.equal(tracker.push('\x1b]2;Pricing page\x1b\\'), 'Pricing page');
});

test('returns the latest title when a chunk has several', () => {
  const tracker = createTitleTracker();
  assert.equal(tracker.push('\x1b]0;first\x07 text \x1b]0;second\x07'), 'second');
});

test('returns null when a chunk has no title', () => {
  const tracker = createTitleTracker();
  assert.equal(tracker.push('plain output\r\n'), null);
});

test('joins a title split across chunks', () => {
  const tracker = createTitleTracker();
  assert.equal(tracker.push('output \x1b]0;Add dou'), null);
  assert.equal(tracker.push('ble jump\x07 more'), 'Add double jump');
});

test('ignores non-title OSC sequences', () => {
  const tracker = createTitleTracker();
  assert.equal(tracker.push('\x1b]8;;https://example.com\x07link\x1b]8;;\x07'), null);
});

test('isUsefulTitle rejects empty and cmd.exe titles', () => {
  assert.equal(isUsefulTitle(''), false);
  assert.equal(isUsefulTitle('   '), false);
  assert.equal(isUsefulTitle('C:\\WINDOWS\\SYSTEM32\\cmd.exe'), false);
  assert.equal(isUsefulTitle('Add double jump'), true);
});
