import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webAddress } from '../shared/address.js';

test('a web address is accepted as it was typed', () => {
  assert.equal(webAddress('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(webAddress('https://example.com/orders?tab=new'), 'https://example.com/orders?tab=new');
  assert.equal(webAddress('  http://127.0.0.1:8080/admin  '), 'http://127.0.0.1:8080/admin');
});

test('anything that is not http or https is refused', () => {
  // A pane points a real browser engine at this, so a scheme that can read the
  // disk or run a script has no business being accepted.
  for (const value of ['javascript:alert(1)', 'file:///C:/Windows', 'data:text/html,hi', 'ws://localhost:1', 'about:blank']) {
    assert.equal(webAddress(value), null, value);
  }
});

test('nonsense is refused rather than guessed at', () => {
  for (const value of ['', '   ', 'localhost:3000', 'not a url', null, undefined, 42, {}]) {
    assert.equal(webAddress(value), null, JSON.stringify(value));
  }
});
