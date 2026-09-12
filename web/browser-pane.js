// A pane showing a web page instead of a terminal, for looking at what the
// agents in the panes beside it have just built.
//
// It offers the same shape as a terminal panel so the canvas can place either
// without caring which it is; the parts only a terminal has do nothing here.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { webAddress } from '/shared/address.js';

export function createBrowserPane(initialPanel, actions) {
  let panel = initialPanel;
  let shownMaximized = null;
  let loaded = null;

  const stopClick = (handler) => (event) => {
    event.stopPropagation();
    handler(event);
  };

  const frame = h('iframe', {
    class: 'browser-frame',
    // The page is someone else's; keep it from reaching back into the app.
    sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups',
    referrerpolicy: 'no-referrer',
  });

  const address = h('input', {
    class: 'address',
    type: 'text',
    spellcheck: 'false',
    'aria-label': 'Address',
    onKeydown: (event) => {
      if (event.key === 'Escape') {
        address.value = panel.url;
        address.blur();
      }
      if (event.key !== 'Enter') return;
      const next = webAddress(address.value);
      if (next) actions.setPanelUrl(panel.id, next);
      else address.value = panel.url;
    },
    onBlur: () => { address.value = panel.url; },
  });
  address.addEventListener('pointerdown', (event) => event.stopPropagation());

  const reloadButton = h('button', {
    class: 'icon-button',
    title: 'Reload',
    // Re-assigning the source reloads it; the page is another origin, so its
    // own location is out of reach.
    onClick: stopClick(() => { frame.src = panel.url; }),
  }, icon('reload', { size: 14 }));

  const moreButton = h('button', {
    class: 'icon-button',
    title: 'More',
    onClick: stopClick(() => openMenu(moreButton, [
      { label: 'Split right', onSelect: () => actions.splitPanel(panel, 'row') },
      { label: 'Split down', onSelect: () => actions.splitPanel(panel, 'column') },
      { label: 'Copy address', onSelect: () => navigator.clipboard.writeText(panel.url) },
    ])),
  }, icon('more'));

  const maximizeButton = h('button', { class: 'icon-button', onClick: stopClick(() => actions.toggleMaximize(panel.id)) });
  const closeButton = h('button', { class: 'icon-button', title: 'Close', onClick: stopClick(() => actions.closePanel(panel.id)) }, icon('close'));

  const element = h('div', { class: 'panel browser', dataset: { panelId: panel.id } },
    h('div', { class: 'panel-header', onDblclick: () => actions.toggleMaximize(panel.id) },
      h('span', { class: 'panel-mark browser-mark', title: 'Web page' }, icon('globe', { size: 13 })),
      address,
      h('div', { class: 'panel-actions' }, reloadButton, moreButton, maximizeButton, closeButton)),
    h('div', { class: 'panel-body' }, frame));
  element.addEventListener('pointerdown', () => actions.focusPanel(panel.id));

  function update(nextPanel, { focused, maximized }) {
    panel = nextPanel;
    // Only touch the source when the address really changed, or every render
    // would throw the page away and load it again.
    if (panel.url !== loaded) {
      loaded = panel.url;
      frame.src = panel.url;
    }
    if (document.activeElement !== address) address.value = panel.url;
    element.classList.toggle('focused', focused);
    if (maximized !== shownMaximized) {
      shownMaximized = maximized;
      maximizeButton.replaceChildren(icon(maximized ? 'restore' : 'maximize'));
      maximizeButton.title = maximized ? 'Restore' : 'Maximize';
    }
  }

  update(panel, { focused: false, maximized: false });

  return {
    element,
    update,
    // A web page has no terminal to write to, size, theme, or search.
    write() {},
    replay() {},
    fit() {},
    setTheme() {},
    openFind() {},
    focusTerminal: () => frame.focus(),
    dispose() {
      element.remove();
    },
  };
}
