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
};

export function notificationText(notification, panel) {
  const who = panel ? panelLabel(panel) : 'Closed agent';
  return `${who} ${EVENT_TEXT[notification.event] ?? notification.event}`;
}
