import { test, expect } from '@playwright/test';
async function setup(page) {
  let rows = Array.from({ length: 65 }, (_, i) => ({ notification_id: `N${i}`, title: `Field alert ${i}`, message: `Activity update ${i}`, is_read: false, created_at: i < 40 ? '2026-10-17T13:43:00+05:30' : '2026-10-16T11:00:00+05:30', meta: { ...(i % 3 === 0 ? { job_id: `JOB-${i}`, staff_name: 'Amal', technician_phone: '9000000000', status: 'in_progress' } : i % 3 === 1 ? { type: 'stock_alert' } : { task_id: `TSK-${i}`, type: 'task_assigned' }), ...(i % 7 === 0 ? { priority: 'urgent' } : {}) } }));
  const calls = []; let fail = false; let failGet = false;
  await page.addInitScript(() => {
    window.desktopAlerts = []; window.permissionRequests = 0;
    window.Notification = class {
      static permission = 'default';
      static async requestPermission() { window.permissionRequests++; this.permission = 'granted'; return 'granted'; }
      constructor(title, options) { window.desktopAlerts.push({ title, ...options }); }
      close() {}
    };
  });
  await page.route('**/notifications/**', route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname;
    if (req.method() === 'GET') {
      if (failGet) return route.fulfill({ status: 500, json: { detail: 'Notifications unavailable' } });
      if (path.endsWith('unread-count')) return route.fulfill({ json: { count: rows.filter(row => !row.is_read).length } });
      const skip = Number(url.searchParams.get('skip')); const limit = Number(url.searchParams.get('limit') || 30);
      return route.fulfill({ json: rows.slice(skip, skip + limit) });
    }
    const body = req.postData() ? req.postDataJSON() : null; calls.push({ path, body });
    if (fail) return route.fulfill({ status: 500, json: { detail: 'Read update unavailable' } });
    if (path.endsWith('read-all')) rows = rows.map(row => ({ ...row, is_read: true }));
    else if (path.endsWith('clear-selected')) rows = rows.filter(row => !body.notification_ids.includes(row.notification_id));
    else { const id = path.split('/')[2]; rows = rows.map(row => row.notification_id === id ? { ...row, is_read: !path.endsWith('unread') } : row); }
    return route.fulfill({ json: {} });
  });
  await page.goto('/tests/fixtures/notifications.html');
  await page.getByRole('button', { name: 'Open notification drawer', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Activity & Notifications', exact: true });
  await expect(drawer.getByText('50 matching of 50 loaded alerts', { exact: true })).toBeVisible();
  return { calls, drawer, fail: value => { fail = value; }, failGet: value => { failGet = value; }, add: row => { rows.unshift(row); } };
}
for (const width of [1440, 390, 320]) test(`notifications fit ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 950 }); const { drawer } = await setup(page);
  const box = await drawer.boundingBox(); expect(box.width).toBeLessThanOrEqual(width); expect(box.x).toBeGreaterThanOrEqual(0);
  expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`notifications-${width}.png`), fullPage: true });
  await page.keyboard.press('Escape'); await expect(drawer).not.toBeVisible();
});
test('search, filters, older alerts, metadata actions and navigation', async ({ page }) => {
  const { drawer } = await setup(page);
  await expect(drawer.getByText('65 unread alerts', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Call Tech' }).first()).toHaveAttribute('href', 'tel:+919000000000');
  await drawer.getByRole('button', { name: 'Warehouse', exact: true }).click();
  await expect(drawer.locator('.alerts-card')).toHaveCount(17);
  await expect(drawer.getByRole('button', { name: 'Open Job Sheet', exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'All', exact: true }).click();
  await drawer.getByRole('button', { name: 'Load Older Notifications' }).click();
  await expect(drawer.getByText('65 matching of 65 loaded alerts', { exact: true })).toBeVisible();
  await drawer.getByLabel('Search notifications').fill('Field alert 64');
  await expect(drawer.locator('.alerts-card')).toHaveCount(1);
  await drawer.getByRole('button', { name: 'Clear alert search' }).click();
  await drawer.getByLabel('Search notifications').fill('JOB-0');
  await drawer.getByRole('button', { name: 'Open Job Sheet', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Linked Job Opened', exact: true })).toBeVisible();
});
test('read retry, unread toggle, mark all, badge and task action', async ({ page }) => {
  const state = await setup(page); const { drawer } = state;
  state.fail(true); await drawer.getByRole('button', { name: 'Mark read N0', exact: true }).click();
  await expect(drawer.getByRole('status')).toContainText('Read update unavailable');
  await expect(drawer.getByRole('button', { name: 'Mark read N0', exact: true })).toBeVisible();
  state.fail(false); await drawer.getByRole('button', { name: 'Mark read N0', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Mark unread N0', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Mark unread N0', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Mark read N0', exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Mark All as Read', exact: true }).click();
  await expect(drawer.getByText('0 unread alerts', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Mark All as Read', exact: true })).toBeDisabled();
  await drawer.getByRole('button', { name: 'Tasks', exact: true }).click();
  await drawer.getByRole('button', { name: 'Open Tasks', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Tasks Opened', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open notification drawer', exact: true })).toHaveText('');
});
test('clear filtered confirms and sends only displayed matching ids', async ({ page }) => {
  const state = await setup(page); const { drawer } = state;
  await drawer.getByRole('button', { name: 'Warehouse', exact: true }).click();
  page.once('dialog', confirm => confirm.dismiss());
  await drawer.getByRole('button', { name: 'Clear Filtered (17)', exact: true }).click(); expect(state.calls).toHaveLength(0);
  page.once('dialog', confirm => confirm.accept());
  await drawer.getByRole('button', { name: 'Clear Filtered (17)', exact: true }).click();
  await expect(drawer.locator('.alerts-notice')).toContainText('Updated successfully');
  expect(state.calls.at(-1).path).toBe('/notifications/clear-selected');
  expect(state.calls.at(-1).body.notification_ids).toHaveLength(17);
  expect(state.calls.at(-1).body.notification_ids.every(id => Number(id.slice(1)) % 3 === 1)).toBe(true);
});
test('preferences request permission only on demand, save and gate desktop alerts', async ({ page }) => {
  const state = await setup(page); const { drawer } = state;
  expect(await page.evaluate(() => window.permissionRequests)).toBe(0);
  await drawer.getByRole('button', { name: 'Notification Preferences', exact: true }).click();
  await drawer.getByRole('checkbox', { name: 'Enable desktop notifications', exact: true }).check();
  await expect(drawer.locator('.alerts-notice')).toContainText('Browser preferences saved');
  expect(await page.evaluate(() => window.permissionRequests)).toBe(1);
  await drawer.getByRole('checkbox', { name: 'Only urgent desktop alerts', exact: true }).check();
  await drawer.getByRole('button', { name: 'Back to Alerts', exact: true }).click();
  state.add({ notification_id: 'NEW1', title: 'Normal new alert', is_read: false, created_at: '2026-10-18T10:00:00+05:30', meta: {} });
  await drawer.getByRole('button', { name: 'Refresh notifications' }).click();
  await expect(drawer.getByText('66 unread alerts', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.desktopAlerts.length)).toBe(0);
  state.add({ notification_id: 'NEW2', title: 'Urgent new alert', is_read: false, created_at: '2026-10-18T11:00:00+05:30', meta: { priority: 'urgent' } });
  await drawer.getByRole('button', { name: 'Refresh notifications' }).click();
  await expect(drawer.getByText('67 unread alerts', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.desktopAlerts.map(row => row.title))).toEqual(['Urgent new alert']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('baangs-notifications:A')).urgentOnly)).toBe(true);
});
test('refresh error is visible and retry keeps the drawer usable', async ({ page }) => {
  const state = await setup(page); state.failGet(true);
  await state.drawer.getByRole('button', { name: 'Refresh notifications' }).click();
  await expect(state.drawer.getByRole('alert')).toContainText('Notifications unavailable');
  state.failGet(false); await state.drawer.getByRole('button', { name: 'Retry notifications' }).click();
  await expect(state.drawer.getByRole('alert')).toHaveCount(0);
  await expect(state.drawer.locator('.alerts-card')).toHaveCount(50);
});
