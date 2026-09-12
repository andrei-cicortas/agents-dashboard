// Choosing a folder, inside the app.
//
// Windows' own Browse For Folder dialog is a cramped tree with no address bar,
// so reaching something like C:\Claude\Spider Tag means unfolding This PC, the
// drive, and every level below it — and it opens as a separate window that can
// end up behind the app. This browses the disk in place instead: it opens on
// the drives, walks down with a click, and takes a pasted path.
//
// Two places need one — adding a workspace, and giving a named agent a folder
// to work in — and the answer comes back from the server as a broadcast rather
// than as a return value, so the picker that asked last is the one told.

import { h } from './dom.js';
import { icon } from './icons.js';

let asking = null;

// Routed here by app.js when a folders:list reply arrives.
export function deliverFolders(payload) {
  asking?.show(payload);
}

export function createFolderPicker({ actions, onChoose, chooseLabel = 'Add this folder', windowsDialog = false }) {
  // Where the browser is looking. null means the list of drives.
  let here = null;
  let parent = null;

  const pathInput = h('input', {
    class: 'field',
    type: 'text',
    spellcheck: 'false',
    placeholder: 'This PC — or paste a folder path',
    onKeydown: (event) => {
      if (event.key === 'Escape') return close();
      if (event.key !== 'Enter') return;
      const typed = pathInput.value.trim();
      // Enter on a path walks into it; on the folder you are already in, takes it.
      if (typed && typed !== here) actions.listFolders(typed);
      else if (here) onChoose(here);
    },
  });

  const upButton = h('button', {
    class: 'icon-button',
    title: 'Up one folder',
    onClick: () => actions.listFolders(parent ?? ''),
  }, icon('chevronRight', { size: 14 }));
  upButton.style.transform = 'rotate(-90deg)';

  const list = h('div', { class: 'folder-list' });
  const message = h('div', { class: 'add-message' });
  message.hidden = true;

  const chooseButton = h('button', { class: 'button primary', onClick: () => here && onChoose(here) }, chooseLabel);

  const element = h('div', { class: 'add-folder' },
    h('div', { class: 'folder-bar' }, upButton, pathInput),
    list,
    message,
    h('div', { class: 'form-actions' },
      windowsDialog
        ? h('button', { class: 'button', title: 'Use the Windows dialog instead', onClick: () => actions.addProject() }, 'Windows…')
        : h('button', { class: 'button', onClick: () => close() }, 'Cancel'),
      chooseButton));
  element.hidden = true;

  function close() {
    element.hidden = true;
    message.hidden = true;
    if (asking === self) asking = null;
  }

  function open() {
    element.hidden = false;
    message.hidden = true;
    asking = self;
    actions.listFolders(here ?? '');
    pathInput.focus();
  }

  const self = {
    element,

    open,
    close,
    toggle() {
      if (element.hidden) open();
      else close();
    },

    isOpen: () => !element.hidden,
    // The folder currently being browsed, so a caller can tell when the one
    // that was just added is the one on screen.
    current: () => here,

    // A reply to folders:list.
    show({ path: at, parent: above, entries, error }) {
      if (error) {
        message.textContent = error;
        message.hidden = false;
        return;
      }
      message.hidden = true;
      here = at;
      parent = above;
      if (document.activeElement !== pathInput || pathInput.value.trim() !== at) pathInput.value = at ?? '';
      upButton.disabled = !at;
      chooseButton.disabled = !at;
      chooseButton.title = at ? `${chooseLabel}: ${at}` : 'Go into a folder first';
      list.replaceChildren(...entries.map((entry) => h('button', {
        class: 'folder-row',
        title: entry.path,
        onClick: () => actions.listFolders(entry.path),
      }, icon('folder', { size: 13 }), h('span', { class: 'label' }, entry.name))));
      if (!entries.length) {
        list.replaceChildren(h('div', { class: 'sidebar-empty' }, at ? 'Nothing but files in here.' : 'No drives found.'));
      }
      list.scrollTop = 0;
    },

    failed(text) {
      message.textContent = text;
      message.hidden = false;
    },
  };

  return self;
}
