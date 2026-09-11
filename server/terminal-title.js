// Extracts window titles that terminal programs set with OSC 0/2 escape
// sequences. Claude Code sets the title to the current conversation topic.

const OSC_TITLE = /\x1b\](?:0|2);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const MAX_CARRY = 1024;

export function createTitleTracker() {
  let carry = '';
  return {
    push(chunk) {
      const text = carry + chunk;
      let latest = null;
      let lastEnd = 0;
      for (const match of text.matchAll(OSC_TITLE)) {
        latest = match[1];
        lastEnd = match.index + match[0].length;
      }
      // Keep an unfinished sequence so a title split across chunks is found.
      const rest = text.slice(lastEnd);
      const start = rest.lastIndexOf('\x1b]');
      carry = start === -1 ? '' : rest.slice(start, start + MAX_CARRY);
      return latest;
    },
  };
}

export function isUsefulTitle(title) {
  const trimmed = title.trim();
  return trimmed !== '' && !/cmd\.exe$/i.test(trimmed);
}
