import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLayouts } from '../shared/layout-sync.js';

const GAME = 'C:\\Games\\my game';
const SHOP = 'C:\\Work\\shop';
const oneUp = { panelId: 'p1' };
const twoUp = { direction: 'row', sizes: [0.5, 0.5], children: [{ panelId: 'p1' }, { panelId: 'p2' }] };

test('with nothing in flight the server is taken at its word', () => {
  assert.deepEqual(mergeLayouts({ [GAME]: oneUp }, {}), {
    layouts: { [GAME]: oneUp },
    acknowledged: [],
  });
});

test('a layout we sent and got back again is no longer in flight', () => {
  const pending = { [GAME]: JSON.stringify(twoUp) };
  assert.deepEqual(mergeLayouts({ [GAME]: twoUp }, pending), {
    layouts: { [GAME]: twoUp },
    acknowledged: [GAME],
  });
});

test('a layout still in flight outlives an older one from the server', () => {
  // This is the race: the server sends state for another reason (an agent
  // changing status) while our own layout:set is still on its way there.
  const pending = { [GAME]: JSON.stringify(twoUp) };
  const merged = mergeLayouts({ [GAME]: oneUp }, pending);
  assert.deepEqual(merged.layouts[GAME], twoUp, 'ours wins until it comes back');
  assert.deepEqual(merged.acknowledged, []);
});

test('workspaces we never touched are left as the server has them', () => {
  const pending = { [GAME]: JSON.stringify(twoUp) };
  const merged = mergeLayouts({ [GAME]: oneUp, [SHOP]: oneUp }, pending);
  assert.deepEqual(merged.layouts[SHOP], oneUp);
});

test('a layout we cleared stays cleared until the server agrees', () => {
  const pending = { [GAME]: JSON.stringify(null) };
  const merged = mergeLayouts({ [GAME]: oneUp }, pending);
  assert.equal(merged.layouts[GAME], null);
  assert.deepEqual(merged.acknowledged, []);

  const settled = mergeLayouts({}, pending);
  assert.equal(Object.hasOwn(settled.layouts, GAME), false, 'the workspace is left without a layout');
  assert.deepEqual(settled.acknowledged, [GAME], 'the server dropping it is the answer we waited for');
});
