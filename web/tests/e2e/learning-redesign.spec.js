import { test, expect } from '@playwright/test';
async function setup(page) {
  let items = Array.from({ length: 7 }, (_, i) => ({ update_id: `U-${i}`, job_id: `JOB-${i}`, assigned_staff_id: 'S1', staff_name: 'Amal N', customer_name: 'Kannur Store', update_time: '2026-10-17T10:00:00', issues_faced: i % 2 ? null : `Camera IR glare ${i}`, learning_notes: i % 2 ? `Network installation ${i}` : null, learning_category: 'CCTV Optics', doubt_status: i % 2 ? 'resolved' : 'open', team_sop: false, site_visit_required: false }));
  const calls = []; let fail = false;
  await page.route('**/staff/', route => route.fulfill({ json: [{ staff_id: 'S1', name: 'Amal N', phone_number: '9000000000' }] }));
  await page.route('**/updates/learning-log*', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); calls.push(body);
      items.unshift({ ...items[0], update_id: 'NEW', job_id: body.job_id, issues_faced: body.note });
      return route.fulfill({ json: items[0] });
    }
    return route.fulfill({ json: { items } });
  });
  await page.route('**/updates/*/doubt-review', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (fail) return route.fulfill({ status: 500, json: { detail: 'Save unavailable' } });
    const id = route.request().url().split('/').at(-2);
    items = items.map(item => item.update_id === id ? { ...item, ...body, replied_by: 'Admin' } : item);
    return route.fulfill({ json: items.find(item => item.update_id === id) });
  });
  await page.goto('/tests/fixtures/learning.html');
  await expect(page.getByRole('complementary', { name: 'Note inspector' })).toBeVisible();
  return { calls, fail: value => { fail = value; } };
}
for (const width of [1440, 390, 320]) test(`learning fits ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`learning-${width}.png`), fullPage: true });
});
test('search, categories, pagination and linked jobs', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.learning-metrics')).toContainText('7');
  await expect(page.getByRole('link', { name: 'JOB-0', exact: true })).toHaveAttribute('href', '/jobs/JOB-0');
  await page.getByLabel('Notes page', { exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: 'Inspect note U-4', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Field Learnings/ }).click();
  await expect(page.locator('.learning-note')).toHaveCount(3);
  await expect(page.getByLabel('Notes page', { exact: true })).toHaveValue('1');
  await page.getByLabel('Search notes').fill('installation 3');
  await expect(page.locator('.learning-note')).toHaveCount(1);
  await page.getByLabel('Doubt status').selectOption('open');
  await expect(page.getByText('No notes match these filters')).toBeVisible();
});
test('resolution retry, SOP, site visit, resolve, reopen and saved WhatsApp', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Save to Team SOP' }).click();
  await expect(page.getByRole('status')).toContainText('Write a resolution');
  await page.getByLabel('Resolution', { exact: true }).fill('Tilt camera down and retest.');
  state.fail(true); await page.getByRole('button', { name: 'Save Resolution', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Save unavailable');
  await expect(page.getByLabel('Resolution', { exact: true })).toHaveValue('Tilt camera down and retest.');
  state.fail(false); await page.getByRole('button', { name: 'Save Resolution', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Send Saved Resolution via WhatsApp' })).toHaveAttribute('href', /wa.me\/919000000000/);
  await page.getByRole('button', { name: 'Save to Team SOP' }).click();
  await expect(page.getByRole('button', { name: 'Remove Team SOP' })).toBeVisible();
  await page.getByRole('button', { name: 'Flag for Site Visit' }).click();
  await expect(page.getByRole('button', { name: 'Clear Site Visit Flag' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Resolved' }).click();
  await expect(page.getByRole('button', { name: 'Reopen Doubt' })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen Doubt' }).click();
  await expect(page.getByRole('button', { name: 'Mark Resolved' })).toBeVisible();
  expect(state.calls.at(-1).doubt_status).toBe('open');
});
test('logs job-linked query and handles load failures', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Log Query' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log field note' });
  await dialog.getByLabel('Job ID').fill('JOB-0');
  await dialog.getByLabel('Technician').selectOption('S1');
  await dialog.getByLabel('Note', { exact: true }).fill('New field query');
  await dialog.getByRole('button', { name: 'Save Note' }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.calls.at(-1).note).toBe('New field query');
  await expect(page.getByRole('button', { name: 'Inspect note NEW', exact: true })).toBeVisible();
  await page.route('**/updates/learning-log*', route => route.fulfill({ status: 500, json: { detail: 'Notes unavailable' } }));
  await page.getByRole('button', { name: 'Refresh notes' }).click();
  await expect(page.getByRole('alert')).toContainText('Notes unavailable');
  await page.route('**/updates/learning-log*', route => route.fulfill({ json: { items: [] } }));
  await page.getByRole('button', { name: 'Retry notes' }).click();
  await expect(page.getByText('No notes match these filters')).toBeVisible();
});
