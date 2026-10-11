const listeners = new Map();

export function subscribe(event, listener) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(listener);
  return () => listeners.get(event)?.delete(listener);
}

export function publish(event, value) {
  for (const listener of listeners.get(event) || []) listener(value);
}
