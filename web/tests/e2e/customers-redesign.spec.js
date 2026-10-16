import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const customers = Array.from({ length: 245 }, (_, index) => ({ customer_id: `CUS-${index + 1}`, customer_name: `Customer ${index + 1}`, nickname: `Site ${index + 1}`, phone_number: '9000000000', alternative_phone_number: '9111111111', location: index % 2 ? 'Kannur' : 'Bangalore', site_type: index % 2 ? 'Office' : 'Residential', total_jobs: index % 7, latest_request_date: '2026-10-16', first_request_date: '2026-09-01' }));

async function setup(page, handler) {
  await page.route('**/customers/**', route => {
    if (handler) return handler(route);
    const skip = Number(new URL(route.request().url()).searchParams.get('skip') || 0);
    return route.fulfill({ json: route.request().method() === 'GET' ? customers.slice(skip, skip + 200) : { success: true } });
  });
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/customers.html');
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await expect(page.locator('.loading-center')).toHaveCount(0);
}

for (const width of [1440, 1024, 390, 320]) {
  test(`customer directory fits ${width}px and retains contact details`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await expect(page.locator('tbody tr')).toHaveCount(20);
    await expect(page.locator('tbody tr').first()).toContainText('Site 1');
    await expect(page.getByRole('columnheader', { name: 'Nickname', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Customer ID', exact: true })).toHaveCount(0);
    await expect(page.locator('tbody tr').first().locator('td').nth(1)).toHaveText('Site 1');
    await expect(page.locator('tbody tr').first()).toContainText('9111111111');
    await expect(page.locator('.customers-summary')).toContainText('245');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`customers-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Customer 1', exact: true }).click();
    await expect(page).toHaveURL(/\/customers\/CUS-1$/);
    expect(errors).toEqual([]);
  });
}

test('search reaches all customers, filters, sorts, exports, and page jump validates', async ({ page }) => {
  await setup(page);
  const pagination = page.getByRole('navigation', { name: 'Customers pagination' });
  await expect(pagination).toContainText('Showing 1-20 of 245');
  await page.getByRole('spinbutton', { name: 'Jump to page' }).fill('13');
  await page.getByRole('button', { name: 'Jump to page', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(pagination).toContainText('Showing 241-245 of 245');
  await page.getByRole('spinbutton', { name: 'Jump to page' }).fill('14');
  await page.getByRole('button', { name: 'Jump to page', exact: true }).click();
  await expect(pagination).toContainText('Showing 241-245 of 245');
  await page.getByLabel('Search customers').fill('CUS-245');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Customer 245');
  await expect(pagination).toContainText('Showing 1-1 of 1');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await readFile(await (await downloadEvent).path(), 'utf8');
  expect(csv).toContain('CUS-245');
  expect(csv).not.toContain('CUS-244');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Site type', { exact: true }).selectOption('Office');
  await expect(pagination).toContainText('of 122');
  await page.getByLabel('Location', { exact: true }).selectOption('Bangalore');
  await expect(page.getByRole('heading', { name: 'No customers found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Job volume').selectOption('high');
  await expect(page.locator('tbody tr').first()).toContainText('Customer 7');
  await page.getByLabel('Rows per page').selectOption('50');
  await expect(page.locator('tbody tr')).toHaveCount(35);
  await page.getByLabel('Sort customers').selectOption('jobs');
  await expect(page.locator('tbody tr').first().locator('.badge')).toHaveText('6');
});

test('add and edit submit details; delete still requires confirmation', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Add Customer', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add New Customer' });
  await add.locator('input').nth(0).fill('New Customer');
  await add.locator('input').nth(1).fill('Internal Site');
  await add.locator('input').nth(2).fill('9000000000');
  const created = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/customers/');
  await add.getByRole('button', { name: 'Create Customer' }).click();
  expect((await created).postDataJSON()).toMatchObject({ customer_name: 'New Customer', nickname: 'Internal Site' });
  await expect(add).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Customer 1', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Customer' });
  await edit.locator('input').nth(1).fill('Updated Site');
  const updated = page.waitForRequest(request => request.method() === 'PUT' && request.url().endsWith('/customers/CUS-1'));
  await edit.getByRole('button', { name: 'Update Customer' }).click();
  expect((await updated).postDataJSON().nickname).toBe('Updated Site');
  await expect(edit).toHaveCount(0);
  let deleted = false;
  page.on('request', request => { if (request.method() === 'DELETE') deleted = true; });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete Customer 1', exact: true }).click();
  expect(deleted).toBe(false);
});

test('loading errors display retry and recover', async ({ page }) => {
  let fail = true;
  await setup(page, route => route.fulfill(fail ? { status: 503, json: {} } : { json: customers.slice(0, 5) }));
  await expect(page.getByRole('alert')).toContainText('Unable to load customers');
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
});
