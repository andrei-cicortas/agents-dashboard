import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSI_KEYS, cssVariables, DEFAULT_THEME_ID, terminalTheme, themeById, THEMES, TOKEN_KEYS } from '../shared/themes.js';

const HEX = /^#[0-9a-f]{6}$/;

test('there are several themes to choose from', () => {
  assert.ok(THEMES.length >= 8, `only ${THEMES.length} themes`);
});

test('every theme has a unique id and a name', () => {
  const ids = THEMES.map((theme) => theme.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repeat');
  for (const theme of THEMES) {
    assert.match(theme.id, /^[a-z0-9-]+$/, `bad id: ${theme.id}`);
    assert.ok(theme.name.length > 0, `${theme.id} has no name`);
  }
});

test('the default theme is one of them', () => {
  assert.ok(THEMES.some((theme) => theme.id === DEFAULT_THEME_ID));
});

test('every theme fills in every token the stylesheet asks for', () => {
  for (const theme of THEMES) {
    for (const key of TOKEN_KEYS) {
      assert.match(theme.tokens[key] ?? '', HEX, `${theme.id} is missing or malforms --${key}`);
    }
  }
});

test('every theme carries a full sixteen colour terminal palette', () => {
  for (const theme of THEMES) {
    for (const key of ANSI_KEYS) {
      assert.match(theme.ansi[key] ?? '', HEX, `${theme.id} is missing or malforms ${key}`);
    }
  }
});

test('an unknown theme falls back to the default rather than breaking', () => {
  assert.equal(themeById('no-such-theme').id, DEFAULT_THEME_ID);
  assert.equal(themeById(undefined).id, DEFAULT_THEME_ID);
  assert.equal(themeById('dracula').id, 'dracula');
});

test('tokens become the custom properties the stylesheet reads', () => {
  const variables = cssVariables(themeById(DEFAULT_THEME_ID));
  for (const key of TOKEN_KEYS) {
    assert.ok(Object.hasOwn(variables, `--${key}`), `--${key} is not set`);
  }
});

test('the terminal is dressed from the same theme as the panel around it', () => {
  const theme = themeById('dracula');
  const terminal = terminalTheme(theme);
  assert.equal(terminal.background, theme.tokens.surface, 'the terminal sits on the panel surface');
  assert.equal(terminal.foreground, theme.tokens.text);
  assert.equal(terminal.cursor, theme.tokens.text);
  assert.equal(terminal.red, theme.ansi.red);
  assert.equal(terminal.brightWhite, theme.ansi.brightWhite);
});

// The stylesheet carries the default theme so the page is dressed before any
// script runs. That makes the same colours live in two places, so guard the
// pair against drifting apart.
test('the stylesheet ships exactly the default theme', async () => {
  const fs = await import('node:fs');
  const url = new URL('../web/styles.css', import.meta.url);
  const root = fs.readFileSync(url, 'utf8').match(/:root\s*\{([^}]*)\}/)[1];
  const defaults = themeById(DEFAULT_THEME_ID).tokens;
  for (const key of TOKEN_KEYS) {
    const declared = root.match(new RegExp(`--${key}:\\s*([^;]+);`));
    assert.ok(declared, `styles.css never sets --${key}`);
    assert.equal(declared[1].trim(), defaults[key], `--${key} drifted from the ${DEFAULT_THEME_ID} theme`);
  }
});
