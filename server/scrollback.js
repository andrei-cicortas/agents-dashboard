// Keeps the most recent terminal output of one panel so a reopened window
// can show what happened while it was closed.

export const DEFAULT_LIMIT = 256 * 1024;

export function createScrollback(limit = DEFAULT_LIMIT) {
  let chunks = [];
  let size = 0;
  return {
    append(data) {
      chunks.push(data);
      size += data.length;
      while (size > limit && chunks.length > 1) {
        size -= chunks.shift().length;
      }
      if (size > limit) {
        chunks[0] = chunks[0].slice(size - limit);
        size = limit;
      }
    },
    read() {
      return chunks.join('');
    },
    clear() {
      chunks = [];
      size = 0;
    },
  };
}
