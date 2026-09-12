import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NOTIFICATIONS,
  addNotification,
  markRead,
  markAllRead,
  unreadCount,
  removeFor,
  migrate,
} from '../server/notifications.js';

const make = (id, targetId = 'p1', kind = 'panel') => ({ id, kind, targetId, event: 'finished', at: '2026-09-11T10:00:00.000Z' });

test('addNotification puts the newest first and defaults read to false', () => {
  let list = addNotification([], make('n1'));
  list = addNotification(list, make('n2'));
  assert.deepEqual(list.map((n) => n.id), ['n2', 'n1']);
  assert.equal(list[0].read, false);
});

test('a notification with no kind given is one about a panel', () => {
  const [only] = addNotification([], { id: 'n1', targetId: 'p1', event: 'finished', at: 'x' });
  assert.equal(only.kind, 'panel');
});

test('addNotification keeps an explicit read flag', () => {
  const list = addNotification([], { ...make('n1'), read: true });
  assert.equal(list[0].read, true);
});

test('addNotification caps the list at 100', () => {
  let list = [];
  for (let i = 0; i < MAX_NOTIFICATIONS + 5; i += 1) list = addNotification(list, make(`n${i}`));
  assert.equal(list.length, 100);
  assert.equal(list[0].id, 'n104');
});

test('markRead marks one notification without mutating the input', () => {
  const list = addNotification(addNotification([], make('n1')), make('n2'));
  const updated = markRead(list, 'n1');
  assert.equal(updated.find((n) => n.id === 'n1').read, true);
  assert.equal(updated.find((n) => n.id === 'n2').read, false);
  assert.equal(list.find((n) => n.id === 'n1').read, false);
});

test('markAllRead and unreadCount', () => {
  const list = addNotification(addNotification([], make('n1')), make('n2'));
  assert.equal(unreadCount(list), 2);
  assert.equal(unreadCount(markAllRead(list)), 0);
});

test('removeFor drops the notifications of something that is gone', () => {
  const list = addNotification(addNotification([], make('n1', 'p1')), make('n2', 'p2'));
  assert.deepEqual(removeFor(list, 'panel', 'p1').map((n) => n.id), ['n2']);
});

test('removeFor leaves alone something of another kind with the same id', () => {
  const list = addNotification(addNotification([], make('n1', 'x', 'panel')), make('n2', 'x', 'chat'));
  assert.deepEqual(removeFor(list, 'chat', 'x').map((n) => n.id), ['n1']);
});

test('notifications written before chats existed are read as being about panels', () => {
  const old = [{ id: 'n1', panelId: 'p1', event: 'finished', at: 'x', read: false }];
  assert.deepEqual(migrate(old), [{ id: 'n1', kind: 'panel', targetId: 'p1', event: 'finished', at: 'x', read: false }]);
});

test('migrate leaves a notification that already says what it is about', () => {
  const list = [make('n1', 'c1', 'chat')];
  assert.equal(migrate(list)[0], list[0]);
});
