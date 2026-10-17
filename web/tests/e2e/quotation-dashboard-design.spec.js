import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const rows = Array.from({ length: 25 }, (_, index) => ({ quote_id: `QT-${index + 1}`, estimation_no: `CE/2627/${index + 1}`, customer_name: `Customer ${index + 1}`, phone_number: '9000000000', address: 'Kannur', prepared_by: 'Admin', status: index === 0 ? 'accepted' : 'draft', total: 1000, quote_date: '2026-10-16', valid_until: '2026-10-26', revision: 1, items: [] }));
async function setup(page) {
  await page.route('**/quotations/**', route => route.fulfill({ json: rows }));
  await page.route('**/customers/**', route => route.fulfill({ json: [] }));
  await page.route('**/inventory/**', route => route.fulfill({ json: [] }));
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/quotations.html');
  await expect(page.getByRole('heading', { name: 'Quotations & Estimates' })).toBeVisible();
  await expect(page.locator('.quote-transactions tbody tr')).toHaveCount(10);
}
for (const width of [1440, 1024, 390, 320]) {
  test(`quotation dashboard fits ${width}px with correct totals`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    const metrics = page.locator('.quote-pipeline-metrics > div');
    await expect(metrics.nth(0)).toContainText('25,000');
    await expect(metrics.nth(1)).toContainText('24,000');
    await expect(metrics.nth(2)).toContainText('1,000');
    await expect(metrics.nth(3)).toContainText('1,000');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`quotation-dashboard-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('pagination, filtered export, print summary, and customer views work', async ({ page }) => {
  await setup(page);
  const pagination = page.getByRole('navigation', { name: 'Quotation pagination' });
  await pagination.getByRole('spinbutton', { name: 'Jump to page' }).fill('3');
  await pagination.getByRole('button', { name: 'Jump to page', exact: true }).click();
  await expect(pagination).toContainText('Showing 21-25 of 25');
  await page.getByLabel('Quotation status', { exact: true }).selectOption('accepted');
  await expect(pagination).toContainText('Showing 1-1 of 1');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await readFile(await (await downloaded).path(), 'utf8');
  expect(csv).toContain('"CE/2627/1"');
  expect(csv).not.toContain('"CE/2627/2"');
  await page.evaluate(() => {
    window.open = () => {
      const doc = document.implementation.createHTMLDocument('Print');
      return { document: doc, opener: null, focus() {}, print() { window.__printedSummary = doc.body.textContent; } };
    };
  });
  await page.getByRole('button', { name: 'Print Summary' }).click();
  expect(await page.evaluate(() => window.__printedSummary)).toContain('Customer 1');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('group', { name: 'Quotation views' }).getByRole('button', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Quotations Given' })).toBeVisible();
  await page.getByRole('group', { name: 'Quotation views' }).getByRole('button', { name: 'Quotations', exact: true }).click();
  await page.getByRole('button', { name: 'Add Estimate' }).click();
  await expect(page.getByText('New quotation', { exact: true })).toBeVisible();
});

test('inline quotation status updates preserve revision and refresh metrics', async ({ page }) => {
  await setup(page);
  let payload;
  await page.route('**/quotations/QT-1*', route => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { ...rows[0], status: payload.status, revision: 2 } });
  });
  const status = page.getByLabel('Status for CE/2627/1', { exact: true });
  await status.selectOption('sent');
  await expect(status).toHaveValue('sent');
  await expect(page.locator('.quote-pipeline-metrics > div').nth(2)).toContainText('0 accepted proposals');
  expect(payload.status).toBe('sent');
});
