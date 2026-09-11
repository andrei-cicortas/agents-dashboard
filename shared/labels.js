// Human-readable names for panels and notifications, shared by all UI parts.

export function folderName(fullPath) {
  const parts = fullPath.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? fullPath;
}

export function panelLabel(panel) {
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
