// Pure helpers for the notification list shown under the bell.
// The list is ordered newest first.
//
// A notification names what it came from by kind and id: a `panel` is a
// terminal on the Code tab, a `thread` one of a named agent's conversations,
// a `chat` one on the Chat tab. Anything that answers while you are looking
// somewhere else can ring the bell, which is the whole point of a dashboard
// meant to run several at once.

export const MAX_NOTIFICATIONS = 100;

export function addNotification(list, { id, kind = 'panel', targetId, event, at, read = false }) {
  return [{ id, kind, targetId, event, at, read }, ...list].slice(0, MAX_NOTIFICATIONS);
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

// Used when the thing a notification points at is gone: a closed panel, a
// removed thread, a deleted chat.
export function removeFor(list, kind, targetId) {
  return list.filter((n) => !(n.kind === kind && n.targetId === targetId));
}

// Notifications written before one could come from anywhere but a panel named
// their panel in a field of its own.
export function migrate(list) {
  return list.map((notification) => {
    if (notification.kind) return notification;
    const { panelId, ...rest } = notification;
    return { ...rest, kind: 'panel', targetId: panelId };
  });
}
