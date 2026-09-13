// Top bar: app name, sidebar toggle, Agent/Code/Chat switch, arrange, bell.
// The theme and the power switch live in the sidebar account card instead —
// they belong to the window, not to the canvas.

import { h } from './dom.js';
import { appLogo, icon } from './icons.js';
import { openMenu } from './menu.js';
import { sameFolder } from '/shared/status.js';
import { TAB_OF_KIND } from '/shared/labels.js';

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
  // A dot on the tab, so news on a tab you are not looking at is visible
  // without opening the bell to find out which one it was.
  const dots = TABS.map(() => h('span', { class: 'tab-dot' }));
  const buttons = TABS.map((tab, index) => h('button', {
    class: 'tab',
    role: 'tab',
    onClick: () => actions.setTab(tab.id),
  }, tab.label, dots[index]));

  // Which folder the agents on the canvas are working in. The canvas shows one
  // workspace at a time, so without this there is nothing on screen that says
  // which one, and every panel looks the same.
  const workspaceName = h('span', { class: 'workspace-name' });
  const workspace = h('div', { class: 'workspace' }, icon('folder', { size: 13 }), workspaceName);

  root.replaceChildren(
    h('div', { class: 'topbar-left' },
      h('div', { class: 'brand' }, appLogo({ size: 20 }), 'Agents Dashboard'),
      h('button', { class: 'icon-button', title: 'Toggle sidebar', onClick: () => actions.toggleSidebar() }, icon('sidebar')),
      workspace),
    h('div', { class: 'tabs', role: 'tablist' }, buttons),
    h('div', { class: 'topbar-right' }, layoutButton, bellMount),
  );

  return {
    bellMount,
    render(model) {
      const open = model.state?.projects?.find((project) => sameFolder(project.path, model.selectedWorkspace ?? ''));
      // Only the Code tab has a canvas tied to a folder.
      workspace.hidden = model.tab !== 'code';
      workspaceName.textContent = open ? open.name : 'No folder open';
      workspace.title = open ? `The agents below work in ${open.path}` : 'Click a folder on the left to open it';
      workspace.classList.toggle('empty', !open);

      // Unread notifications, counted against the tab each came from.
      const waiting = {};
      for (const notification of model.state?.notifications ?? []) {
        if (notification.read) continue;
        const tab = TAB_OF_KIND[notification.kind];
        if (tab) waiting[tab] = (waiting[tab] ?? 0) + 1;
      }

      TABS.forEach((tab, index) => {
        const active = model.tab === tab.id;
        buttons[index].classList.toggle('active', active);
        buttons[index].setAttribute('aria-selected', String(active));
        const count = active ? 0 : (waiting[tab.id] ?? 0);
        dots[index].hidden = count === 0;
        buttons[index].title = count ? `${count} waiting on ${tab.label}` : '';
      });
    },
  };
}
