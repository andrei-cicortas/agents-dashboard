// The list of chats, in the sidebar, while the Chat tab is open.
//
// Newest first, because the one you want is nearly always the one you had last.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { timeAgo } from '/shared/time-ago.js';

export function createChatRail(root, actions) {
  const list = h('div', { class: 'sidebar-scroll' });
  const addButton = h('button', {
    class: 'icon-button',
    title: 'New chat',
    onClick: () => actions.newChat(),
  }, icon('plus'));

  root.replaceChildren(
    h('div', { class: 'sidebar-header' }, h('span', { class: 'title' }, 'Chats'), addButton),
    list);

  function row(chat, selected, now) {
    const more = h('button', {
      class: 'icon-button',
      title: 'This chat',
      onClick: (event) => {
        event.stopPropagation();
        openMenu(more, [
          { label: 'Rename…', onSelect: () => actions.renameChat(chat.id) },
          { label: 'Delete this chat', onSelect: () => actions.removeChat(chat.id) },
        ]);
      },
    }, icon('more', { size: 14 }));

    return h('div', {
      class: `chat-row${selected ? ' selected' : ''}`,
      title: chat.title,
      onClick: () => actions.selectChat(chat.id),
    },
      h('div', { class: 'chat-lines' },
        h('span', { class: 'chat-name' }, chat.title),
        h('span', { class: 'chat-when' },
          chat.status === 'working' ? 'Answering…' : timeAgo(chat.at, now))),
      h('div', { class: 'chat-row-actions' }, more));
  }

  return {
    render(model) {
      const { state } = model;
      if (!state) return;
      const chats = [...(state.chats ?? [])].reverse();
      const now = new Date();
      list.replaceChildren(...(chats.length
        ? chats.map((chat) => row(chat, chat.id === model.selectedChatId, now))
        : [h('div', { class: 'sidebar-empty' }, 'No chats yet. Ask something on the right.')]));
    },
  };
}
