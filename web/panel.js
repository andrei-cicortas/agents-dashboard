// One agent panel: header with status and buttons, and a real terminal.

import { Terminal } from '/vendor/xterm/lib/xterm.mjs';
import { FitAddon } from '/vendor/addon-fit/lib/addon-fit.mjs';
import { SearchAddon } from '/vendor/addon-search/lib/addon-search.mjs';
import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { panelLabel } from '/shared/labels.js';
import { dotClass } from '/shared/status.js';
import { findDecorations, terminalTheme } from '/shared/themes.js';
import { agentColour, agentInitial } from './agent-mark.js';
import { matchLabel } from '/shared/find.js';
import { copyText } from './clipboard.js';

// An address in an agent's output — a login page, a pull request — opens in
// the browser on Ctrl+click, the way Windows Terminal does it, so a plain click
// to focus the terminal never sends you off somewhere. Only http and https: a
// terminal can print anything, javascript: included.
function openAddress(event, uri) {
  if (!event.ctrlKey || !/^https?:\/\//i.test(uri)) return;
  window.open(uri, '_blank', 'noopener');
}

export function createPanel(initialPanel, actions, theme) {
  let panel = initialPanel;
  let shownMaximized = null;
  let shownOverlayKey = null;
  let lastSize = '';

  const stopClick = (handler) => (event) => {
    event.stopPropagation();
    handler(event);
  };

  const dot = h('span', { class: 'dot' });
  const markInitial = h('span', {});
  const mark = h('span', { class: 'panel-mark' }, markInitial);
  // Both agents start with C, and their marks differ only in colour, so the
  // header says which one in words.
  const title = h('span', { class: 'panel-title' });
  const moreButton = h('button', {
    class: 'icon-button',
    title: 'More',
    onClick: stopClick(() => openMenu(moreButton, [
      { label: 'Split right', onSelect: () => actions.splitPanel(panel, 'row') },
      { label: 'Split down', onSelect: () => actions.splitPanel(panel, 'column') },
      { label: 'Find in output…', onSelect: () => openFind() },
      { label: 'Restart agent', onSelect: () => actions.restartPanel(panel.id) },
      { label: 'Open in Explorer', onSelect: () => actions.openFolder(panel.cwd) },
      { label: 'Copy folder path', onSelect: () => navigator.clipboard.writeText(panel.cwd) },
    ])),
  }, icon('more'));
  const maximizeButton = h('button', { class: 'icon-button', onClick: stopClick(() => actions.toggleMaximize(panel.id)) });
  const plusButton = h('button', {
    class: 'icon-button',
    title: 'Start another agent of this type in this folder',
    onClick: stopClick(() => actions.createPanel(panel.agentId, panel.cwd)),
  }, icon('plus'));
  const closeButton = h('button', { class: 'icon-button', title: 'Close', onClick: stopClick(() => actions.closePanel(panel.id)) }, icon('close'));

  const host = h('div', { class: 'terminal-host' });
  const overlay = h('div', { class: 'panel-overlay' });
  overlay.hidden = true;

  // An agent writes far more than fits on a screen, so reading back through it
  // by eye is hopeless. Ctrl+F searches the scrollback the way a page does.
  const findInput = h('input', { class: 'find-input', type: 'text', placeholder: 'Find in output', spellcheck: 'false' });
  const findCount = h('span', { class: 'find-count' });
  const findPrev = h('button', { class: 'icon-button tiny', title: 'Previous match (Shift+Enter)' }, icon('chevronDown', { size: 12 }));
  const findNext = h('button', { class: 'icon-button tiny', title: 'Next match (Enter)' }, icon('chevronDown', { size: 12 }));
  const findClose = h('button', { class: 'icon-button tiny', title: 'Close (Esc)' }, icon('close', { size: 12 }));
  findPrev.style.transform = 'rotate(180deg)';
  const findBar = h('div', { class: 'find-bar' }, findInput, findCount, findPrev, findNext, findClose);
  findBar.hidden = true;

  const element = h('div', { class: 'panel', dataset: { panelId: panel.id } },
    h('div', { class: 'panel-header', onDblclick: () => actions.toggleMaximize(panel.id) },
      dot,
      mark,
      title,
      h('div', { class: 'panel-actions' }, moreButton, maximizeButton, plusButton, closeButton)),
    h('div', { class: 'panel-body' }, host, findBar, overlay));
  element.addEventListener('pointerdown', () => actions.focusPanel(panel.id));

  const terminal = new Terminal({
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 5000,
    theme: terminalTheme(theme),
    // Painting every match of a search uses xterm's decoration API, which is
    // still marked proposed. The version is pinned, so this cannot change
    // under us without the change being asked for.
    allowProposedApi: true,
    // Links an agent marks up itself (OSC 8). Without a handler xterm asks
    // with the browser's confirm box before opening one.
    linkHandler: { activate: openAddress, allowNonHttpProtocols: false },
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);
  terminal.open(host);

  // A terminal answers some of the questions a program writes to it — where is
  // the cursor, what kind of terminal is this — by typing the answer back.
  // Replayed output can still hold such a question from long ago, and
  // answering it again would type stray text like "[?1;2c" into the agent when
  // the window opens or reconnects. So nothing goes to the agent while
  // replaying; typing works again as soon as the replay has been read.
  let replaying = false;
  terminal.onData((data) => {
    if (!replaying) actions.input(panel.id, data);
  });

  // Addresses that are only text in the output become links too. Loaded on
  // the side, so a server started before this addon existed still serves a
  // working terminal, just without them.
  let disposed = false;
  import('/vendor/addon-web-links/lib/addon-web-links.mjs')
    .then(({ WebLinksAddon }) => {
      if (!disposed) terminal.loadAddon(new WebLinksAddon(openAddress));
    })
    .catch(() => {});

  // Two keys belong to the dashboard rather than to the agent. Ctrl+F opens
  // the find bar; forwarded, the agent would see a stray keystroke. Ctrl+C with
  // text selected copies it, as in Windows Terminal; forwarded, it would reach
  // the agent as an interrupt, so copying something Claude wrote would stop
  // Claude. With nothing selected, Ctrl+C still goes to the agent.
  terminal.attachCustomKeyEventHandler((event) => {
    if (!event.ctrlKey || event.altKey || event.metaKey) return true;
    const key = event.key.toLowerCase();
    if (key === 'c' && terminal.hasSelection()) {
      if (event.type === 'keydown') {
        copyText(terminal.getSelection());
        terminal.clearSelection();
      }
      return false;
    }
    if (key === 'f' && !event.shiftKey) {
      if (event.type === 'keydown') openFind();
      return false;
    }
    return true;
  });

  // Right-click with text selected copies it, as in Windows Terminal: the
  // browser's own menu cannot, because a terminal's selection is not a page
  // selection. With nothing selected the usual menu comes up, Paste on it.
  host.addEventListener('contextmenu', (event) => {
    if (!terminal.hasSelection()) return;
    event.preventDefault();
    copyText(terminal.getSelection());
    terminal.clearSelection();
  }, true);

  searchAddon.onDidChangeResults((results) => {
    findCount.textContent = matchLabel({ term: findInput.value, ...results });
  });

  // A found word is painted over the terminal's own colours, so which colours
  // read depend on which theme the terminal is wearing.
  let findOptions = { decorations: findDecorations(theme) };

  function search(direction, { fromCursor = true } = {}) {
    const term = findInput.value;
    if (!term) {
      searchAddon.clearDecorations();
      findCount.textContent = '';
      return;
    }
    const options = { ...findOptions, incremental: !fromCursor };
    if (direction === 'back') searchAddon.findPrevious(term, options);
    else searchAddon.findNext(term, options);
  }

  function openFind() {
    findBar.hidden = false;
    findInput.focus();
    findInput.select();
    if (findInput.value) search('forward', { fromCursor: false });
  }

  function closeFind() {
    findBar.hidden = true;
    searchAddon.clearDecorations();
    findCount.textContent = '';
    terminal.focus();
  }

  findInput.addEventListener('input', () => search('forward', { fromCursor: false }));
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return closeFind();
    if (event.key !== 'Enter') return;
    event.preventDefault();
    search(event.shiftKey ? 'back' : 'forward');
  });
  findNext.addEventListener('click', stopClick(() => search('forward')));
  findPrev.addEventListener('click', stopClick(() => search('back')));
  findClose.addEventListener('click', stopClick(closeFind));

  function fit() {
    if (!host.isConnected || host.clientWidth === 0 || host.clientHeight === 0) return;
    try {
      fitAddon.fit();
    } catch {
      return;
    }
    const size = `${terminal.cols}x${terminal.rows}`;
    if (size !== lastSize) {
      lastSize = size;
      actions.resize(panel.id, terminal.cols, terminal.rows);
    }
  }

  const observer = new ResizeObserver(() => fit());
  observer.observe(host);

  function renderOverlay() {
    const key = `${panel.status}|${panel.message ?? ''}`;
    if (key === shownOverlayKey) return;
    shownOverlayKey = key;

    const button = (label, onClick) => h('button', { class: 'button', onClick: stopClick(onClick) }, label);
    if (panel.status === 'not-installed') {
      overlay.replaceChildren(
        h('div', { class: 'empty-title' }, `${panel.agentName} is not installed`),
        h('div', { class: 'message' }, panel.message),
        h('div', { class: 'overlay-actions' },
          button('Retry', () => actions.restartPanel(panel.id)),
          button('Close', () => actions.closePanel(panel.id))),
      );
      overlay.hidden = false;
    } else if (panel.status === 'folder-missing') {
      overlay.replaceChildren(
        h('div', { class: 'empty-title' }, 'Folder not found'),
        h('div', { class: 'message' }, panel.message),
        h('div', { class: 'overlay-actions' }, button('Close', () => actions.closePanel(panel.id))),
      );
      overlay.hidden = false;
    } else {
      overlay.replaceChildren();
      overlay.hidden = true;
    }
  }

  function update(nextPanel, { focused, maximized }) {
    panel = nextPanel;
    dot.className = `dot ${dotClass(panel)}`;
    mark.style.background = agentColour(panel.agentId);
    markInitial.textContent = agentInitial(panel);
    // The folder is the same for every panel here and is named in the top bar,
    // so the header spends its words on which agent this is.
    title.textContent = panel.agentName ?? '';
    mark.title = `${panelLabel(panel)}
${panel.cwd}`;
    title.title = mark.title;
    element.classList.toggle('focused', focused);
    element.classList.toggle('attention', panel.attention);
    if (maximized !== shownMaximized) {
      shownMaximized = maximized;
      maximizeButton.replaceChildren(icon(maximized ? 'restore' : 'maximize'));
      maximizeButton.title = maximized ? 'Restore' : 'Maximize';
    }
    renderOverlay();
  }

  update(panel, { focused: false, maximized: false });

  return {
    element,
    update,
    write: (data) => terminal.write(data),
    replay(data) {
      terminal.reset();
      if (data) {
        replaying = true;
        // The callback runs once this data has been read, and before anything
        // written after it, so live output is answered again as usual.
        terminal.write(data, () => { replaying = false; });
      }
      // Replay follows every (re)connect; a restarted server starts agents at
      // its default size, so send the size again even if it did not change.
      lastSize = '';
      fit();
    },
    fit,
    setTheme(next) {
      terminal.options.theme = terminalTheme(next);
      findOptions = { decorations: findDecorations(next) };
      if (!findBar.hidden && findInput.value) search('forward', { fromCursor: false });
    },
    focusTerminal: () => terminal.focus(),
    openFind,
    dispose() {
      disposed = true;
      observer.disconnect();
      terminal.dispose();
      element.remove();
    },
  };
}
