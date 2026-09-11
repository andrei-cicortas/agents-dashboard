import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NOTIFICATIONS,
  addNotification,
  markRead,
  markAllRead,
  unreadCount,
  removeForPanel,
} from '../server/notifications.js';

const make = (id, panelId = 'p1') => ({ id, panelId, event: 'finished', at: '2026-09-11T10:00:00.000Z' });

test('addNotification puts the newest first and defaults read to false', () => {
  let list = addNotification([], make('n1'));
  list = addNotification(list, make('n2'));
  assert.deepEqual(list.map((n) => n.id), ['n2', 'n1']);
  assert.equal(list[0].read, false);
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

test('removeForPanel drops notifications of a closed panel', () => {
  const list = addNotification(addNotification([], make('n1', 'p1')), make('n2', 'p2'));
  assert.deepEqual(removeForPanel(list, 'p1').map((n) => n.id), ['n2']);
});
