import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletteItems, rank, score } from '../shared/palette.js';

const state = {
  projects: [
    { path: 'C:\\Claude\\Spider Tag', name: 'Spider Tag', pinned: true },
    { path: 'C:\\Claude\\laptop searcher', name: 'laptop searcher', pinned: false },
  ],
  panels: [
    { id: 'p1', agentName: 'Claude Code', cwd: 'C:\\Claude\\Spider Tag', title: 'Add double jump' },
    { id: 'p2', kind: 'browser', cwd: 'C:\\Claude\\Spider Tag', url: 'http://localhost:3000' },
  ],
  profiles: [{ id: 'a1', name: 'Release notes writer', cwd: 'C:\\Claude\\Spider Tag' }],
  chats: [{ id: 'c1', title: 'What is a pseudo-terminal?' }],
};

const commands = [{ id: 'new-chat', label: 'New chat' }];

const labels = (items) => items.map((item) => item.label);

test('everything in the app is something the box can find', () => {
  const items = paletteItems(state, commands);
  assert.deepEqual(items.map((item) => item.kind),
    ['command', 'workspace', 'workspace', 'panel', 'panel', 'agent', 'chat']);
  assert.deepEqual(labels(items), [
    'New chat',
    'Spider Tag',
    'laptop searcher',
    'Add double jump',
    'localhost:3000',
    'Release notes writer',
    'What is a pseudo-terminal?',
  ]);
});

test('each entry says what it is, so two things of the same name are told apart', () => {
  const items = paletteItems(state, commands);
  assert.equal(items.find((item) => item.label === 'Add double jump').hint, 'Terminal · Spider Tag');
  assert.equal(items.find((item) => item.label === 'Release notes writer').hint, 'Agent · Spider Tag');
  assert.equal(items.find((item) => item.label === 'What is a pseudo-terminal?').hint, 'Chat');
});

test('an empty app has nothing to offer but its commands', () => {
  assert.deepEqual(labels(paletteItems({}, commands)), ['New chat']);
  assert.deepEqual(paletteItems(), []);
});

test('the letters have to be there, in order', () => {
  assert.ok(score('Spider Tag', 'spider') !== null);
  assert.ok(score('Spider Tag', 'sptg') !== null, 'initials of the words');
  assert.equal(score('Spider Tag', 'spiderweb'), null);
  assert.equal(score('Spider Tag', 'gat'), null, 'out of order is not a match');
});

test('nothing typed matches everything, equally', () => {
  assert.equal(score('anything', ''), 0);
  assert.equal(score('anything at all', '  '), 0);
});

test('case and spaces in the query do not matter', () => {
  assert.ok(score('Spider Tag', 'SPIDER') !== null);
  assert.ok(score('Spider Tag', 'sp tag') !== null);
});

test('letters at the start of a word beat the same letters buried in one', () => {
  assert.ok(score('Spider Tag', 'st') > score('pastry list', 'st'));
});

test('letters next to each other beat the same letters scattered about', () => {
  assert.ok(score('release', 'rel') > score('remarkably tiles', 'rel'));
});

test('the shorter of two matching names comes first', () => {
  assert.ok(score('notes', 'notes') > score('notes about everything else', 'notes'));
});

test('with nothing typed the list comes back in the order it was built', () => {
  const items = paletteItems(state, commands);
  assert.deepEqual(labels(rank(items, '')), labels(items));
});

test('typing narrows it to what matches, best first', () => {
  const items = paletteItems(state, commands);
  const found = rank(items, 'notes');
  assert.deepEqual(labels(found), ['Release notes writer']);
});

test('a folder name also finds everything working in that folder', () => {
  const items = paletteItems(state, commands);
  const found = rank(items, 'spider');
  assert.equal(found[0].label, 'Spider Tag', 'the folder itself comes first');
  assert.deepEqual(labels(found).slice(1).sort(),
    ['Add double jump', 'Release notes writer', 'localhost:3000']);
});

test('a folder is found by its path as well as its name', () => {
  const items = paletteItems(state, commands);
  const found = rank(items, 'laptop sea');
  assert.equal(found[0].label, 'laptop searcher');
});

test('a match on the name beats a match on what is only a hint', () => {
  const items = paletteItems(state, commands);
  // "Spider Tag" is the name of the folder and the hint of the panel in it.
  assert.equal(rank(items, 'spider tag')[0].kind, 'workspace');
});

test('nothing matching is an empty list, not everything', () => {
  assert.deepEqual(rank(paletteItems(state, commands), 'zzzz'), []);
});

test('the list is cut short, so the box never grows past the window', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ kind: 'chat', targetId: `c${i}`, label: `chat ${i}`, hint: 'Chat' }));
  assert.equal(rank(many, '').length, 12);
  assert.equal(rank(many, 'chat').length, 12);
  assert.equal(rank(many, 'chat', 3).length, 3);
});
