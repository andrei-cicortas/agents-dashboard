// Copying, and the button that does it.
//
// Two places want one — a code block inside an answer, and the answer itself —
// and both want the same thing: say "Copied", then go back to saying "Copy".

import { h } from './dom.js';

function throughATextarea(text) {
  const box = h('textarea', { readonly: true, 'aria-hidden': 'true' });
  box.value = text;
  // Off screen rather than hidden: the selection has to be real to be copied.
  Object.assign(box.style, { position: 'fixed', top: '-1000px', opacity: '0' });
  document.body.append(box);
  box.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box.remove();
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The modern API refuses while the window is not the focused one, which is
    // easy to hit in an app window beside a terminal. The old way still works.
    return throughATextarea(text);
  }
}

export function copyButton(getText, { className = 'code-copy', title = 'Copy' } = {}) {
  const button = h('button', { class: className, title, type: 'button' }, 'Copy');
  let settle;
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    button.textContent = (await copyText(getText())) ? 'Copied' : 'Cannot copy';
    clearTimeout(settle);
    settle = setTimeout(() => { button.textContent = 'Copy'; }, 1500);
  });
  return button;
}
