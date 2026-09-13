// Human-readable names for panels and notifications, shared by all UI parts.

export function folderName(fullPath) {
  const parts = fullPath.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? fullPath;
}

// A browser pane goes by where it is pointed, trimmed to the part worth
// reading in a narrow header: no scheme, no query, no trailing slash.
export function addressLabel(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  return `${parsed.host}${path}`;
}

export function panelLabel(panel) {
  if (panel.kind === 'browser') return addressLabel(panel.url);
  return panel.title || `${panel.agentName} · ${folderName(panel.cwd)}`;
}

const EVENT_TEXT = {
  finished: 'finished',
  'needs-input': 'needs your input',
  failed: 'could not finish',
};

// What to call something that has since been closed, so an old notification
// still reads as a sentence.
const GONE = {
  panel: 'Closed agent',
  thread: 'Closed thread',
  chat: 'Deleted chat',
};

export function notificationText(notification, label) {
  const who = label || GONE[notification.kind] || 'Closed agent';
  return `${who} ${EVENT_TEXT[notification.event] ?? notification.event}`;
}

// What a notification came from, by name: a panel by its conversation topic,
// a thread by its agent and title, a chat by its name. null once it is gone.
export function notificationSubject(state, { kind, targetId }) {
  if (kind === 'panel') {
    const panel = (state.panels ?? []).find((one) => one.id === targetId);
    return panel ? panelLabel(panel) : null;
  }
  if (kind === 'chat') return (state.chats ?? []).find((one) => one.id === targetId)?.title ?? null;
  const thread = (state.threads ?? []).find((one) => one.id === targetId);
  if (!thread) return null;
  const profile = (state.profiles ?? []).find((one) => one.id === thread.profileId);
  return profile ? `${profile.name} · ${thread.title}` : thread.title;
}

// Which tab has to be in front to see what a notification points at.
export const TAB_OF_KIND = { panel: 'code', thread: 'agent', chat: 'chat' };
