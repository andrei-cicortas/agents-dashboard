import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terminalKey } from '../shared/terminal-keys.js';

// A keydown with the fields the choice reads, as the browser reports them.
function keydown(key, keyCode, { ctrl = false, shift = false, alt = false, meta = false } = {}) {
  return { type: 'keydown', key, keyCode, ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta };
}
const nothingSelected = { hasSelection: false };
const textSelected = { hasSelection: true };

test('Ctrl+V pastes instead of reaching the agent', () => {
  // Left to the terminal it became ^V for the agent and the browser never
  // pasted, so text from the clipboard or from Wispr Flow was lost.
  assert.equal(terminalKey(keydown('v', 86, { ctrl: true }), nothingSelected), 'paste');
});

test('Ctrl+V pastes with text selected too', () => {
  assert.equal(terminalKey(keydown('v', 86, { ctrl: true }), textSelected), 'paste');
});

test('Ctrl+Shift+V pastes, as in Windows Terminal', () => {
  assert.equal(terminalKey(keydown('V', 86, { ctrl: true, shift: true }), nothingSelected), 'paste');
});

test('Ctrl+V is known by its key code, whatever letter the layout puts on it', () => {
  // The terminal turns key code 86 into ^V on any keyboard layout, so the key
  // code is what has to be caught.
  assert.equal(terminalKey(keydown('м', 86, { ctrl: true }), nothingSelected), 'paste');
});

test('Alt+V still reaches the agent, where Claude Code pastes an image', () => {
  assert.equal(terminalKey(keydown('v', 86, { alt: true }), nothingSelected), 'agent');
});

test('AltGr with V is typing, not a paste', () => {
  // Windows reports AltGr as Ctrl and Alt together.
  assert.equal(terminalKey(keydown('v', 86, { ctrl: true, alt: true }), nothingSelected), 'agent');
});

test('a plain v is typing', () => {
  assert.equal(terminalKey(keydown('v', 86), nothingSelected), 'agent');
});

test('Ctrl+C with text selected copies it', () => {
  assert.equal(terminalKey(keydown('c', 67, { ctrl: true }), textSelected), 'copy');
});

test('Ctrl+C with nothing selected reaches the agent as an interrupt', () => {
  assert.equal(terminalKey(keydown('c', 67, { ctrl: true }), nothingSelected), 'agent');
});

test('Ctrl+F opens the find bar', () => {
  assert.equal(terminalKey(keydown('f', 70, { ctrl: true }), nothingSelected), 'find');
});

test('Ctrl+Shift+F is left to the agent', () => {
  assert.equal(terminalKey(keydown('F', 70, { ctrl: true, shift: true }), nothingSelected), 'agent');
});
