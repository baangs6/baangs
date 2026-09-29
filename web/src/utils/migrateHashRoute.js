export function migrateHashRoute(browser) {
  const { hash, search } = browser.location;
  // Convert shared legacy routes before BrowserRouter reads the location.
  if (!hash.startsWith('#/') || hash.startsWith('#//')) return;
  const target = new URL(hash.slice(1), browser.location.origin);
  if (target.origin !== browser.location.origin) return;
  for (const [key, value] of new URLSearchParams(search)) {
    if (!target.searchParams.has(key)) target.searchParams.append(key, value);
  }
  browser.history.replaceState(browser.history.state, '', `${target.pathname}${target.search}${target.hash}`);
}
