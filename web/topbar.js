// Top bar: app name, sidebar toggle, Code/Chat tabs, bell mount, Stop all.

import { h } from './dom.js';
import { icon } from './icons.js';

export function createTopbar(root, actions) {
  const bellMount = h('div', { class: 'bell-mount' });
  const codeTab = h('button', { class: 'tab', role: 'tab', onClick: () => actions.setTab('code') }, 'Code');
  const chatTab = h('button', { class: 'tab', role: 'tab', onClick: () => actions.setTab('chat') }, 'Chat');

  root.replaceChildren(
    h('div', { class: 'topbar-left' },
      h('div', { class: 'brand' }, icon('logo', { size: 18 }), 'Agents Dashboard'),
      h('button', { class: 'icon-button', title: 'Toggle sidebar', onClick: () => actions.toggleSidebar() }, icon('sidebar'))),
    h('div', { class: 'tabs', role: 'tablist' }, codeTab, chatTab),
    h('div', { class: 'topbar-right' },
      bellMount,
      h('button', { class: 'icon-button', title: 'Stop all agents and close the dashboard', onClick: () => actions.stopAll() }, icon('power'))),
  );

  return {
    bellMount,
    render(model) {
      codeTab.classList.toggle('active', model.tab === 'code');
      chatTab.classList.toggle('active', model.tab === 'chat');
    },
  };
}
