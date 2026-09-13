import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowChrome } from '../shared/window-chrome.js';
import { THEMES, themeById } from '../shared/themes.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('the title bar takes the background and text colour of the page', () => {
  const dark = themeById('dark');
  assert.deepEqual(windowChrome(dark), {
    type: 'window:theme',
    background: dark.tokens.bg,
    text: dark.tokens.text,
    dark: true,
  });
});

test('a light page asks for a light title bar', () => {
  assert.equal(windowChrome(themeById('light')).dark, false);
});

test('whether the bar is dark follows the colour, not the name of the theme', () => {
  const pale = { id: 'dark', tokens: { bg: '#fefefe', text: '#111111' } };
  assert.equal(windowChrome(pale).dark, false);
});

test('every theme gives colours the window accepts', () => {
  // The window ignores anything that is not #rrggbb.
  for (const theme of THEMES) {
    const chrome = windowChrome(theme);
    assert.match(chrome.background, HEX, theme.id);
    assert.match(chrome.text, HEX, theme.id);
  }
});
