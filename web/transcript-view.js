// The scrolling list of what was asked, what was done and what came back.
//
// Shared by the Agent tab and the Chat tab: both hold the same kind of
// transcript, built by shared/transcript.js, and both have to redraw it every
// time an event arrives without throwing away where the reader had scrolled to.

import { h } from './dom.js';
import { richText } from './rich-text.js';
import { turnLine } from '/shared/transcript.js';
import { copyButton } from './clipboard.js';

const TOOL_MARK = { running: '·', done: '✓', failed: '✕' };

// An answer is the thing most likely to be wanted somewhere else — pasted into
// a commit message, a file, a reply — and selecting formatted prose by hand
// loses the Markdown it was written in. This copies what was actually written.
function drawAnswer(text) {
  return h('div', { class: 'answer' },
    richText(text),
    copyButton(() => text, { className: 'answer-copy', title: 'Copy this answer' }));
}

export function drawItem(item) {
  if (item.kind === 'said') {
    // What you asked sits in a slab, so the answer reads as the page itself.
    return item.by === 'you' ? h('div', { class: 'bubble' }, item.text) : drawAnswer(item.text);
  }
  if (item.kind === 'thought') return h('div', { class: 'thought' }, 'Thought about it');
  if (item.kind === 'failed') return h('div', { class: 'failed-line' }, item.text);
  if (item.kind === 'done') {
    const { text, title } = turnLine(item);
    return h('div', { class: 'turn-note', title }, text);
  }
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
