// One agent panel: header with status and buttons, and a real terminal.

import { Terminal } from '/vendor/xterm/lib/xterm.mjs';
import { FitAddon } from '/vendor/addon-fit/lib/addon-fit.mjs';
import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { panelLabel } from '/shared/labels.js';
import { dotClass } from '/shared/status.js';
import { terminalTheme } from '/shared/themes.js';
import { agentColour, agentInitial } from './agent-mark.js';

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
  const moreButton = h('button', {
    class: 'icon-button',
    title: 'More',
    onClick: stopClick(() => openMenu(moreButton, [
      { label: 'Split right', onSelect: () => actions.splitPanel(panel, 'row') },
      { label: 'Split down', onSelect: () => actions.splitPanel(panel, 'column') },
      { label: 'Restart agent', onSelect: () => actions.restartPanel(panel.id) },
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

  const element = h('div', { class: 'panel', dataset: { panelId: panel.id } },
    h('div', { class: 'panel-header', onDblclick: () => actions.toggleMaximize(panel.id) },
      dot,
      mark,
      h('div', { class: 'panel-actions' }, moreButton, maximizeButton, plusButton, closeButton)),
    h('div', { class: 'panel-body' }, host, overlay));
  element.addEventListener('pointerdown', () => actions.focusPanel(panel.id));

  const terminal = new Terminal({
    fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 5000,
    theme: terminalTheme(theme),
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(host);
  terminal.onData((data) => actions.input(panel.id, data));

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
    // The canvas shows one workspace at a time, so every panel would repeat the
    // same folder; the header stays bare and the words live in the tooltip.
    mark.title = `${panelLabel(panel)}
${panel.cwd}`;
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
      if (data) terminal.write(data);
      // Replay follows every (re)connect; a restarted server starts agents at
      // its default size, so send the size again even if it did not change.
      lastSize = '';
      fit();
    },
    fit,
    setTheme(next) {
      terminal.options.theme = terminalTheme(next);
    },
    focusTerminal: () => terminal.focus(),
    dispose() {
      observer.disconnect();
      terminal.dispose();
      element.remove();
    },
  };
}
