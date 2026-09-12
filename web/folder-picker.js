// Choosing a project folder, inside the app.
//
// Windows' own Browse For Folder dialog is a cramped tree with no address bar,
// so reaching something like C:\Claude\Spider Tag means unfolding This PC, the
// drive, and every level below it — and it opens as a separate window that can
// end up behind the app. This browses the disk in the sidebar instead: it opens
// on the drives, walks down with a click, and takes a pasted path.

import { h } from './dom.js';
import { icon } from './icons.js';

export function createFolderPicker(actions) {
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
      else if (here) actions.addProject(here);
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

  const addButton = h('button', { class: 'button primary', onClick: () => here && actions.addProject(here) }, 'Add this folder');

  const element = h('div', { class: 'add-folder' },
    h('div', { class: 'folder-bar' }, upButton, pathInput),
    list,
    message,
    h('div', { class: 'form-actions' },
      h('button', { class: 'button', title: 'Use the Windows dialog instead', onClick: () => actions.addProject() }, 'Windows…'),
      addButton));
  element.hidden = true;

  function close() {
    element.hidden = true;
    message.hidden = true;
  }

  function open() {
    element.hidden = false;
    message.hidden = true;
    actions.listFolders(here ?? '');
    pathInput.focus();
  }

  return {
    element,

    toggle() {
      if (element.hidden) open();
      else close();
    },

    close,
    isOpen: () => !element.hidden,
    // The folder currently being browsed, so the sidebar can tell when the one
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
      addButton.disabled = !at;
      addButton.title = at ? `Add ${at}` : 'Go into a folder first';
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
}
