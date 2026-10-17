import { test, expect } from '@playwright/test';
const initialRows = Array.from({ length: 12 }, (_, i) => ({ leave_id: `LEV-${i}`, staff_id: `STF-${i}`, staff_name: i === 0 ? 'Sarun Technician' : `Technician ${i}`, leave_type: i % 2 ? 'sick' : 'casual', from_date: '2026-07-01', to_date: '2026-07-04', reason: `Request ${i}`, status: i === 0 ? 'pending' : i === 1 ? 'rejected' : 'approved', created_at: '2026-06-30T10:00:00', decision_at: i ? '2026-06-30T11:00:00' : null, decision_note: i ? 'Reviewed by dispatch' : null }));
async function setup(page, fail = false) {
  let rows = structuredClone(initialRows);
  await page.route('**/attendance/', route => route.fulfill({ json: [] }));
  await page.route('**/staff/', route => route.fulfill({ json: [] }));
  await page.route('**/leaves/**', route => {
    if (route.request().method() === 'PATCH') {
      const id = new URL(route.request().url()).pathname.split('/').at(-2);
      const decision = route.request().postDataJSON().decision;
      rows = rows.map(row => row.leave_id === id ? { ...row, status: decision, decision_at: '2026-07-01T09:00:00' } : row);
      return route.fulfill({ json: rows.find(row => row.leave_id === id) });
    }
    return route.fulfill(fail ? { status: 500, json: { detail: 'Leave service unavailable' } } : { json: rows });
  });
  await page.goto('/tests/fixtures/attendance.html');
  await page.getByRole('tab', { name: 'Leave History' }).click();
}
for (const width of [1440, 390, 320]) test(`leave history fits ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  await expect(page.getByRole('complementary', { name: 'Leave request inspector' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`leave-${width}.png`), fullPage: true });
});
test('inspect, paginate, filter, export, approve and reject requests', async ({ page }) => {
  await setup(page);
  const inspector = page.getByRole('complementary', { name: 'Leave request inspector' });
  await expect(inspector.getByText('4 calendar days (inclusive)')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect leave LEV-2', exact: true }).click();
  await expect(inspector.getByText('Reviewed by dispatch')).toBeVisible();
  await page.getByLabel('Leave page', { exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: 'Inspect leave LEV-10', exact: true })).toBeVisible();
  await page.getByLabel('Search leave history').fill('Sarun');
  await expect(page.getByLabel('Leave page', { exact: true })).toHaveValue('1');
  await expect(page.getByText('1-1 of 1')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('leave-history.csv');
  await page.getByRole('button', { name: 'Approve LEV-0', exact: true }).first().click();
  await expect(page.getByText('No pending leave requests')).toBeVisible();
  await expect(inspector.getByText('Approved', { exact: true })).toBeVisible();
  await page.getByLabel('Leave status').selectOption('rejected');
  await expect(page.getByText('No leave requests match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByLabel('Leave type', { exact: true }).selectOption('sick');
  await expect(page.getByText('1-6 of 6')).toBeVisible();
});
test('loading failure is explicit and retry restores history', async ({ page }) => {
  await setup(page, true);
  await expect(page.getByRole('alert')).toContainText('Leave service unavailable');
  await page.route('**/leaves/**', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Retry leaves' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('No leave history yet')).toBeVisible();
});
