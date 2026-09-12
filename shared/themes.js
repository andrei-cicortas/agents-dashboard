// The colour themes, shared by the stylesheet and the terminals.
//
// A theme only carries the colours that actually differ between themes. The
// translucent veils and rings the surfaces are built from stay the same white
// alphas throughout, because every theme here is dark; so does the meaning of
// the status dots, where a recognisable green and orange matter more than a
// tidy palette.

export const TOKEN_KEYS = ['bg', 'surface', 'surface-raised', 'popover', 'text', 'muted', 'dim', 'accent'];

export const ANSI_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

const ansi = (values) => Object.fromEntries(ANSI_KEYS.map((key, index) => [key, values[index]]));

export const THEMES = [
  {
    id: 'midnight',
    name: 'Midnight',
    tokens: {
      bg: '#0a0a0a',
      surface: '#141414',
      'surface-raised': '#1b1b1b',
      popover: '#191919',
      text: '#fafafa',
      muted: '#a1a1a1',
      dim: '#858585',
      accent: '#5c8fff',
    },
    ansi: ansi([
      '#1f1f1f', '#f87171', '#4ade80', '#facc15', '#60a5fa', '#c084fc', '#22d3ee', '#d4d4d8',
      '#52525b', '#fca5a5', '#86efac', '#fde68a', '#93c5fd', '#d8b4fe', '#67e8f9', '#fafafa',
    ]),
  },
  {
    id: 'void',
    name: 'Void',
    tokens: {
      bg: '#060608',
      surface: '#0f0f14',
      'surface-raised': '#16161d',
      popover: '#14141a',
      text: '#f4f4f7',
      muted: '#9d9daa',
      dim: '#7c7c8a',
      accent: '#7c6cff',
    },
    ansi: ansi([
      '#1a1a22', '#ff6b81', '#5eead4', '#fcd34d', '#818cf8', '#c4b5fd', '#67e8f9', '#d4d4dc',
      '#4b4b58', '#ff9aa8', '#99f6e4', '#fde68a', '#a5b4fc', '#ddd6fe', '#a5f3fc', '#f4f4f7',
    ]),
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    tokens: {
      bg: '#16161e',
      surface: '#1a1b26',
      'surface-raised': '#24283b',
      popover: '#1f2335',
      text: '#c0caf5',
      muted: '#9aa5ce',
      dim: '#787c99',
      accent: '#7aa2f7',
    },
    ansi: ansi([
      '#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6',
      '#414868', '#ff7a93', '#b9f27c', '#ff9e64', '#7da6ff', '#c0a1f7', '#0db9d7', '#c0caf5',
    ]),
  },
  {
    id: 'dracula',
    name: 'Dracula',
    tokens: {
      bg: '#1a1b23',
      surface: '#282a36',
      'surface-raised': '#343746',
      popover: '#2f313d',
      text: '#f8f8f2',
      muted: '#a8abbd',
      dim: '#8a8da3',
      accent: '#bd93f9',
    },
    ansi: ansi([
      '#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2',
      '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff',
    ]),
  },
  {
    id: 'nord',
    name: 'Nord',
    tokens: {
      bg: '#242933',
      surface: '#2e3440',
      'surface-raised': '#3b4252',
      popover: '#353b4a',
      text: '#eceff4',
      muted: '#b4bbc8',
      dim: '#93a1b1',
      accent: '#88c0d0',
    },
    ansi: ansi([
      '#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
      '#4c566a', '#d08770', '#b9d3a0', '#f0d8a8', '#93b5d4', '#c7a2c0', '#9fd6e3', '#eceff4',
    ]),
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    tokens: {
      bg: '#11111b',
      surface: '#1e1e2e',
      'surface-raised': '#313244',
      popover: '#181825',
      text: '#cdd6f4',
      muted: '#a6adc8',
      dim: '#7f849c',
      accent: '#89b4fa',
    },
    ansi: ansi([
      '#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#cba6f7', '#94e2d5', '#bac2de',
      '#585b70', '#f5a2b8', '#b8e9b4', '#fae8c4', '#a2c4fb', '#d7bcf9', '#a9e8de', '#cdd6f4',
    ]),
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    tokens: {
      bg: '#1d2021',
      surface: '#282828',
      'surface-raised': '#3c3836',
      popover: '#32302f',
      text: '#ebdbb2',
      muted: '#bdae93',
      dim: '#a89984',
      accent: '#fabd2f',
    },
    ansi: ansi([
      '#3c3836', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2',
      '#665c54', '#fe8019', '#c9d05a', '#fbd85e', '#a3bdb4', '#e0a5b5', '#a9d0a0', '#fbf1c7',
    ]),
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    tokens: {
      bg: '#21252b',
      surface: '#282c34',
      'surface-raised': '#333842',
      popover: '#2c313a',
      text: '#dcdfe4',
      muted: '#9da5b4',
      dim: '#7f848e',
      accent: '#61afef',
    },
    ansi: ansi([
      '#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf',
      '#4f5666', '#ec858d', '#b3d69a', '#efd3a2', '#8ac4f3', '#d79ae7', '#7fcbd4', '#dcdfe4',
    ]),
  },
  {
    id: 'solarized',
    name: 'Solarized',
    tokens: {
      bg: '#002b36',
      surface: '#073642',
      'surface-raised': '#0d4a58',
      popover: '#0a4250',
      text: '#eee8d5',
      muted: '#93a1a1',
      dim: '#839496',
      accent: '#268bd2',
    },
    ansi: ansi([
      '#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#586e75', '#cb4b16', '#9fb300', '#d1a000', '#4ba3e0', '#e0549b', '#3fbdb2', '#fdf6e3',
    ]),
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    tokens: {
      bg: '#1a1526',
      surface: '#241b2f',
      'surface-raised': '#34264a',
      popover: '#2b2040',
      text: '#f8f8f2',
      muted: '#b8a9d9',
      dim: '#9187b0',
      accent: '#ff7edb',
    },
    ansi: ansi([
      '#2a2139', '#fe4450', '#72f1b8', '#fede5d', '#03edf9', '#ff7edb', '#67e8f9', '#f8f8f2',
      '#495495', '#ff6d7e', '#9bf7cd', '#ffeb8a', '#6ff4fb', '#ffa3e6', '#a5f3fc', '#ffffff',
    ]),
  },
];

export const DEFAULT_THEME_ID = 'midnight';

export const themeById = (id) => THEMES.find((theme) => theme.id === id) ?? THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);

export const cssVariables = (theme) => Object.fromEntries(TOKEN_KEYS.map((key) => [`--${key}`, theme.tokens[key]]));

export function terminalTheme(theme) {
  return {
    background: theme.tokens.surface,
    foreground: theme.tokens.text,
    cursor: theme.tokens.text,
    cursorAccent: theme.tokens.surface,
    selectionBackground: 'rgba(255, 255, 255, 0.18)',
    ...theme.ansi,
  };
}
