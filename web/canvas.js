// The canvas of one workspace: every panel placed from the layout tree, with a
// draggable divider on each seam.
//
// Panels are positioned absolutely rather than nested in split elements, so a
// panel never moves in the DOM and its live terminal is left alone; only its
// style changes. Panels of other workspaces stay alive but hidden, which keeps
// switching workspaces instant and their scrollback intact.

import { resize, toLayout } from '/shared/tiling.js';
import { createPanel } from './panel.js';

// Half the gap between neighbours, in pixels; the other half comes from the
// panel on the other side of the seam.
const HALF_GAP = 5;
const DIVIDER_GRAB = 9;
const WHOLE_CANVAS = { left: 0, top: 0, width: 100, height: 100 };

// Pointer capture is what keeps a drag alive once the pointer leaves the thin
// divider. It can refuse when there is no live pointer, and a drag that is
// already under way must not be left stuck because of it.
function capture(element, pointerId, take) {
  try {
    if (take) element.setPointerCapture(pointerId);
    else element.releasePointerCapture(pointerId);
  } catch {
    // Without capture the drag still works while the pointer stays on the
    // divider, which is enough to finish or abandon it.
  }
}

const from = (percent, pixels) => `calc(${percent}% + ${pixels}px)`;
const span = (percent, pixels) => `calc(${percent}% - ${pixels}px)`;

export function createCanvas(root, emptyElement, actions) {
  const views = new Map();
  const dividers = new Map();
  let tree = null;
  let drag = null;

  function placePanel(element, rect) {
    element.style.left = from(rect.left, HALF_GAP);
    element.style.top = from(rect.top, HALF_GAP);
    element.style.width = span(rect.width, HALF_GAP * 2);
    element.style.height = span(rect.height, HALF_GAP * 2);
  }

  function placeDivider(element, divider) {
    const across = divider.direction === 'row';
    const thickness = `${DIVIDER_GRAB}px`;
    const offset = (DIVIDER_GRAB - 1) / 2;
    element.style.left = across ? from(divider.position, -offset) : from(divider.start, HALF_GAP);
    element.style.top = across ? from(divider.start, HALF_GAP) : from(divider.position, -offset);
    element.style.width = across ? thickness : span(divider.extent, HALF_GAP * 2);
    element.style.height = across ? span(divider.extent, HALF_GAP * 2) : thickness;
  }

  function startDrag(event, divider) {
    if (event.button !== 0) return;
    event.preventDefault();
    const box = root.getBoundingClientRect();
    const across = divider.direction === 'row';
    drag = {
      divider,
      from: tree,
      tree: null,
      origin: across ? event.clientX : event.clientY,
      canvasPx: across ? box.width : box.height,
      element: event.currentTarget,
    };
    root.classList.add('resizing');
    capture(drag.element, event.pointerId, true);
  }

  function onPointerMove(event) {
    if (!drag) return;
    const across = drag.divider.direction === 'row';
    // The seam moves within its own split, which may be only part of the
    // canvas, so scale the drag by that split rather than by the whole width.
    const axisPx = (drag.divider.axisExtent / 100) * drag.canvasPx;
    if (axisPx <= 0) return;
    const moved = (across ? event.clientX : event.clientY) - drag.origin;
    drag.tree = resize(drag.from, drag.divider.path, drag.divider.index, moved / axisPx);
    paint(drag.tree, null);
  }

  function endDrag(event) {
    if (!drag) return;
    const settled = drag.tree;
    capture(drag.element, event.pointerId, false);
    drag = null;
    root.classList.remove('resizing');
    if (settled) actions.setLayout(settled);
    else paint(tree, null);
  }

  // Lays the current tree out over the canvas. Called on every render and on
  // every pointer move while a divider is being dragged.
  function paint(current, maximizedId) {
    const { rects, dividers: seams } = toLayout(current);
    const placed = new Map(rects.map((rect) => [rect.panelId, rect]));

    for (const [panelId, view] of views) {
      const rect = placed.get(panelId);
      // A panel is on screen only if this workspace holds it and nothing else
      // is maximized over it.
      const onScreen = Boolean(rect) && (!maximizedId || panelId === maximizedId);
      view.element.hidden = !onScreen;
      if (onScreen) placePanel(view.element, maximizedId ? WHOLE_CANVAS : rect);
    }

    const wanted = maximizedId ? [] : seams;
    for (const [id, element] of dividers) {
      if (!wanted.some((seam) => seam.id === id)) {
        element.remove();
        dividers.delete(id);
      }
    }
    for (const seam of wanted) {
      let element = dividers.get(seam.id);
      if (!element) {
        element = document.createElement('div');
        dividers.set(seam.id, element);
        root.append(element);
      }
      element.className = `divider ${seam.direction}`;
      element.onpointerdown = (event) => startDrag(event, seam);
      element.onpointermove = onPointerMove;
      element.onpointerup = endDrag;
      element.onpointercancel = endDrag;
      placeDivider(element, seam);
    }
  }

  return {
    render(model) {
      const panels = model.state?.panels ?? [];
      const ids = new Set(panels.map((panel) => panel.id));

      for (const [id, view] of views) {
        if (!ids.has(id)) {
          view.dispose();
          views.delete(id);
        }
      }

      for (const panel of panels) {
        let view = views.get(panel.id);
        if (!view) {
          view = createPanel(panel, actions);
          views.set(panel.id, view);
          root.append(view.element);
        }
        view.update(panel, {
          focused: panel.id === model.focusedPanelId,
          maximized: panel.id === model.maximizedPanelId,
        });
      }

      tree = model.layout;
      const maximizedId = ids.has(model.maximizedPanelId) ? model.maximizedPanelId : null;
      paint(tree, maximizedId);

      emptyElement.hidden = Boolean(tree);
      requestAnimationFrame(() => views.forEach((view) => view.fit()));
    },

    write(panelId, data) {
      views.get(panelId)?.write(data);
    },

    replay(panelId, data) {
      views.get(panelId)?.replay(data);
    },

    reveal(panelId) {
      views.get(panelId)?.focusTerminal();
    },

    // The longer side of a panel is the natural one to split, the way a tiling
    // window manager does it.
    splitDirection(panelId) {
      const rect = toLayout(tree).rects.find((candidate) => candidate.panelId === panelId);
      if (!rect) return 'row';
      const box = root.getBoundingClientRect();
      return rect.width * box.width >= rect.height * box.height ? 'row' : 'column';
    },
  };
}
