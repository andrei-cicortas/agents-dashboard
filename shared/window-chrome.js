// What the native window needs to colour its title bar like the page under it.
// The window accepts only #rrggbb colours, and ignores a message without them.

// Relative luminance, near enough to tell a dark background from a light one.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function windowChrome(theme) {
  const { bg, text } = theme.tokens;
  return { type: 'window:theme', background: bg, text, dark: luminance(bg) < 0.5 };
}
