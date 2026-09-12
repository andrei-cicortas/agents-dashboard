// Top bar: app name, sidebar toggle, Agent/Code/Chat switch, arrange, bell.
// The theme and the power switch live in the sidebar account card instead —
// they belong to the window, not to the canvas.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';

const TABS = [
  { id: 'agent', label: 'Agent' },
  { id: 'code', label: 'Code' },
  { id: 'chat', label: 'Chat' },
];

export function createTopbar(root, actions) {
  const bellMount = h('div', { class: 'bell-mount' });
  const layoutButton = h('button', {
    class: 'icon-button',
    title: 'Arrange the panels',
    onClick: () => openMenu(layoutButton, [
      { label: 'Tidy', onSelect: () => actions.tidyLayout() },
      { label: '1 column', onSelect: () => actions.tidyLayout(1) },
      { label: '2 columns', onSelect: () => actions.tidyLayout(2) },
      { label: '3 columns', onSelect: () => actions.tidyLayout(3) },
      { label: '4 columns', onSelect: () => actions.tidyLayout(4) },
    ]),
  }, icon('layout'));
  const buttons = TABS.map((tab) => h('button', {
    class: 'tab',
    role: 'tab',
    onClick: () => actions.setTab(tab.id),
  }, tab.label));

  root.replaceChildren(
    h('div', { class: 'topbar-left' },
      h('div', { class: 'brand' }, icon('logo', { size: 18 }), 'Agents Dashboard'),
      h('button', { class: 'icon-button', title: 'Toggle sidebar', onClick: () => actions.toggleSidebar() }, icon('sidebar'))),
    h('div', { class: 'tabs', role: 'tablist' }, buttons),
    h('div', { class: 'topbar-right' }, layoutButton, bellMount),
  );

  return {
    bellMount,
    render(model) {
      TABS.forEach((tab, index) => {
        const active = model.tab === tab.id;
        buttons[index].classList.toggle('active', active);
        buttons[index].setAttribute('aria-selected', String(active));
      });
    },
  };
}
