import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaf, tidy, toLayout } from '../shared/tiling.js';

const panelIds = (tree) => toLayout(tree).rects.map((rect) => rect.panelId);

test('tidy of nothing is an empty layout', () => {
  assert.equal(tidy([]), null);
});

test('tidy of one panel is a bare leaf', () => {
  assert.deepEqual(tidy(['a']), leaf('a'));
});

test('tidy lays panels out in the same grid the old view used', () => {
  // gridSize(3) is 2 columns by 2 rows, so the third panel gets its own row.
  assert.deepEqual(tidy(['a', 'b', 'c']), {
    direction: 'column',
    sizes: [0.5, 0.5],
    children: [
      { direction: 'row', sizes: [0.5, 0.5], children: [leaf('a'), leaf('b')] },
      leaf('c'),
    ],
  });
});

test('tidy keeps the given order', () => {
  assert.deepEqual(panelIds(tidy(['d', 'c', 'b', 'a'])), ['d', 'c', 'b', 'a']);
});

test('a lone panel fills the whole canvas', () => {
  assert.deepEqual(toLayout(leaf('a')).rects, [
    { panelId: 'a', left: 0, top: 0, width: 100, height: 100 },
  ]);
});

test('an empty layout has no rectangles and no dividers', () => {
  assert.deepEqual(toLayout(null), { rects: [], dividers: [] });
});

test('a row splits the canvas across, a column down', () => {
  const row = { direction: 'row', sizes: [0.25, 0.75], children: [leaf('a'), leaf('b')] };
  assert.deepEqual(toLayout(row).rects, [
    { panelId: 'a', left: 0, top: 0, width: 25, height: 100 },
    { panelId: 'b', left: 25, top: 0, width: 75, height: 100 },
  ]);

  const column = { direction: 'column', sizes: [0.25, 0.75], children: [leaf('a'), leaf('b')] };
  assert.deepEqual(toLayout(column).rects, [
    { panelId: 'a', left: 0, top: 0, width: 100, height: 25 },
    { panelId: 'b', left: 0, top: 25, width: 100, height: 75 },
  ]);
});

test('nested splits divide the space of their parent, not the canvas', () => {
  const tree = {
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [
      leaf('a'),
      { direction: 'column', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] },
    ],
  };
  assert.deepEqual(toLayout(tree).rects, [
    { panelId: 'a', left: 0, top: 0, width: 50, height: 100 },
    { panelId: 'b', left: 50, top: 0, width: 50, height: 50 },
    { panelId: 'c', left: 50, top: 50, width: 50, height: 50 },
  ]);
});

test('a divider sits on the seam and spans its parent', () => {
  const tree = {
    direction: 'row',
    sizes: [0.3, 0.7],
    children: [
      leaf('a'),
      { direction: 'column', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] },
    ],
  };
  const { dividers } = toLayout(tree);
  assert.deepEqual(dividers, [
    { id: '/0', direction: 'row', path: [], index: 0, position: 30, start: 0, extent: 100 },
    { id: '1/0', direction: 'column', path: [1], index: 0, position: 50, start: 30, extent: 70 },
  ]);
});

test('a split of three panels has a divider between each pair', () => {
  const tree = {
    direction: 'row',
    sizes: [0.2, 0.3, 0.5],
    children: [leaf('a'), leaf('b'), leaf('c')],
  };
  assert.deepEqual(toLayout(tree).dividers.map((divider) => divider.position), [20, 50]);
});
