// Drawing what shared/markdown.js read.
//
// Everything here is built with createElement and text nodes, never innerHTML,
// so a paragraph an agent wrote can hold angle brackets, ampersands or a whole
// HTML page and still arrive on screen as the words it was.

import { h } from './dom.js';
import { parseBlocks } from '/shared/markdown.js';

function drawSpans(spans) {
  return spans.map((span) => {
    switch (span.type) {
      case 'code': return h('code', { class: 'inline-code' }, span.text);
      case 'strong': return h('strong', {}, drawSpans(span.spans));
      case 'em': return h('em', {}, drawSpans(span.spans));
      case 'strike': return h('s', {}, drawSpans(span.spans));
      // Opening a page has to leave this window, which has no address bar and
      // no way back, so links go to the browser the person already has.
      case 'link': return h('a', { href: span.href, target: '_blank', rel: 'noreferrer noopener' }, drawSpans(span.spans));
      default: return document.createTextNode(span.text);
    }
  });
}

// Code is the part of an answer most likely to be wanted somewhere else, so it
// comes with the one button that saves selecting it by hand.
function drawCode(block) {
  const copy = h('button', { class: 'code-copy' }, 'Copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(block.text);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Cannot copy';
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  });
  return h('div', { class: 'code-block' },
    h('div', { class: 'code-head' }, h('span', { class: 'code-lang' }, block.lang || 'text'), copy),
    h('pre', {}, h('code', {}, block.text)));
}

function drawList(block) {
  return h(block.ordered ? 'ol' : 'ul', { class: 'prose-list' }, block.items.map((item) => h('li', {},
    ...drawSpans(item.spans),
    ...item.blocks.map(drawBlock))));
}

function drawTable(block) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'prose-table' },
    h('thead', {}, h('tr', {}, block.head.map((cell) => h('th', {}, drawSpans(cell))))),
    h('tbody', {}, block.rows.map((row) => h('tr', {}, row.map((cell) => h('td', {}, drawSpans(cell))))))));
}

function drawBlock(block) {
  switch (block.type) {
    case 'code': return drawCode(block);
    case 'heading': return h(`h${Math.min(block.level + 2, 6)}`, { class: 'prose-heading' }, drawSpans(block.spans));
    case 'list': return drawList(block);
    case 'quote': return h('blockquote', { class: 'prose-quote' }, block.blocks.map(drawBlock));
    case 'table': return drawTable(block);
    case 'rule': return h('hr', { class: 'prose-rule' });
    default: return h('p', { class: 'prose-para' }, drawSpans(block.spans));
  }
}

// One element holding an answer, formatted the way it was written.
export function richText(markdown, className = 'prose') {
  return h('div', { class: className }, parseBlocks(markdown).map(drawBlock));
}
