// Whether a string may be loaded into a browser pane.
//
// A pane points a real browser engine at whatever this returns, so only http
// and https get through: file: would read the disk, javascript: and data:
// would run script inside the pane. Everything else is refused rather than
// guessed at or repaired.

export function webAddress(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
}
