// The tiling layout of one workspace, as a tree shared by the UI and the tests.
//
// A node is either a leaf holding one panel:
//   { panelId }
// or a split of two or more children along an axis, with the fractions of the
// parent each child takes (they always add up to 1):
//   { direction: 'row' | 'column', sizes: [...], children: [...] }
//
// 'row' places children side by side, 'column' stacks them. An empty layout is
// null. Every function here is pure: it returns a new tree and never mutates
// the one it was given.

import { gridSize } from './layout.js';

export const leaf = (panelId) => ({ panelId });

export const isLeaf = (node) => Object.hasOwn(node, 'panelId');

// Percentages are only ever used for display, so trim the noise that binary
// floating point leaves behind (0.3 * 100 is not exactly 30).
const round = (value) => Math.round(value * 1e4) / 1e4;

// Sizes are kept rounded and always add up to exactly 1, so a layout that has
// been dragged and rebuilt many times cannot drift.
export const MIN_FRACTION = 0.05;

function normalize(sizes) {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const out = sizes.map((size) => round(size / total));
  out[out.length - 1] = round(1 - out.slice(0, -1).reduce((sum, size) => sum + size, 0));
  return out;
}

const evenSizes = (count) => normalize(Array.from({ length: count }, () => 1));

const split = (direction, children, sizes) => ({ direction, sizes: sizes ?? evenSizes(children.length), children });

export function panelsOf(node) {
  if (!node) return [];
  return isLeaf(node) ? [node.panelId] : node.children.flatMap(panelsOf);
}

const contains = (node, panelId) => panelsOf(node).includes(panelId);

// Builds the same near-square grid the dashboard used before panels could be
// dragged, so "Tidy" is a return to that familiar arrangement.
export function tidy(panelIds) {
  if (panelIds.length === 0) return null;
  if (panelIds.length === 1) return leaf(panelIds[0]);

  const { columns } = gridSize(panelIds.length);
  const rows = [];
  for (let index = 0; index < panelIds.length; index += columns) {
    const row = panelIds.slice(index, index + columns).map(leaf);
    rows.push(row.length === 1 ? row[0] : { direction: 'row', sizes: evenSizes(row.length), children: row });
  }
  if (rows.length === 1) return rows[0];
  return { direction: 'column', sizes: evenSizes(rows.length), children: rows };
}

// Flattens the tree into the rectangles each panel occupies and the dividers
// that sit between them, all as percentages of the canvas.
export function toLayout(tree) {
  const rects = [];
  const dividers = [];

  function walk(node, box, path) {
    if (isLeaf(node)) {
      rects.push({
        panelId: node.panelId,
        left: round(box.left),
        top: round(box.top),
        width: round(box.width),
        height: round(box.height),
      });
      return;
    }

    const across = node.direction === 'row';
    const total = across ? box.width : box.height;
    const boxes = [];
    let offset = across ? box.left : box.top;
    for (const size of node.sizes) {
      const extent = total * size;
      boxes.push(across
        ? { left: offset, top: box.top, width: extent, height: box.height }
        : { left: box.left, top: offset, width: box.width, height: extent });
      offset += extent;
    }

    // A divider sits on each seam between neighbours, spanning the parent.
    for (let index = 0; index < boxes.length - 1; index += 1) {
      const before = boxes[index];
      dividers.push({
        id: `${path.join('/')}/${index}`,
        direction: node.direction,
        path,
        index,
        position: round(across ? before.left + before.width : before.top + before.height),
        start: round(across ? box.top : box.left),
        extent: round(across ? box.height : box.width),
      });
    }

    boxes.forEach((childBox, index) => walk(node.children[index], childBox, [...path, index]));
  }

  if (tree) walk(tree, { left: 0, top: 0, width: 100, height: 100 }, []);
  return { rects, dividers };
}

// ---------- Editing the tree ----------

function insertNextTo(node, panelId, nextTo, direction) {
  if (isLeaf(node)) {
    return node.panelId === nextTo ? split(direction, [node, leaf(panelId)]) : node;
  }

  const index = node.children.findIndex((child) => isLeaf(child) && child.panelId === nextTo);
  if (index !== -1 && node.direction === direction) {
    // The neighbour already runs this way, so share its space with a sibling
    // rather than nesting another split inside it.
    const half = node.sizes[index] / 2;
    const sizes = [...node.sizes];
    sizes.splice(index, 1, half, half);
    const children = [...node.children];
    children.splice(index + 1, 0, leaf(panelId));
    return split(node.direction, children, normalize(sizes));
  }

  return split(node.direction, node.children.map((child) => insertNextTo(child, panelId, nextTo, direction)), node.sizes);
}

function append(node, panelId) {
  if (isLeaf(node)) return split('row', [node, leaf(panelId)]);
  const count = node.children.length;
  const sizes = [...node.sizes.map((size) => (size * count) / (count + 1)), 1 / (count + 1)];
  return split(node.direction, [...node.children, leaf(panelId)], normalize(sizes));
}

// Adds a panel beside `nextTo`, splitting it along `direction`. Without a
// usable neighbour the panel goes at the end of the top-level split.
export function insert(tree, panelId, { nextTo = null, direction = 'row' } = {}) {
  if (!tree) return leaf(panelId);
  if (contains(tree, panelId)) return tree;
  if (nextTo && contains(tree, nextTo)) return insertNextTo(tree, panelId, nextTo, direction);
  return append(tree, panelId);
}

// Takes a panel out; its space goes to its siblings in proportion, and a split
// left with a single child is replaced by that child.
export function remove(tree, panelId) {
  if (!tree) return null;
  if (isLeaf(tree)) return tree.panelId === panelId ? null : tree;

  const children = [];
  const sizes = [];
  tree.children.forEach((child, index) => {
    const kept = remove(child, panelId);
    if (kept) {
      children.push(kept);
      sizes.push(tree.sizes[index]);
    }
  });

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return split(tree.direction, children, normalize(sizes));
}

// Brings a saved layout back in line with the panels that actually exist.
// Panels appear and disappear from several places, so this runs on every
// render and is the only thing keeping the two from drifting apart.
export function reconcile(tree, panelIds) {
  if (panelIds.length === 0) return null;
  if (!tree) return tidy(panelIds);

  const wanted = new Set(panelIds);
  let next = tree;
  for (const panelId of panelsOf(tree)) {
    if (!wanted.has(panelId)) next = remove(next, panelId);
  }
  if (!next) return tidy(panelIds);

  for (const panelId of panelIds) {
    if (!contains(next, panelId)) next = insert(next, panelId);
  }
  return next;
}

function mapAt(node, path, change) {
  if (path.length === 0) return change(node);
  const [head, ...rest] = path;
  const children = [...node.children];
  children[head] = mapAt(children[head], rest, change);
  return split(node.direction, children, node.sizes);
}

// Moves the seam after `index` by `delta`, as a fraction of the split's own
// box. Neither neighbour can be squeezed below MIN_FRACTION.
export function resize(tree, path, index, delta) {
  return mapAt(tree, path, (node) => {
    const shared = node.sizes[index] + node.sizes[index + 1];
    const first = Math.min(Math.max(node.sizes[index] + delta, MIN_FRACTION), shared - MIN_FRACTION);
    const sizes = [...node.sizes];
    sizes[index] = first;
    sizes[index + 1] = shared - first;
    return split(node.direction, node.children, normalize(sizes));
  });
}
