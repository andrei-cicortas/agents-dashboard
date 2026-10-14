import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderName, panelLabel, notificationText, notificationSubject } from '../shared/labels.js';

const panel = { title: null, agentName: 'Claude Code', cwd: 'C:\\Users\\user\\Desktop\\my game' };

test('folderName returns the last part of a Windows or POSIX path', () => {
  assert.equal(folderName('C:\\Users\\user\\Desktop\\my game'), 'my game');
  assert.equal(folderName('C:\\Projects\\site\\'), 'site');
  assert.equal(folderName('/home/user/bot'), 'bot');
  assert.equal(folderName('C:\\'), 'C:');
});

test('panelLabel prefers the agent title', () => {
  assert.equal(panelLabel(panel), 'Claude Code · my game');
  assert.equal(panelLabel({ ...panel, title: 'Add double jump' }), 'Add double jump');
});

test('notificationText describes the event', () => {
  const named = panelLabel(panel);
  assert.equal(notificationText({ event: 'finished' }, named), 'Claude Code · my game finished');
  assert.equal(notificationText({ event: 'needs-input' }, named), 'Claude Code · my game needs your input');
  assert.equal(notificationText({ event: 'failed' }, 'Lead finder · go'), 'Lead finder · go could not finish');
});

test('a notification whose subject is gone still reads as a sentence', () => {
  assert.equal(notificationText({ event: 'finished', kind: 'panel' }, null), 'Closed agent finished');
  assert.equal(notificationText({ event: 'finished', kind: 'thread' }, null), 'Closed thread finished');
  assert.equal(notificationText({ event: 'finished', kind: 'chat' }, null), 'Deleted chat finished');
});

test('a notification is named after what it came from', () => {
  const state = {
    panels: [{ id: 'p1', title: 'Add double jump', agentName: 'Claude Code', cwd: 'C:\\game' }],
    chats: [{ id: 'c1', title: 'Regex for emails' }],
    profiles: [{ id: 'a1', name: 'Release notes' }],
    threads: [{ id: 't1', profileId: 'a1', title: 'v0.2' }, { id: 't2', profileId: 'gone', title: 'Orphan' }],
  };
  assert.equal(notificationSubject(state, { kind: 'panel', targetId: 'p1' }), 'Add double jump');
  assert.equal(notificationSubject(state, { kind: 'chat', targetId: 'c1' }), 'Regex for emails');
  assert.equal(notificationSubject(state, { kind: 'thread', targetId: 't1' }), 'Release notes · v0.2');
  assert.equal(notificationSubject(state, { kind: 'thread', targetId: 't2' }), 'Orphan');
});

test('a notification about something since closed has no subject', () => {
  const state = { panels: [] };
  assert.equal(notificationSubject(state, { kind: 'panel', targetId: 'x' }), null);
  assert.equal(notificationSubject(state, { kind: 'chat', targetId: 'x' }), null);
  assert.equal(notificationSubject(state, { kind: 'thread', targetId: 'x' }), null);
});

test('a browser pane is named by the address it is showing', () => {
  assert.equal(panelLabel({ kind: 'browser', url: 'http://localhost:3000' }), 'localhost:3000');
  assert.equal(panelLabel({ kind: 'browser', url: 'http://localhost:3000/orders?tab=new' }), 'localhost:3000/orders');
  assert.equal(panelLabel({ kind: 'browser', url: 'https://example.com/' }), 'example.com');
});

test('an address that will not parse is shown as it is', () => {
  assert.equal(panelLabel({ kind: 'browser', url: 'not a url' }), 'not a url');
});
