// The box you type a message into, shared by the Agent and Chat tabs.
//
// It keeps a draft per conversation. Without that, half a sentence meant for
// one chat is still sitting there after clicking another, and Enter sends it
// to the wrong one.

import { h } from './dom.js';
import { icon } from './icons.js';

const MAX_HEIGHT = 160;

export function createComposer({ placeholder, onSend }) {
  const box = h('textarea', { class: 'composer', rows: '1', placeholder });
  const sendButton = h('button', { class: 'icon-button send', title: 'Send' }, icon('send', { size: 15 }));
  const row = h('div', { class: 'composer-row' }, box, sendButton);

  const drafts = new Map();
  // Which conversation what is in the box belongs to.
  let owner = null;

  function grow() {
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT)}px`;
  }

  function send() {
    const text = box.value.trim();
    if (!text || box.disabled) return;
    box.value = '';
    drafts.delete(owner);
    grow();
    onSend(text);
  }

  box.addEventListener('keydown', (event) => {
    // Enter sends, as it does in every chat; a newline needs Shift.
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    send();
  });
  box.addEventListener('input', () => {
    grow();
    if (box.value) drafts.set(owner, box.value);
    else drafts.delete(owner);
  });
  sendButton.addEventListener('click', send);

  return {
    element: row,
    focus: () => box.focus(),

    // Says which conversation is on screen. Anything half-typed stays with the
    // one it was meant for, and comes back on returning to it.
    own(id) {
      if (id === owner) return;
      if (box.value) drafts.set(owner, box.value);
      owner = id;
      box.value = drafts.get(id) ?? '';
      grow();
    },

    // While a turn is in flight there is nothing useful to type.
    setWorking(working, workingText = 'Working…') {
      box.disabled = working;
      box.placeholder = working ? workingText : placeholder;
      sendButton.hidden = working;
    },
  };
}
