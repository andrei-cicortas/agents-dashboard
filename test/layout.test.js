import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridSize, MAX_COLUMNS, MAX_VISIBLE_ROWS } from '../shared/layout.js';

test('constants match the spec', () => {
  assert.equal(MAX_COLUMNS, 4);
  assert.equal(MAX_VISIBLE_ROWS, 3);
});

test('gridSize arranges panels in a near-square grid capped at 4 columns', () => {
  const cases = [
    [0, 0, 0],
    [1, 1, 1],
    [2, 2, 1],
    [3, 2, 2],
    [4, 2, 2],
    [5, 3, 2],
    [9, 3, 3],
    [10, 4, 3],
    [12, 4, 3],
    [13, 4, 4],
    [17, 4, 5],
  ];
  for (const [count, columns, rows] of cases) {
    assert.deepEqual(gridSize(count), { columns, rows }, `count=${count}`);
  }
});
