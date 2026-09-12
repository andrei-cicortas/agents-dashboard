import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insert, leaf, MIN_FRACTION, reconcile, remove, resize, tidy, toLayout } from '../shared/tiling.js';

const panelIds = (tree) => toLayout(tree).rects.map((rect) => rect.panelId);
const pair = (a, b) => ({ direction: 'row', sizes: [0.5, 0.5], children: [leaf(a), leaf(b)] });

test('inserting into an empty layout gives a bare leaf', () => {
  assert.deepEqual(insert(null, 'a'), leaf('a'));
});

test('inserting across a panel splits that panel in two', () => {
  assert.deepEqual(insert(leaf('a'), 'b', { nextTo: 'a', direction: 'row' }), pair('a', 'b'));
});

test('inserting down a panel stacks the new one under it', () => {
  assert.deepEqual(insert(pair('a', 'b'), 'c', { nextTo: 'a', direction: 'column' }), {
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [
      { direction: 'column', sizes: [0.5, 0.5], children: [leaf('a'), leaf('c')] },
      leaf('b'),
    ],
  });
});

test('inserting the way its neighbour already runs makes it a sibling', () => {
  assert.deepEqual(insert(pair('a', 'b'), 'c', { nextTo: 'a', direction: 'row' }), {
    direction: 'row',
    sizes: [0.25, 0.25, 0.5],
    children: [leaf('a'), leaf('c'), leaf('b')],
  });
});

test('a panel with no neighbour named goes at the end, sharing evenly', () => {
  assert.deepEqual(insert(pair('a', 'b'), 'c'), {
    direction: 'row',
    sizes: [0.3333, 0.3333, 0.3334],
    children: [leaf('a'), leaf('b'), leaf('c')],
  });
});

test('an unknown neighbour is treated as no neighbour', () => {
  assert.deepEqual(panelIds(insert(pair('a', 'b'), 'c', { nextTo: 'gone' })), ['a', 'b', 'c']);
});

test('inserting a panel the layout already holds changes nothing', () => {
  const tree = pair('a', 'b');
  assert.deepEqual(insert(tree, 'b', { nextTo: 'a' }), tree);
});

test('removing the only panel empties the layout', () => {
  assert.equal(remove(leaf('a'), 'a'), null);
});

test('removing one of a pair gives the whole canvas to the survivor', () => {
  assert.deepEqual(remove(pair('a', 'b'), 'a'), leaf('b'));
});

test('removing from a split of three shares its space out in proportion', () => {
  const tree = { direction: 'row', sizes: [0.2, 0.3, 0.5], children: [leaf('a'), leaf('b'), leaf('c')] };
  assert.deepEqual(remove(tree, 'b'), {
    direction: 'row',
    sizes: [0.2857, 0.7143],
    children: [leaf('a'), leaf('c')],
  });
});

test('removing a panel that is not there changes nothing', () => {
  const tree = pair('a', 'b');
  assert.deepEqual(remove(tree, 'gone'), tree);
});

test('a workspace with no saved layout gets the tidy grid', () => {
  assert.deepEqual(reconcile(null, ['a', 'b', 'c']), tidy(['a', 'b', 'c']));
});

test('reconcile drops panels that have been closed', () => {
  assert.deepEqual(reconcile(pair('a', 'b'), ['b']), leaf('b'));
});

test('reconcile takes in panels the layout has never seen', () => {
  assert.deepEqual(panelIds(reconcile(leaf('a'), ['a', 'b'])), ['a', 'b']);
});

test('reconcile leaves a layout that already matches alone', () => {
  const tree = pair('a', 'b');
  assert.deepEqual(reconcile(tree, ['a', 'b']), tree);
});

test('reconcile of no panels empties the layout', () => {
  assert.equal(reconcile(pair('a', 'b'), []), null);
});

test('dragging a divider moves space from one side to the other', () => {
  assert.deepEqual(resize(pair('a', 'b'), [], 0, 0.2), {
    direction: 'row',
    sizes: [0.7, 0.3],
    children: [leaf('a'), leaf('b')],
  });
});

test('a divider cannot be dragged far enough to make a panel vanish', () => {
  const squashed = resize(pair('a', 'b'), [], 0, 0.9);
  assert.deepEqual(squashed.sizes, [1 - MIN_FRACTION, MIN_FRACTION]);

  const other = resize(pair('a', 'b'), [], 0, -0.9);
  assert.deepEqual(other.sizes, [MIN_FRACTION, 1 - MIN_FRACTION]);
});

test('a divider deeper in the tree is found by its path', () => {
  const tree = {
    direction: 'row',
    sizes: [0.5, 0.5],
    children: [leaf('a'), { direction: 'column', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] }],
  };
  const resized = resize(tree, [1], 0, -0.2);
  assert.deepEqual(resized.children[1].sizes, [0.3, 0.7]);
  assert.deepEqual(resized.sizes, [0.5, 0.5], 'the outer split is untouched');
});
