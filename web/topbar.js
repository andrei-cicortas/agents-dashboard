// Top bar: app name, sidebar toggle, Agent/Code/Chat switch, arrange, bell.
// The theme and the power switch live in the sidebar account card instead —
// they belong to the window, not to the canvas.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { sameFolder } from '/shared/status.js';

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

  // Which folder the agents on the canvas are working in. The canvas shows one
  // workspace at a time, so without this there is nothing on screen that says
  // which one, and every panel looks the same.
  const workspaceName = h('span', { class: 'workspace-name' });
  const workspace = h('div', { class: 'workspace' }, icon('folder', { size: 13 }), workspaceName);

  root.replaceChildren(
    h('div', { class: 'topbar-left' },
      h('div', { class: 'brand' }, icon('logo', { size: 18 }), 'Agents Dashboard'),
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

      TABS.forEach((tab, index) => {
        const active = model.tab === tab.id;
        buttons[index].classList.toggle('active', active);
        buttons[index].setAttribute('aria-selected', String(active));
      });
    },
  };
}
