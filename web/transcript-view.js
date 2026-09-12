// The scrolling list of what was asked, what was done and what came back.
//
// Shared by the Agent tab and the Chat tab: both hold the same kind of
// transcript, built by shared/transcript.js, and both have to redraw it every
// time an event arrives without throwing away where the reader had scrolled to.

import { h } from './dom.js';
import { richText } from './rich-text.js';

const TOOL_MARK = { running: '·', done: '✓', failed: '✕' };

export function drawItem(item) {
  if (item.kind === 'said') {
    // What you asked sits in a slab, so the answer reads as the page itself.
    return item.by === 'you' ? h('div', { class: 'bubble' }, item.text) : richText(item.text);
  }
  if (item.kind === 'thought') return h('div', { class: 'thought' }, 'Thought about it');
  if (item.kind === 'failed') return h('div', { class: 'failed-line' }, item.text);
  return h('div', { class: `tool-line ${item.status}` },
    h('span', { class: 'tool-mark' }, TOOL_MARK[item.status] ?? '·'),
    h('span', { class: 'tool-verb' }, item.verb),
    h('span', { class: 'tool-detail' }, item.detail));
}

export function createTranscript({ empty = 'Nothing yet.' } = {}) {
  const element = h('div', { class: 'transcript' });
  // Follow the answer as it arrives, unless the reader has scrolled up.
  let stickToBottom = true;
  let shownKey = '';

  element.addEventListener('scroll', () => {
    const room = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottom = room < 40;
  });

  return {
    element,

    // Called when a message has just been sent, so the new one is in view even
    // if the reader had scrolled back through the conversation.
    follow() {
      stickToBottom = true;
    },

    // Redrawing only when something actually changed keeps the scroll position
    // and stops the copy buttons flickering under the pointer.
    show({ id, items = [], status = 'idle' }) {
      const key = `${id}|${items.length}|${status}|${JSON.stringify(items.at(-1) ?? null)}`;
      if (key === shownKey) return;
      shownKey = key;
      const drawn = items.length ? items.map(drawItem) : [h('div', { class: 'empty-text' }, empty)];
      // Between sending and the first words coming back there is nothing to
      // show, and silence reads as a dashboard that has stopped working.
      if (status === 'working') drawn.push(h('div', { class: 'waiting' }, 'Thinking…'));
      element.replaceChildren(...drawn);
      if (stickToBottom) element.scrollTop = element.scrollHeight;
    },

    // Forget what is on screen, so the next show() draws even if it happens to
    // produce the same key (a different conversation with the same shape).
    reset() {
      shownKey = '';
    },
  };
}
