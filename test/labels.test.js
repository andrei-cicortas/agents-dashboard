import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderName, panelLabel, notificationText } from '../shared/labels.js';

const panel = { title: null, agentName: 'Claude Code', cwd: 'C:\\Users\\user\\Desktop\\my game' };

test('folderName returns the last part of a Windows or POSIX path', () => {
  assert.equal(folderName('C:\\Users\\user\\Desktop\\my game'), 'my game');
  assert.equal(folderName('C:\\Projects\\site\\'), 'site');
  assert.equal(folderName('/home/andrei/bot'), 'bot');
  assert.equal(folderName('C:\\'), 'C:');
});

test('panelLabel prefers the agent title', () => {
  assert.equal(panelLabel(panel), 'Claude Code · my game');
  assert.equal(panelLabel({ ...panel, title: 'Add double jump' }), 'Add double jump');
});

test('notificationText describes the event', () => {
  assert.equal(notificationText({ event: 'finished' }, panel), 'Claude Code · my game finished');
  assert.equal(notificationText({ event: 'needs-input' }, panel), 'Claude Code · my game needs your input');
  assert.equal(notificationText({ event: 'finished' }, undefined), 'Closed agent finished');
});

test('a browser pane is named by the address it is showing', () => {
  assert.equal(panelLabel({ kind: 'browser', url: 'http://localhost:3000' }), 'localhost:3000');
  assert.equal(panelLabel({ kind: 'browser', url: 'http://localhost:3000/orders?tab=new' }), 'localhost:3000/orders');
  assert.equal(panelLabel({ kind: 'browser', url: 'https://example.com/' }), 'example.com');
});

test('an address that will not parse is shown as it is', () => {
  assert.equal(panelLabel({ kind: 'browser', url: 'not a url' }), 'not a url');
});
