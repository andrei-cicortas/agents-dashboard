// What Ctrl+K offers, and how typing narrows it down.
//
// The app has grown three tabs, a list of folders, a terminal per agent, named
// agents and a pile of chats. Finding one of them means knowing which tab it
// lives on and scrolling to it. One box that searches the lot is quicker than
// any of that, and it is the same box whichever tab you are on.
//
// Pure: the window turns these entries into elements and acts on the one that
// is picked, and the matching is tested without a browser.

import { folderName, panelLabel } from './labels.js';

// Every entry is { kind, targetId, label, hint }. `kind` says what the window
// should do with it; the rest is what a person reads.
export function paletteItems(state = {}, commands = []) {
  const projects = state.projects ?? [];
  const panels = state.panels ?? [];
  const profiles = state.profiles ?? [];
  const chats = state.chats ?? [];

  return [
    ...commands.map((command) => ({ kind: 'command', targetId: command.id, label: command.label, hint: command.hint ?? 'Command' })),
    ...projects.map((project) => ({
      kind: 'workspace',
      targetId: project.path,
      label: project.name,
      hint: project.path,
    })),
    ...panels.map((panel) => ({
      kind: 'panel',
      targetId: panel.id,
      label: panelLabel(panel),
      hint: `${panel.kind === 'browser' ? 'Web page' : 'Terminal'} · ${folderName(panel.cwd)}`,
    })),
    ...profiles.map((profile) => ({
      kind: 'agent',
      targetId: profile.id,
      label: profile.name,
      hint: `Agent · ${folderName(profile.cwd || '')}`,
    })),
    ...chats.map((chat) => ({
      kind: 'chat',
      targetId: chat.id,
      label: chat.title,
      hint: 'Chat',
    })),
  ];
}

// Every letter of the query, in order, somewhere in the text. Letters that land
// next to each other, or at the start of a word, are what a person meant, so
// they count for more — "sptg" should find "Spider Tag" ahead of anything that
// merely contains those letters scattered about.
export function score(text, query) {
  const haystack = String(text ?? '').toLowerCase();
  const needle = String(query ?? '').toLowerCase().trim();
  if (!needle) return 0;

  let at = 0;
  let total = 0;
  let previous = -2;
  for (const letter of needle) {
    if (letter === ' ') continue;
    const found = haystack.indexOf(letter, at);
    if (found === -1) return null;
    let points = 1;
    if (found === previous + 1) points += 3;
    if (found === 0) points += 5;
    else if (/[^a-z0-9]/.test(haystack[found - 1])) points += 3;
    total += points;
    previous = found;
    at = found + 1;
  }
  // A short name matching is a better answer than a long one that also does.
  return total + Math.max(0, 20 - haystack.length) / 10;
}

const LIMIT = 12;

export function rank(items, query, limit = LIMIT) {
  const typed = String(query ?? '').trim();
  if (!typed) return items.slice(0, limit);

  return items
    .map((item, index) => {
      const own = score(item.label, typed);
      // The hint can carry the match — a folder path, the agent's folder —
      // but it is worth less than the name itself.
      const aside = own === null ? score(item.hint, typed) : null;
      const best = own ?? (aside === null ? null : aside / 2);
      return best === null ? null : { item, best, index };
    })
    .filter(Boolean)
    // Ties keep the order they were built in, so commands stay above folders.
    .sort((a, b) => b.best - a.best || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}
