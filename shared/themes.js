// The two colour themes, shared by the stylesheet and the terminals.
//
// Dark and Light, and nothing in between: one for working at night and one for
// a bright room, which is the only choice anybody actually makes.
//
// Every surface in the app is built from a translucent veil over the
// background and a 1px inset ring, rather than from solid borders. Those veils
// are white on dark and black on light, so they are part of a theme rather
// than fixed — which is what a real light theme needs and a shelf of dark ones
// never did.

// Solid colours. The status colours are here too: a green that reads on black
// is not the green that reads on white.
export const COLOUR_KEYS = [
  'bg', 'surface', 'surface-raised', 'popover',
  'text', 'muted', 'dim',
  'accent', 'on-accent',
  'red', 'green', 'yellow', 'orange', 'grey',
];

// The translucent layers: veils, rings, shadows, and the things drawn over
// another surface rather than beside it.
export const LAYER_KEYS = [
  'veil', 'veil-hover', 'veil-active',
  'ring', 'ring-strong',
  'overlay', 'shadow', 'scrollbar', 'scrollbar-dim', 'glow', 'selection',
];

export const TOKEN_KEYS = [...COLOUR_KEYS, ...LAYER_KEYS];

export const ANSI_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

const ansi = (values) => Object.fromEntries(ANSI_KEYS.map((key, index) => [key, values[index]]));

export const THEMES = [
  {
    id: 'dark',
    name: 'Dark',
    tokens: {
      bg: '#0a0a0a',
      surface: '#141414',
      'surface-raised': '#1b1b1b',
      popover: '#191919',
      text: '#fafafa',
      muted: '#a1a1a1',
      dim: '#858585',
      accent: '#5c8fff',
      'on-accent': '#0a0a0a',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#eab308',
      orange: '#f97316',
      grey: '#6b7280',

      veil: 'rgba(255, 255, 255, 0.035)',
      'veil-hover': 'rgba(255, 255, 255, 0.06)',
      'veil-active': 'rgba(255, 255, 255, 0.1)',
      ring: 'rgba(255, 255, 255, 0.1)',
      'ring-strong': 'rgba(255, 255, 255, 0.16)',
      overlay: 'rgba(20, 20, 20, 0.94)',
      shadow: 'rgba(0, 0, 0, 0.55)',
      scrollbar: 'rgba(255, 255, 255, 0.14)',
      'scrollbar-dim': 'rgba(255, 255, 255, 0.1)',
      glow: 'rgba(249, 115, 22, 0.2)',
      selection: 'rgba(255, 255, 255, 0.18)',
    },
    ansi: ansi([
      '#1f1f1f', '#f87171', '#4ade80', '#facc15', '#60a5fa', '#c084fc', '#22d3ee', '#d4d4d8',
      '#52525b', '#fca5a5', '#86efac', '#fde68a', '#93c5fd', '#d8b4fe', '#67e8f9', '#fafafa',
    ]),
  },
  {
    id: 'light',
    name: 'Light',
    tokens: {
      // The page is the quieter grey and the panels are white, so a panel
      // reads as something laid on the window rather than a hole in it —
      // the same relationship the dark theme has, turned over.
      bg: '#f1f1f3',
      surface: '#ffffff',
      'surface-raised': '#fbfbfc',
      popover: '#ffffff',
      text: '#18181b',
      muted: '#52525b',
      dim: '#71717a',
      accent: '#2563eb',
      'on-accent': '#ffffff',
      red: '#dc2626',
      green: '#15803d',
      yellow: '#a16207',
      orange: '#c2410c',
      grey: '#71717a',

      veil: 'rgba(0, 0, 0, 0.028)',
      'veil-hover': 'rgba(0, 0, 0, 0.055)',
      'veil-active': 'rgba(0, 0, 0, 0.085)',
      ring: 'rgba(0, 0, 0, 0.12)',
      'ring-strong': 'rgba(0, 0, 0, 0.26)',
      overlay: 'rgba(255, 255, 255, 0.94)',
      shadow: 'rgba(0, 0, 0, 0.16)',
      scrollbar: 'rgba(0, 0, 0, 0.2)',
      'scrollbar-dim': 'rgba(0, 0, 0, 0.14)',
      glow: 'rgba(194, 65, 12, 0.16)',
      selection: 'rgba(37, 99, 235, 0.18)',
    },
    // A terminal palette that stays readable on white. The usual bright
    // variants would be invisible there, so "bright" means bolder here.
    ansi: ansi([
      '#24292f', '#cf222e', '#116329', '#7d4e00', '#0550ae', '#8250df', '#1b7c83', '#6e7781',
      '#57606a', '#a40e26', '#1a7f37', '#633c01', '#0969da', '#6639ba', '#12616c', '#3f4750',
    ]),
  },
];

export const DEFAULT_THEME_ID = 'dark';

export const themeById = (id) => THEMES.find((theme) => theme.id === id) ?? THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);

// The other one, for a switch that only ever has somewhere else to go.
export const otherTheme = (theme) => THEMES.find((one) => one.id !== theme.id) ?? theme;

export const cssVariables = (theme) => Object.fromEntries(TOKEN_KEYS.map((key) => [`--${key}`, theme.tokens[key]]));

export function terminalTheme(theme) {
  return {
    background: theme.tokens.surface,
    foreground: theme.tokens.text,
    cursor: theme.tokens.text,
    cursorAccent: theme.tokens.surface,
    selectionBackground: theme.tokens.selection,
    ...theme.ansi,
  };
}

// How a found word is painted over a terminal's own colours. The one you are
// on has to stand out from the rest without hiding the text underneath, which
// means different colours on a white terminal than on a black one.
export function findDecorations(theme) {
  const light = theme.id === 'light';
  return {
    matchBackground: light ? '#d7dce3' : '#4b5563',
    matchOverviewRuler: light ? '#8c959f' : '#9ca3af',
    activeMatchBackground: light ? '#ffd666' : '#eab308',
    activeMatchColorOverviewRuler: light ? '#b8860b' : '#eab308',
  };
}
