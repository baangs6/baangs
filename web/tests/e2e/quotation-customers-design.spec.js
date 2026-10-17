import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const rows = Array.from({ length: 12 }, (_, index) => ({ quote_id: `QT-${index + 1}`, estimation_no: `CE/2627/${index + 1}`, customer_id: index < 6 ? `CUS-${index + 1}` : null, customer_name: `Customer ${index + 1}`, phone_number: `90000000${String(index).padStart(2,'0')}`, address: index < 6 ? 'Kannur' : 'Bangalore', status: 'draft', quote_date: '2026-10-16', valid_until: '2026-10-26', prepared_by: 'Admin', total: 1000, revision: 1, items: [] }));
rows.push({ ...rows[0], quote_id: 'QT-EXTRA', estimation_no: 'CE/2627/1A', status: 'accepted', total: 2000, quote_date: '2026-10-17' });
async function open(page) {
  await page.route('**/quotations/**', route => route.fulfill({ json: rows }));
  await page.route('**/customers/**', route => route.fulfill({ json: [] }));
  await page.route('**/inventory/**', route => route.fulfill({ json: [] }));
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/quotations.html');
  await page.getByRole('group', { name: 'Quotation views' }).getByRole('button', { name: 'Customers', exact: true }).click();
  await expect(page.locator('.quote-account-table tbody tr')).toHaveCount(10);
}
for (const width of [1440, 1024, 390, 320]) {
  test(`quotation customer view fits ${width}px with real grouped totals`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page);
    const metrics = page.getByRole('region', { name: 'Quotation customer metrics' });
    await expect(metrics).toContainText('13 quotations issued');
    await expect(metrics).toContainText('14,000');
    await expect(metrics).toContainText('6 / 6');
    await expect(page.locator('.quote-account-table tbody tr').first()).toContainText('2 quotes');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`quotation-customers-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('type, search, status, export, and page jump filter customer accounts', async ({ page }) => {
  await open(page);
  const pagination = page.getByRole('navigation', { name: 'Quotation pagination' });
  await pagination.getByRole('spinbutton', { name: 'Jump to page' }).fill('2');
  await pagination.getByRole('button', { name: 'Jump to page', exact: true }).click();
  await expect(page.locator('.quote-account-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Quotation Only (6)', exact: true }).click();
  await expect(page.locator('.quote-account-table tbody tr')).toHaveCount(6);
  await expect(pagination).toContainText('Showing 1-6 of 6');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await readFile(await (await downloaded).path(), 'utf8');
  expect(csv).toContain('Customer 7');
  expect(csv).not.toContain('"Customer 1"');
  await page.getByLabel('Search quotation customers').fill('Bangalore');
  await expect(page.locator('.quote-account-table tbody tr')).toHaveCount(6);
  await page.getByLabel('Search quotation customers').fill('CE/2627/12');
  await expect(page.locator('.quote-account-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Saved (6)', exact: true }).click();
  await page.getByLabel('Quotation status', { exact: true }).selectOption('accepted');
  await expect(page.locator('.quote-account-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.quote-account-table')).toContainText('Customer 1');
});

test('View Quotes opens the existing customer quotation profile and history', async ({ page }) => {
  await open(page);
  await page.locator('.quote-account-table tbody tr').first().getByRole('button', { name: 'View Quotes' }).click();
  await expect(page.locator('.quote-profile-header')).toContainText('Customer 1');
  await expect(page.locator('.quote-transactions tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'New Quotation for Customer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Job', exact: true })).toBeVisible();
});
