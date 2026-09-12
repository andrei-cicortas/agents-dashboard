// The card at the foot of the sidebar: who is at this PC, what is running, and
// the two settings that belong to the window rather than to any agent.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { isActive } from '/shared/status.js';
import { THEMES } from '/shared/themes.js';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function createAccount(root, actions) {
  const avatar = h('span', { class: 'avatar' });
  const name = h('span', { class: 'account-name' });
  const meta = h('span', { class: 'account-meta' });

  const themeButton = h('button', {
    class: 'icon-button',
    title: 'Colour theme',
    onClick: () => openMenu(themeButton, THEMES.map((theme) => ({
      label: theme.name,
      onSelect: () => actions.setTheme(theme.id),
    }))),
  }, icon('moon', { size: 15 }));

  const settingsButton = h('button', {
    class: 'icon-button',
    title: 'Settings',
    onClick: () => openMenu(settingsButton, [
      { label: 'Add a project folder', onSelect: () => actions.addProject() },
      { label: 'Stop all agents and close', onSelect: () => actions.stopAll() },
    ]),
  }, icon('settings', { size: 15 }));

  root.replaceChildren(
    avatar,
    h('div', { class: 'account-text' }, name, meta),
    h('div', { class: 'account-actions' }, themeButton, settingsButton));

  return {
    render(model) {
      const { state } = model;
      if (!state) return;
      const who = state.user?.name || 'Local';
      avatar.textContent = who.slice(0, 1).toUpperCase();
      name.textContent = who;
      const running = state.panels.filter(isActive).length;
      const busy = (state.threads ?? []).filter((thread) => thread.status === 'working').length;
      meta.textContent = model.tab === 'agent'
        ? `${busy} working · ${plural((state.profiles ?? []).length, 'agent')}`
        : `${running} running · ${plural(state.projects.length, 'folder')}`;
    },
  };
}
