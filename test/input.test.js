import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksTyped } from '../shared/input.js';

test('letters and words are typing', () => {
  assert.equal(looksTyped('hello'), true);
  assert.equal(looksTyped('a'), true);
});

test('Enter, Tab and Ctrl-C are typing', () => {
  assert.equal(looksTyped('\r'), true);
  assert.equal(looksTyped('\t'), true);
  assert.equal(looksTyped('\x03'), true);
});

test('the arrow keys are typing', () => {
  // Shaped like an escape sequence, but a person pressed them.
  assert.equal(looksTyped('\x1b[A'), true);
  assert.equal(looksTyped('\x1bOB'), true);
});

test('nothing at all is not typing', () => {
  assert.equal(looksTyped(''), false);
  assert.equal(looksTyped(null), false);
});

test('a focus report is the terminal talking, not a person', () => {
  assert.equal(looksTyped('\x1b[I'), false);
  assert.equal(looksTyped('\x1b[O'), false);
  assert.equal(looksTyped('\x1b[I\x1b[O'), false);
});

test('an answer to what kind of terminal are you is not typing', () => {
  // The agent asks on startup and the terminal replies by itself. Counting
  // that as the person typing made the dashboard believe every panel had been
  // used, so it never repaired one whose session had gone.
  assert.equal(looksTyped('\x1b[?1;2c'), false);
  assert.equal(looksTyped('\x1b[>0;276;0c'), false);
  assert.equal(looksTyped('\x1b[?62;c'), false);
});

test('a cursor position report is not typing', () => {
  assert.equal(looksTyped('\x1b[24;80R'), false);
});

test('a status report is not typing', () => {
  assert.equal(looksTyped('\x1b[0n'), false);
});

test('a reply with something typed after it still counts as typing', () => {
  assert.equal(looksTyped('\x1b[Ihello'), true);
});
