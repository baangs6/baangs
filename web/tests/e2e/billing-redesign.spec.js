import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const bills = Array.from({ length: 14 }, (_, index) => ({ billing_id: `BILL-${index+1}`, job_id: `JOB-${index+1}`, customer_name: `Customer ${index+1}`, complete_date: '2026-10-17', work_type: 'maintenance', invoice_amount: index === 0 ? 500 : index === 1 ? 0 : 1000, collected_amount: index === 0 ? 650 : index === 1 ? 16500 : index === 2 ? '200' : 0, expense: index < 2 ? 0 : 100, material_amount: index < 2 ? 0 : 200, payment_mode: 'cash', payment_id: `PAY-${index+1}` }));
async function open(page, handler) {
  await page.route('**/billing/**', route => {
    if (handler) return handler(route);
    return route.fulfill(route.request().url().includes('invoice.pdf') ? { body: '%PDF-1.4\nMock invoice', contentType: 'application/pdf' } : { json: bills });
  });
  await page.route('**/jobs/**', route => {
    const job_id = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ json: { job_id, customer_name: 'Test Customer', location: 'Kannur', phone_number: '9000000000', assigned_staff_name: 'Test Technician', inventory_used: [] } });
  });
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/billing.html');
  await expect(page.getByRole('heading', { name: 'Billing & Revenue' })).toBeVisible();
  await expect(page.locator('.loading-center')).toHaveCount(0);
}
for (const width of [1440, 1024, 390, 320]) {
  test(`billing view fits ${width}px with correct financial breakdown`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page);
    await expect(page.locator('.billing-invoice')).toHaveCount(6);
    const metrics = page.getByRole('region', { name: 'Billing totals' });
    await expect(metrics).toContainText('Rs 12,500.00');
    await expect(metrics).toContainText('Rs 8,900.00');
    await expect(metrics).toContainText('Rs 17,350.00');
    await expect(metrics).toContainText('Rs 11,800.00 outstanding');
    const inspector = page.getByRole('complementary', { name: 'Invoice details' });
    await expect(inspector.locator('.billing-profit')).toContainText('Rs 500.00');
    await expect(inspector.locator('.billing-breakdown > div').filter({ hasText: 'Collected Above Invoice' })).toContainText('Rs 150.00');
    await expect(inspector).toContainText('Test Technician');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`billing-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('selection, invoice states, filtering, month and pagination remain consistent', async ({ page }) => {
  const queries = [];
  await open(page, route => { queries.push(new URL(route.request().url()).searchParams.get('month')); return route.fulfill({ json: bills }); });
  await page.getByRole('button', { name: 'Inspect JOB-2', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Invoice details' })).toContainText('Unbilled collection');
  await page.getByRole('button', { name: 'Inspect JOB-3', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Invoice details' })).toContainText('Partially collected');
  const pagination = page.getByRole('navigation', { name: 'Billing pagination' });
  await pagination.getByRole('spinbutton', { name: 'Jump to page' }).fill('3');
  await pagination.getByRole('button', { name: 'Jump to page', exact: true }).click();
  await expect(page.locator('.billing-invoice')).toHaveCount(2);
  await page.getByRole('button', { name: 'Pending (12)', exact: true }).click();
  await expect(pagination).toContainText('Showing 1-6 of 12');
  await page.getByLabel('Search invoices').fill('Customer 3');
  await expect(page.locator('.billing-invoice')).toHaveCount(1);
  await page.getByLabel('Billing month').fill('2026-09');
  await expect.poll(() => queries.at(-1)).toBe('2026-09');
  await page.getByRole('link', { name: 'Open job JOB-3', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/JOB-3$/);
});

test('filtered CSV and PDF downloads and native file sharing work', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__sharedFiles = data.files.map(file => file.name); } });
  });
  await open(page);
  await page.getByLabel('Search invoices').fill('PAY-1');
  const csvEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await readFile(await (await csvEvent).path(), 'utf8');
  expect(csv).toContain('"JOB-1"'); expect(csv).not.toContain('"JOB-2"');
  const pdfEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Invoice PDF' }).click();
  expect((await pdfEvent).suggestedFilename()).toBe('JOB-1-invoice.pdf');
  await expect(page.getByRole('button', { name: 'WhatsApp Invoice' })).toBeEnabled();
  await page.getByRole('button', { name: 'WhatsApp Invoice' }).click();
  await expect.poll(() => page.evaluate(() => window.__sharedFiles)).toEqual(['JOB-1-invoice.pdf']);
});

test('failed billing loads have retry and missing PDF endpoint uses existing generator', async ({ page }) => {
  let fail = true;
  await open(page, route => route.fulfill(route.request().url().includes('invoice.pdf') ? { status: 404, json: {} } : fail ? { status: 503, json: {} } : { json: bills }));
  await expect(page.getByRole('alert')).toContainText('Unable to load billing');
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('complementary', { name: 'Invoice details' })).toContainText('Test Technician');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Invoice PDF' }).click();
  const pdf = await readFile(await (await downloaded).path(), 'utf8');
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
});
