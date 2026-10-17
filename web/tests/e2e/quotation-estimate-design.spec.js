import { test, expect } from '@playwright/test';

const customer = { customer_id: 'CUS-1', customer_name: 'Test Customer', phone_number: '9000000000', nickname: 'Office', location: 'Kannur' };
const camera = { barcode: 'CAM-1', item_name: 'Camera', model_number: 'CAM-2MP', selling_price: 100, purchase_price: 80, unit_type: 'Nos' };
async function open(page) {
  await page.route('**/quotations/**', route => route.fulfill({ json: [] }));
  await page.route('**/customers/**', route => route.fulfill({ json: [customer] }));
  await page.route('**/inventory/**', route => route.fulfill({ json: route.request().url().includes('price-history') ? { barcode: 'CAM-1', selling: [{ date: '2026-10-01', price: 100, reference: 'JOB-1' }], purchase: [{ date: '2026-10-01', price: 80, reference: 'Purchase' }] } : [camera] }));
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/quotations.html');
  await page.getByRole('button', { name: 'Add Estimate', exact: true }).click();
  await page.getByLabel('Search customer', { exact: true }).fill('Office');
  await page.locator('.quote-customer-result').first().click();
  await page.getByLabel('Item / service', { exact: true }).fill('Camera');
  await page.getByRole('button', { name: 'Camera (CAM-2MP)', exact: true }).click();
  await expect(page.getByText('Last 3 selling prices')).toBeVisible();
}

for (const width of [1440, 1024, 390, 320]) {
  test(`estimate editor fits ${width}px with live financial summary`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page);
    await page.getByLabel('Quantity', { exact: true }).fill('2');
    await page.getByLabel('Discount (%)', { exact: true }).fill('10');
    await page.getByLabel('Tax (%)', { exact: true }).fill('18');
    await expect(page.getByRole('complementary', { name: 'Financial Summary' }).locator('dl > div').last()).toContainText('Rs 212.40');
    await page.getByLabel('Serial number', { exact: true }).fill('SER-1');
    await page.getByLabel('Round off total').check();
    await expect(page.getByRole('complementary', { name: 'Financial Summary' }).locator('dl > div').last()).toContainText('Rs 212.00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`estimate-${width}.png`), fullPage: true });
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

test('item controls and saving retain pricing, serials, and customer profile redirect', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add Item / Service' }).click();
  await expect(page.locator('.quote-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove item 2' }).click();
  await page.getByLabel('Serial number', { exact: true }).fill('SER-1');
  await page.getByLabel('Warranty', { exact: true }).fill('2 years');
  let attempts = 0;
  let payload;
  await page.route('**/quotations/', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    payload = route.request().postDataJSON(); attempts++;
    return route.fulfill(attempts === 1 ? { status: 503, json: { detail: 'Please try again' } } : { json: { ...payload, quote_id: 'QT-NEW', estimation_no: 'CE/2627/001', total: 100, revision: 1, valid_until: '2026-10-26' } });
  });
  await page.getByRole('button', { name: 'Save Quotation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Please try again');
  await expect(page.getByLabel('Serial number', { exact: true })).toHaveValue('SER-1');
  await page.getByRole('button', { name: 'Save Quotation', exact: true }).click();
  await expect(page.getByText('Quotation saved.', { exact: true })).toBeVisible();
  await expect(page.locator('.quote-profile-header')).toContainText('Test Customer');
  expect(payload.customer_id).toBe('CUS-1');
  expect(payload.items[0]).toMatchObject({ name: 'Camera', serial_number: 'SER-1', warranty: '2 years', unit_price: 100 });
});
