import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const rows = Array.from({ length: 12 }, (_, i) => ({ staff_id: `STAFF-${i}`, name: i === 0 ? 'Sarun Technician' : `Technician ${i}`, salary_type: i % 2 ? 'monthly' : 'daily', present_days: 10, paid_leave_days: 1, unpaid_leave_days: 2, payable_days: 11, base_pay: '1100', overtime_hours: 2, overtime_pay: 100, allowance: 50, deduction: 25, gross_pay: 1250, net_pay: '1225' }));
async function setup(page, fail = false) {
  await page.route('**/attendance/', route => route.fulfill({ json: [] }));
  await page.route('**/staff/', route => route.fulfill({ json: [] }));
  await page.route('**/leaves/**', route => route.fulfill({ json: [] }));
  await page.route('**/staff/payroll/summary*', route => route.fulfill(fail ? { status: 500, json: { detail: 'Payroll unavailable' } } : { json: { totals: { total_staff: 12, total_gross_pay: 15000, total_net_pay: 14700 }, items: rows } }));
  await page.goto('/tests/fixtures/attendance.html');
  await page.getByRole('tab', { name: 'Payroll', exact: true }).click();
}
for (const width of [1440, 390, 320]) test(`payroll fits ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  await expect(page.getByRole('complementary', { name: 'Payroll breakdown' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`payroll-${width}.png`), fullPage: true });
});
test('payroll totals, breakdown, salary filters, pagination, month and CSV', async ({ page }) => {
  await setup(page);
  const panel = page.getByRole('complementary', { name: 'Payroll breakdown' });
  await expect(page.locator('.payroll-metrics')).toContainText('Rs 15,000.00');
  await expect(page.locator('.payroll-metrics')).toContainText('Rs 14,700.00');
  await expect(panel.locator('.payroll-net')).toContainText('Rs 1,225.00');
  await expect(panel.getByText('Overtime hours', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect payroll for STAFF-1', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Technician 1', exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const file = await download; expect(file.suggestedFilename()).toMatch(/^payroll-\d{4}-\d{2}\.csv$/);
  const csv = await readFile(await file.path(), 'utf8');
  expect(csv).toContain('STAFF-11'); expect(csv.split('\r\n')).toHaveLength(13);
  await page.getByLabel('Payroll page', { exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: 'Inspect payroll for STAFF-10', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Daily Wage (6)', exact: true }).click();
  await expect(page.getByLabel('Payroll page', { exact: true })).toHaveValue('1');
  await expect(page.locator('.payroll-metrics')).toContainText('Rs 7,350.00');
  await page.getByLabel('Search payroll').fill('Sarun');
  await expect(page.getByText('1-1 of 1')).toBeVisible();
  await page.getByRole('button', { name: 'Monthly (6)', exact: true }).click();
  await expect(page.getByText('No staff match these filters')).toBeVisible();
  await page.getByLabel('Search payroll').fill('');
  const request = page.waitForRequest(req => req.url().includes('/staff/payroll/summary') && req.url().includes('month=2026-09'));
  await page.getByLabel('Payroll month', { exact: true }).fill('2026-09'); await request;
  await expect(panel.getByText('2026-09', { exact: true })).toBeVisible();
});
test('payroll failure is visible and retry restores an empty month', async ({ page }) => {
  await setup(page, true);
  await expect(page.getByRole('alert')).toContainText('Payroll unavailable');
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await page.route('**/staff/payroll/summary*', route => route.fulfill({ json: { items: [], totals: {} } }));
  await page.getByRole('button', { name: 'Retry payroll' }).click();
  await expect(page.getByText('No payroll rows for this month')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
