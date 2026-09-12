// The Chat tab: a conversation with Claude and nothing else behind it.
//
// The other two tabs are about a folder — a terminal working in one, an agent
// answering about one. This one is for everything that comes up in between:
// what a flag does, how to word a commit, whether an approach is sensible. It
// has no folder, cannot read a file and cannot run a command, so there is
// nothing to set up before asking.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { createTranscript } from './transcript-view.js';

const STATUS = {
  idle: { label: 'Ready', tone: 'ready' },
  working: { label: 'Answering', tone: 'working' },
  failed: { label: 'Needs you', tone: 'failed' },
};

const MODEL_NAMES = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' };
const MODEL_NOTE = {
  opus: 'Opus — the deepest thinker, and the slowest',
  sonnet: 'Sonnet — the everyday one',
  haiku: 'Haiku — the quickest, for small questions',
};

// Something to click on an empty screen, so the first chat needs no ideas.
const OPENERS = [
  'Explain what a pseudo-terminal is, in plain words',
  'What should I look for when reviewing a pull request?',
  'Write a short commit message for a bug fix',
];

export function createChatView(root, actions) {
  const title = h('span', { class: 'agent-title' });
  const subtitle = h('span', { class: 'agent-powered' });
  const statusPill = h('span', { class: 'status-pill' });
  const modelSelect = h('select', { class: 'model-select', title: 'Which model answers' });
  const more = h('button', { class: 'icon-button', title: 'This chat' }, icon('more', { size: 15 }));
  const transcript = createTranscript({ empty: 'Nothing yet. Ask it something.' });

  const composer = h('textarea', { class: 'composer', rows: '1', placeholder: 'Ask anything' });
  const sendButton = h('button', { class: 'icon-button send', title: 'Send' }, icon('send', { size: 15 }));
  const composerRow = h('div', { class: 'composer-row' }, composer, sendButton);
  const footNote = h('div', { class: 'agent-foot plain' });

  const openers = h('div', { class: 'openers' }, OPENERS.map((text) => h('button', {
    class: 'opener',
    onClick: () => {
      transcript.follow();
      actions.sendChat(text);
    },
  }, text)));

  const panel = h('div', { class: 'agent-panel' },
    h('div', { class: 'agent-head' },
      h('div', { class: 'agent-head-text' }, title, subtitle),
      modelSelect,
      statusPill,
      more),
    transcript.element,
    openers,
    composerRow,
    footNote);

  root.replaceChildren(panel);

  // What the view is looking at, so handlers do not close over a stale render.
  let chat = null;

  function send() {
    const text = composer.value.trim();
    if (!text || chat?.status === 'working') return;
    composer.value = '';
    composer.style.height = 'auto';
    transcript.follow();
    actions.sendChat(text);
  }

  composer.addEventListener('keydown', (event) => {
    // Enter sends, as it does in every chat; a newline needs Shift.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  composer.addEventListener('input', () => {
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
  });
  sendButton.addEventListener('click', send);

  modelSelect.addEventListener('change', () => {
    if (chat) actions.setChatModel(chat.id, modelSelect.value);
    else actions.setNextChatModel(modelSelect.value);
  });

  more.addEventListener('click', () => {
    if (!chat) return;
    openMenu(more, [
      { label: 'New chat', onSelect: () => actions.newChat() },
      { label: 'Rename…', onSelect: () => actions.renameChat(chat.id) },
      { label: 'Delete this chat', onSelect: () => actions.removeChat(chat.id) },
    ]);
  });

  return {
    // Called when the tab is opened, so typing can start straight away.
    focus() {
      composer.focus();
    },

    render(model) {
      const { state } = model;
      if (!state) return;
      chat = (state.chats ?? []).find((one) => one.id === model.selectedChatId) ?? null;
      const chosenModel = chat?.model ?? model.nextChatModel;

      const models = state.chatModels ?? [];
      const drawn = [...modelSelect.options].map((option) => option.value).join(',');
      if (drawn !== models.join(',')) {
        modelSelect.replaceChildren(...models.map((id) => h('option', { value: id }, MODEL_NAMES[id] ?? id)));
      }
      modelSelect.value = chosenModel;
      modelSelect.title = MODEL_NOTE[chosenModel] ?? 'Which model answers';

      title.textContent = chat ? chat.title : 'New chat';
      subtitle.textContent = 'Claude, with no folder and no tools but the web';
      more.hidden = !chat;

      const status = STATUS[chat?.status ?? 'idle'] ?? STATUS.idle;
      statusPill.className = `status-pill ${status.tone}`;
      statusPill.replaceChildren(h('span', { class: 'dot' }), status.label);

      if (chat) transcript.show(chat);
      else {
        transcript.element.replaceChildren(h('div', { class: 'chat-blank' },
          h('div', { class: 'empty-title' }, 'Ask anything'),
          h('div', { class: 'empty-text' }, 'This one has no folder and touches nothing. It is here for the questions that come up while the agents work.')));
        transcript.reset();
      }
      // The openers are a way to start, not a menu; once there is a
      // conversation they would only be in the way.
      openers.hidden = Boolean(chat);

      const working = chat?.status === 'working';
      composer.disabled = working;
      composer.placeholder = working ? 'Answering…' : 'Ask anything';
      sendButton.hidden = working;
      footNote.replaceChildren(
        h('span', {}, 'Enter sends · Shift+Enter starts a new line'),
        working
          ? h('button', { class: 'link-button', onClick: () => actions.cancelChat(chat.id) }, 'Stop')
          : h('span', {}));
    },
  };
}
