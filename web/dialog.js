// Questions the app asks before doing something, in its own look.
//
// The browser's confirm() and prompt() would do the job, but in the app window
// they arrive titled "127.0.0.1:4317 says", in the page engine's grey box, and
// they freeze everything behind them — terminals included — until answered.
// These look like the rest of the app, and only cover it.

import { h } from './dom.js';

let current = null;

function open({ title, message, confirmLabel, danger, input }) {
  current?.dismiss();
  return new Promise((resolve) => {
    const returnFocus = document.activeElement;
    const field = input
      ? h('input', { class: 'field dialog-field', type: 'text', spellcheck: 'false', 'aria-label': title })
      : null;
    if (field) field.value = input.value;
    const cancelButton = h('button', { class: 'button', type: 'button' }, 'Cancel');
    const okButton = h('button', { class: `button primary${danger ? ' danger' : ''}`, type: 'button' }, confirmLabel);
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'dialog-title' }, title),
      message ? h('div', { class: 'dialog-message' }, message) : null,
      field,
      h('div', { class: 'form-actions' }, cancelButton, okButton));
    const backdrop = h('div', { class: 'dialog-backdrop' }, box);
    const focusable = [field, cancelButton, okButton].filter(Boolean);

    function finish(answer) {
      backdrop.remove();
      window.removeEventListener('keydown', onKey, true);
      if (current === self) current = null;
      if (returnFocus?.isConnected) returnFocus.focus();
      resolve(answer);
    }

    const accept = () => finish(field ? field.value : true);
    const self = { dismiss: () => finish(field ? null : false) };

    // Listening on the window, ahead of the app's own shortcuts and of any
    // terminal: while a question is open, the keys belong to it. Typing into
    // the box still works, because that is the key's default action and not a
    // listener.
    function onKey(event) {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        self.dismiss();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (document.activeElement === cancelButton) self.dismiss();
        else accept();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const at = focusable.indexOf(document.activeElement);
        const next = (at + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        focusable[next].focus();
      }
    }

    cancelButton.addEventListener('click', () => self.dismiss());
    okButton.addEventListener('click', accept);
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) self.dismiss();
    });
    window.addEventListener('keydown', onKey, true);
    document.body.append(backdrop);
    current = self;

    if (field) {
      field.focus();
      field.select();
    } else {
      okButton.focus();
    }
  });
}

// Resolves true when confirmed, false otherwise.
export function ask({ title, message = '', confirmLabel = 'OK', danger = false }) {
  return open({ title, message, confirmLabel, danger });
}

// Resolves to the text typed, or null when cancelled.
export function askText({ title, value = '', confirmLabel = 'Save' }) {
  return open({ title, message: '', confirmLabel, danger: false, input: { value } });
}
