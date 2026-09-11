// Small popover menu anchored to a button. Only one menu is open at a time.

import { h } from './dom.js';

let openElement = null;

function onPointerDown(event) {
  if (openElement && !openElement.contains(event.target)) closeMenu();
}

function onKeyDown(event) {
  if (event.key === 'Escape') closeMenu();
}

export function closeMenu() {
  if (!openElement) return;
  openElement.remove();
  openElement = null;
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeyDown, true);
}

export function openMenu(anchor, items) {
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu' }, items.map((item) => h('button', {
    class: 'menu-item',
    role: 'menuitem',
    disabled: item.disabled,
    onClick: () => {
      closeMenu();
      item.onSelect();
    },
  }, item.label)));
  document.body.append(menu);

  const rect = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8));
  const below = rect.bottom + 4;
  const top = below + menu.offsetHeight > window.innerHeight ? rect.top - menu.offsetHeight - 4 : below;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  openElement = menu;
  // Wait a tick so the click that opened the menu does not close it.
  setTimeout(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  });
}
