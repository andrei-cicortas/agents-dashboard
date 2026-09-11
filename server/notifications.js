// Pure helpers for the notification list shown under the bell.
// The list is ordered newest first.

export const MAX_NOTIFICATIONS = 100;

export function addNotification(list, { id, panelId, event, at, read = false }) {
  return [{ id, panelId, event, at, read }, ...list].slice(0, MAX_NOTIFICATIONS);
}

export function markRead(list, id) {
  return list.map((n) => (n.id === id ? { ...n, read: true } : n));
}

export function markAllRead(list) {
  return list.map((n) => (n.read ? n : { ...n, read: true }));
}

export function unreadCount(list) {
  return list.filter((n) => !n.read).length;
}

export function removeForPanel(list, panelId) {
  return list.filter((n) => n.panelId !== panelId);
}
