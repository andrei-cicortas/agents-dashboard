import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ANSI_KEYS,
  COLOUR_KEYS,
  cssVariables,
  DEFAULT_THEME_ID,
  findDecorations,
  LAYER_KEYS,
  otherTheme,
  terminalTheme,
  themeById,
  THEMES,
  TOKEN_KEYS,
} from '../shared/themes.js';

const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;

const styles = () => fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('there is one dark theme and one light one, and nothing else to choose', () => {
  assert.deepEqual(THEMES.map((theme) => theme.id), ['dark', 'light']);
});

test('every theme has a unique id and a name', () => {
  const ids = THEMES.map((theme) => theme.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repeat');
  for (const theme of THEMES) {
    assert.match(theme.id, /^[a-z0-9-]+$/, `bad id: ${theme.id}`);
    assert.ok(theme.name.length > 0, `${theme.id} has no name`);
  }
});

test('the default is the dark one', () => {
  assert.equal(DEFAULT_THEME_ID, 'dark');
  assert.ok(THEMES.some((theme) => theme.id === DEFAULT_THEME_ID));
});

test('every theme fills in every solid colour the stylesheet asks for', () => {
  for (const theme of THEMES) {
    for (const key of COLOUR_KEYS) {
      assert.match(theme.tokens[key] ?? '', HEX, `${theme.id} is missing or malforms --${key}`);
    }
  }
});

test('every theme fills in every translucent layer too', () => {
  for (const theme of THEMES) {
    for (const key of LAYER_KEYS) {
      assert.match(theme.tokens[key] ?? '', RGBA, `${theme.id} is missing or malforms --${key}`);
    }
  }
});

test('the veils are white on the dark theme and black on the light one', () => {
  const [dark, light] = THEMES;
  assert.ok(dark.tokens.veil.startsWith('rgba(255, 255, 255'), dark.tokens.veil);
  assert.ok(light.tokens.veil.startsWith('rgba(0, 0, 0'), light.tokens.veil);
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
  // The ten dark themes this replaced are gone; anyone who had one gets dark.
  assert.equal(themeById('solarized').id, 'dark');
  assert.equal(themeById('light').id, 'light');
});

test('a switch with two settings always has somewhere else to go', () => {
  assert.equal(otherTheme(themeById('dark')).id, 'light');
  assert.equal(otherTheme(themeById('light')).id, 'dark');
});

test('tokens become the custom properties the stylesheet reads', () => {
  for (const theme of THEMES) {
    const variables = cssVariables(theme);
    for (const key of TOKEN_KEYS) {
      assert.ok(Object.hasOwn(variables, `--${key}`), `--${key} is not set on ${theme.id}`);
    }
  }
});

test('the terminal is dressed from the same theme as the panel around it', () => {
  const theme = themeById('light');
  const terminal = terminalTheme(theme);
  assert.equal(terminal.background, theme.tokens.surface, 'the terminal sits on the panel surface');
  assert.equal(terminal.foreground, theme.tokens.text);
  assert.equal(terminal.cursor, theme.tokens.text);
  assert.equal(terminal.selectionBackground, theme.tokens.selection);
  assert.equal(terminal.red, theme.ansi.red);
  assert.equal(terminal.brightWhite, theme.ansi.brightWhite);
});

test('a found word is painted differently on a white terminal than on a black one', () => {
  const dark = findDecorations(themeById('dark'));
  const light = findDecorations(themeById('light'));
  assert.notEqual(dark.matchBackground, light.matchBackground);
  assert.notEqual(dark.activeMatchBackground, light.activeMatchBackground);
  for (const key of ['matchBackground', 'matchOverviewRuler', 'activeMatchBackground', 'activeMatchColorOverviewRuler']) {
    assert.match(light[key], HEX, `light ${key}`);
    assert.match(dark[key], HEX, `dark ${key}`);
  }
});

// The stylesheet carries the default theme so the page is dressed before any
// script runs. That makes the same colours live in two places, so guard the
// pair against drifting apart.
test('the stylesheet ships exactly the default theme', () => {
  const root = styles().match(/:root\s*\{([\s\S]*?)\n\}/)[1];
  const defaults = themeById(DEFAULT_THEME_ID).tokens;
  for (const key of TOKEN_KEYS) {
    const declared = root.match(new RegExp(`--${key}:\\s*([^;]+);`));
    assert.ok(declared, `styles.css never sets --${key}`);
    assert.equal(declared[1].trim(), defaults[key], `--${key} drifted from the ${DEFAULT_THEME_ID} theme`);
  }
});

// A colour written into a rule is one a theme cannot replace, so it would stay
// dark on a white window. The two allowed below carry their own background.
test('no rule names a colour of its own outside the two that carry one', () => {
  const css = styles();
  const body = css.slice(css.indexOf('}', css.indexOf(':root')) + 1);
  const found = [...body.matchAll(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]);
  assert.deepEqual(found, ['#fff', '#fff'], `unthemed colours in styles.css: ${found.join(', ')}`);
});
