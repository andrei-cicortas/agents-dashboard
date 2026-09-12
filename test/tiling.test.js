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
    { id: '/0', direction: 'row', path: [], index: 0, position: 30, start: 0, extent: 100, axisStart: 0, axisExtent: 100 },
    { id: '1/0', direction: 'column', path: [1], index: 0, position: 50, start: 30, extent: 70, axisStart: 0, axisExtent: 100 },
  ]);
});

test('a divider knows how big its own split is, so a drag can be scaled', () => {
  // The inner row only owns the bottom half, so dragging its divider one
  // percent of the canvas must move it two percent of that row.
  const tree = {
    direction: 'column',
    sizes: [0.5, 0.5],
    children: [leaf('a'), { direction: 'row', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] }],
  };
  const inner = toLayout(tree).dividers.at(-1);
  assert.equal(inner.axisStart, 0, 'the inner row starts at the left edge');
  assert.equal(inner.axisExtent, 100, 'and runs the full width');

  const narrow = {
    direction: 'row',
    sizes: [0.6, 0.4],
    children: [leaf('a'), { direction: 'row', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] }],
  };
  const nested = toLayout(narrow).dividers.at(-1);
  assert.equal(nested.axisStart, 60);
  assert.equal(nested.axisExtent, 40);
});

test('a split of three panels has a divider between each pair', () => {
  const tree = {
    direction: 'row',
    sizes: [0.2, 0.3, 0.5],
    children: [leaf('a'), leaf('b'), leaf('c')],
  };
  assert.deepEqual(toLayout(tree).dividers.map((divider) => divider.position), [20, 50]);
});

test('tidy can be asked for a column count instead of guessing one', () => {
  assert.deepEqual(tidy(['a', 'b', 'c', 'd'], 2), {
    direction: 'column',
    sizes: [0.5, 0.5],
    children: [
      { direction: 'row', sizes: [0.5, 0.5], children: [leaf('a'), leaf('b')] },
      { direction: 'row', sizes: [0.5, 0.5], children: [leaf('c'), leaf('d')] },
    ],
  });
});

test('one column stacks every panel', () => {
  assert.deepEqual(tidy(['a', 'b', 'c'], 1), {
    direction: 'column',
    sizes: [0.3333, 0.3333, 0.3334],
    children: [leaf('a'), leaf('b'), leaf('c')],
  });
});

test('more columns than panels still gives a single row', () => {
  assert.deepEqual(tidy(['a', 'b'], 5), {
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [leaf('a'), leaf('b')],
  });
});
