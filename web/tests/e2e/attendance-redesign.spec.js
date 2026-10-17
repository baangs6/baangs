import { test, expect } from '@playwright/test';
const rows = Array.from({ length: 12 }, (_, i) => ({ attendance_id: `ATT-${i}`, staff_id: `STF-${i}`, staff_name: i === 0 ? 'Sarun Technician' : `Technician ${i}`, date: '2026-10-17', checkin_time: '2026-10-17T07:21:22', checkout_time: i % 2 ? '2026-10-17T16:30:00' : null, is_checked_out: !!(i % 2), checkin_latitude: 0, checkin_longitude: 75.3704, remarks: `Site ${i}`, checkout_remarks: i % 2 ? 'Completed shift' : null, checkin_photo_url: i === 0 ? '/tests/fixtures/attendance-photo.png' : null }));
async function setup(page, fail = false) {
  await page.route('**/attendance/', route => route.fulfill(fail ? { status: 500, json: { detail: 'Attendance unavailable' } } : { json: rows }));
  await page.route('**/staff/', route => route.fulfill({ json: [{ staff_id: 'STF-0', name: 'Sarun Technician' }] }));
  await page.route('**/leaves/**', route => route.fulfill({ json: [] }));
  await page.route('**/attendance/allowances*', route => route.fulfill({ json: [] }));
  await page.route('**/staff/payroll/summary*', route => route.fulfill({ json: { totals: { total_staff: 1 }, items: [] } }));
  await page.route('**/export/attendance.csv', route => route.fulfill({ contentType: 'text/csv', body: 'staff,date\nSarun,2026-10-17' }));
  await page.route('**/attendance-photo.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mcAAAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/tests/fixtures/attendance.html');
}
for (const width of [1440, 1024, 390, 320]) test(`attendance layout fits ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  await expect(page.getByRole('complementary', { name: 'Punch inspector' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`attendance-${width}.png`), fullPage: true });
});
test('search, status, selection, page jump, photos and export', async ({ page }) => {
  await setup(page);
  const inspector = page.getByRole('complementary', { name: 'Punch inspector' });
  await expect(inspector.getByRole('heading', { name: 'Sarun Technician' })).toBeVisible();
  await expect(inspector.getByRole('link').first()).toHaveAttribute('href', 'https://maps.google.com/?q=0,75.3704');
  await page.getByRole('button', { name: 'Open check-in photo' }).click();
  await expect(page.getByRole('dialog', { name: 'Attendance photo' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Inspect Technician 1 on/ }).click();
  await expect(inspector.getByText('Completed shift')).toBeVisible();
  await page.getByLabel('Attendance page', { exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: /Inspect Technician 10 on/ })).toBeVisible();
  await page.getByLabel('Search attendance').fill('Sarun');
  await expect(page.getByLabel('Attendance page', { exact: true })).toHaveValue('1');
  await expect(page.getByText('1-1 of 1')).toBeVisible();
  await page.getByLabel('Attendance status').selectOption('out');
  await expect(page.getByRole('heading', { name: 'No attendance records' })).toBeVisible();
  await page.getByLabel('Search attendance').fill('');
  await expect(page.getByText('1-6 of 6')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('attendance.csv');
});
test('other tabs and attendance error retry remain usable', async ({ page }) => {
  await setup(page, true);
  await expect(page.getByRole('alert')).toContainText('Attendance unavailable');
  await page.route('**/attendance/', route => route.fulfill({ json: rows }));
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('complementary')).toBeVisible();
  await page.getByRole('tab', { name: 'Leave History' }).click();
  await expect(page.getByText('No leave history yet')).toBeVisible();
  await page.getByRole('tab', { name: 'Payroll' }).click();
  await expect(page.getByText('Employees', { exact: true })).toBeVisible();
  await expect(page.getByText('No payroll rows for this month')).toBeVisible();
  await page.getByRole('tab', { name: 'Daily Allowance' }).click();
  await expect(page.getByText('No expense rows found')).toBeVisible();
});
