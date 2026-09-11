// Arranges panels in a grid (max 4 columns, 3 rows visible, then scroll).

import { gridSize, MAX_VISIBLE_ROWS } from '/shared/layout.js';
import { createPanel } from './panel.js';

const MIN_PANEL_HEIGHT = 220;

export function createGrid(root, emptyElement, actions) {
  const views = new Map();
  let visibleCount = 0;

  function applyLayout() {
    const { columns, rows } = gridSize(visibleCount);
    root.style.gridTemplateColumns = columns ? `repeat(${columns}, minmax(0, 1fr))` : '';
    if (rows <= MAX_VISIBLE_ROWS) {
      root.style.gridTemplateRows = rows ? `repeat(${rows}, minmax(0, 1fr))` : '';
      return;
    }
    const style = getComputedStyle(root);
    const gap = parseFloat(style.rowGap) || 0;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const available = root.clientHeight - padding - gap * (MAX_VISIBLE_ROWS - 1);
    const rowHeight = Math.max(MIN_PANEL_HEIGHT, Math.floor(available / MAX_VISIBLE_ROWS));
    root.style.gridTemplateRows = `repeat(${rows}, ${rowHeight}px)`;
  }

  window.addEventListener('resize', applyLayout);

  function render(model) {
    const panels = model.state?.panels ?? [];
    const ids = new Set(panels.map((panel) => panel.id));

    for (const [id, view] of views) {
      if (!ids.has(id)) {
        view.dispose();
        views.delete(id);
      }
    }

    const maximizedId = ids.has(model.maximizedPanelId) ? model.maximizedPanelId : null;
    panels.forEach((panel, index) => {
      let view = views.get(panel.id);
      if (!view) {
        view = createPanel(panel, actions);
        views.set(panel.id, view);
      }
      // Move the element only when the order is wrong; moving a live terminal is costly.
      if (root.children[index] !== view.element) root.insertBefore(view.element, root.children[index] ?? null);
      const maximized = panel.id === maximizedId;
      view.update(panel, { focused: panel.id === model.focusedPanelId, maximized });
      view.element.hidden = Boolean(maximizedId) && !maximized;
    });

    visibleCount = maximizedId ? 1 : panels.length;
    applyLayout();
    emptyElement.hidden = panels.length > 0;
    requestAnimationFrame(() => views.forEach((view) => view.fit()));
  }

  return {
    render,
    write(panelId, data) {
      views.get(panelId)?.write(data);
    },
    replay(panelId, data) {
      views.get(panelId)?.replay(data);
    },
    reveal(panelId) {
      const view = views.get(panelId);
      if (!view) return;
      view.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      view.focusTerminal();
    },
  };
}
