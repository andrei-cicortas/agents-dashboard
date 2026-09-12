// Ctrl+K: one box that finds anything in the app and goes there.
//
// A folder, a terminal, a named agent, a chat — and the handful of things you
// might want to start — all in one list, whichever tab you happen to be on.

import { h } from './dom.js';
import { icon } from './icons.js';
import { paletteItems, rank } from '/shared/palette.js';

const ICON_OF_KIND = {
  command: 'send',
  workspace: 'folder',
  panel: 'terminal',
  agent: 'spark',
  chat: 'message',
};

export function createPalette(actions) {
  const input = h('input', {
    class: 'palette-input',
    type: 'text',
    spellcheck: 'false',
    placeholder: 'Go to a folder, a terminal, an agent, a chat…',
  });
  const list = h('div', { class: 'palette-list' });
  const box = h('div', { class: 'palette' },
    h('div', { class: 'palette-bar' }, icon('chevronRight', { size: 14 }), input),
    list,
    h('div', { class: 'palette-foot' }, '↑↓ to move · Enter to go · Esc to close'));
  const backdrop = h('div', { class: 'palette-backdrop' }, box);
  backdrop.hidden = true;
  document.body.append(backdrop);

  // What is on screen now, and which of it is picked.
  let shown = [];
  let at = 0;
  let model = null;
  let commands = [];

  function draw() {
    at = Math.max(0, Math.min(at, shown.length - 1));
    list.replaceChildren(...(shown.length
      ? shown.map((item, index) => {
        const row = h('div', {
          class: `palette-row${index === at ? ' picked' : ''}`,
          onClick: () => choose(item),
          onMousemove: () => {
            if (at === index) return;
            at = index;
            draw();
          },
        },
          icon(ICON_OF_KIND[item.kind] ?? 'chevronRight', { size: 13 }),
          h('span', { class: 'palette-label' }, item.label),
          h('span', { class: 'palette-hint' }, item.hint));
        return row;
      })
      : [h('div', { class: 'palette-empty' }, 'Nothing by that name')]));
    list.children[at]?.scrollIntoView({ block: 'nearest' });
  }

  function refresh() {
    shown = rank(paletteItems(model?.state ?? {}, commands), input.value);
    draw();
  }

  function close() {
    backdrop.hidden = true;
    input.value = '';
  }

  function choose(item) {
    close();
    actions.openPaletteItem(item);
  }

  input.addEventListener('input', () => {
    at = 0;
    refresh();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return close();
    if (event.key === 'Enter') {
      event.preventDefault();
      if (shown[at]) choose(shown[at]);
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    if (!shown.length) return;
    // Round the ends, the way a menu does.
    at = (at + step + shown.length) % shown.length;
    draw();
  });

  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) close();
  });

  return {
    isOpen: () => !backdrop.hidden,

    open() {
      backdrop.hidden = false;
      at = 0;
      refresh();
      input.focus();
    },

    close,

    // The palette reads the model when it opens rather than on every render,
    // but it has to be given one to read.
    render(next, availableCommands) {
      model = next;
      commands = availableCommands;
      if (!backdrop.hidden) refresh();
    },
  };
}
