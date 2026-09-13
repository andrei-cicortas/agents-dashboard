// Which notifications deserve a Windows notification of their own: the unread
// ones that were not there last time. The first state a window sees only sets
// the baseline, so opening the app on old news announces nothing.

export function newlyUnread(seen, notifications) {
  const ids = new Set(notifications.map((one) => one.id));
  if (seen === null) return { fresh: [], seen: ids };
  return { fresh: notifications.filter((one) => !one.read && !seen.has(one.id)), seen: ids };
}
