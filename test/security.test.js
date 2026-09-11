import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedHost, isAllowedOrigin, createToken, isValidToken } from '../server/security.js';

test('isAllowedHost accepts only loopback names on our port', () => {
  assert.equal(isAllowedHost('127.0.0.1:4317', 4317), true);
  assert.equal(isAllowedHost('localhost:4317', 4317), true);
  assert.equal(isAllowedHost('LOCALHOST:4317', 4317), true);
  assert.equal(isAllowedHost('localhost:9999', 4317), false);
  assert.equal(isAllowedHost('evil.example.com:4317', 4317), false);
  assert.equal(isAllowedHost('127.0.0.1', 4317), false);
  assert.equal(isAllowedHost(undefined, 4317), false);
});

test('isAllowedOrigin accepts only our own page', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:4317', 4317), true);
  assert.equal(isAllowedOrigin('http://localhost:4317', 4317), true);
  assert.equal(isAllowedOrigin('https://localhost:4317', 4317), false);
  assert.equal(isAllowedOrigin('http://evil.example.com', 4317), false);
  assert.equal(isAllowedOrigin('null', 4317), false);
  assert.equal(isAllowedOrigin(undefined, 4317), false);
});

test('createToken returns a fresh 48 character hex string', () => {
  const a = createToken();
  const b = createToken();
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notEqual(a, b);
});

test('isValidToken compares tokens safely', () => {
  const token = createToken();
  assert.equal(isValidToken(token, token), true);
  assert.equal(isValidToken(`${token}x`, token), false);
  assert.equal(isValidToken('short', token), false);
  assert.equal(isValidToken(undefined, token), false);
});
