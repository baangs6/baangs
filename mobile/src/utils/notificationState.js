export function unseenNotifications(rows, seenIds) {
  const seen = new Set(seenIds);
  return rows.filter(row => row.notification_id && !row.is_read && !seen.has(row.notification_id)).reverse();
}

export function rememberNotifications(rows, seenIds) {
  return [...new Set([...seenIds, ...rows.map(row => row.notification_id).filter(Boolean)])].slice(-500);
}
