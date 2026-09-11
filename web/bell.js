// Bell button with unread badge and a dropdown list of notifications.

import { h } from './dom.js';
import { icon } from './icons.js';
import { notificationText } from '/shared/labels.js';
import { timeAgo } from '/shared/time-ago.js';

export function createBell(mount, actions) {
  const badge = h('span', { class: 'badge' });
  badge.hidden = true;
  const button = h('button', { class: 'icon-button bell', title: 'Notifications', onClick: () => toggle() }, icon('bell'), badge);
  const dropdown = h('div', { class: 'bell-dropdown' });
  dropdown.hidden = true;
  mount.replaceChildren(button);
  document.body.append(dropdown);

  let lastModel = null;

  function close() {
    dropdown.hidden = true;
  }

  function toggle() {
    dropdown.hidden = !dropdown.hidden;
    if (!dropdown.hidden && lastModel?.state) renderList(lastModel.state);
  }

  document.addEventListener('pointerdown', (event) => {
    if (!dropdown.hidden && !dropdown.contains(event.target) && !button.contains(event.target)) close();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  function renderList(state) {
    const now = new Date();
    const items = state.notifications.map((notification) => {
      const panel = state.panels.find((candidate) => candidate.id === notification.panelId);
      return h('button', {
        class: `notification${notification.read ? '' : ' unread'}`,
        onClick: () => {
          close();
          actions.openNotification(notification);
        },
      },
      h('span', { class: `dot${notification.read ? '' : ' unread-dot'}` }),
      h('span', { class: 'notification-body' },
        h('div', {}, notificationText(notification, panel)),
        h('div', { class: 'time' }, timeAgo(notification.at, now))));
    });

    dropdown.replaceChildren(
      h('div', { class: 'bell-head' },
        'Notifications',
        h('button', { class: 'link-button', disabled: state.unread === 0, onClick: () => actions.readAllNotifications() }, 'Mark all read')),
      items.length ? h('div', {}, items) : h('div', { class: 'bell-empty' }, 'No notifications yet'),
    );
  }

  return {
    render(model) {
      lastModel = model;
      const unread = model.state?.unread ?? 0;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.hidden = unread === 0;
      if (!dropdown.hidden && model.state) renderList(model.state);
    },
  };
}
