// Keyboard shortcuts for the window itself.
//
// The hard part is that most of the window is a terminal, and a terminal wants
// every keystroke. So only the few combinations no agent uses are taken, and
// everything else is left alone the moment the caret is in a terminal or a box
// someone is typing in.

import { inWindow } from './desktop.js';

const TABS = ['agent', 'code', 'chat'];
const ZOOM_STEPS = { '=': 1, '+': 1, '-': -1, 0: 0 };

const typingIn = (target) => Boolean(target?.closest?.('input, textarea, [contenteditable="true"]'));
const inTerminal = (target) => Boolean(target?.closest?.('.terminal-host'));

export function installShortcuts(actions, model) {
  // Listening on the way down, before the terminal's own handler, so a
  // shortcut can be taken away from it rather than reaching the agent too.
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.metaKey || !event.ctrlKey) return;
    const digit = TABS[Number(event.key) - 1];

    // The one box that finds anything. Like the tab keys below it, this is
    // taken from the terminal rather than shared with it.
    if ((event.key === 'k' || event.key === 'K') && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      actions.togglePalette();
      return;
    }

    // Switching tabs works from anywhere, including from inside a terminal:
    // it is how you get out of one without reaching for the mouse. Stopped
    // here and now, because a terminal turns some of these into control codes
    // of its own — Ctrl+3 is an Escape — and the agent would act on them.
    if (digit && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      actions.setTab(digit);
      return;
    }

    // Ctrl+F is handled by the panel itself, which has the terminal to search.
    if (inTerminal(event.target)) return;

    // Zoom, in the app window, where the browser's own keys for it are off.
    // Outside a terminal only: in one, Ctrl+- is the agent's undo.
    const zoomStep = ZOOM_STEPS[event.key];
    if (inWindow && zoomStep !== undefined) {
      event.preventDefault();
      actions.zoom(zoomStep);
      return;
    }

    if (event.key === 'b' || event.key === 'B') {
      if (event.shiftKey) return;
      event.preventDefault();
      actions.toggleSidebar();
      return;
    }

    if ((event.key === 'n' || event.key === 'N') && !event.shiftKey) {
      // What "new" means depends on what is in front of you.
      if (model.tab === 'chat') {
        event.preventDefault();
        actions.newChat();
      } else if (model.tab === 'agent' && model.selectedProfileId) {
        event.preventDefault();
        actions.createThread(model.selectedProfileId);
      }
      return;
    }

    // Ctrl+F outside a terminal opens the find bar of the panel in focus, so
    // the shortcut means the same thing on the Code tab wherever you are.
    if ((event.key === 'f' || event.key === 'F') && !event.shiftKey && !typingIn(event.target)) {
      if (model.tab !== 'code' || !model.focusedPanelId) return;
      event.preventDefault();
      actions.findInPanel(model.focusedPanelId);
    }
  }, true);
}
