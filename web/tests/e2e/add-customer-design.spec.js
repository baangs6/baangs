import { test, expect } from '@playwright/test';

async function open(page) {
  await page.route('**/customers/**', route => route.fulfill({ json: [] }));
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/customers.html');
  await page.getByRole('button', { name: 'Add Customer', exact: true }).click();
  return page.getByRole('dialog', { name: 'Add New Customer' });
}

for (const width of [1440, 768, 390, 320]) {
  test(`add customer form fits ${width}px and updates preview`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const dialog = await open(page);
    await dialog.getByLabel('Customer Name *', { exact: true }).fill('Test Customer');
    await dialog.getByLabel('Nickname (internal)').fill('Central Office');
    await dialog.getByLabel('Phone Number *', { exact: true }).fill('9000000000');
    await dialog.getByLabel('Commercial Office').check();
    await dialog.getByLabel('Location / Landmark').fill('Kannur');
    await expect(dialog.getByRole('complementary', { name: 'Customer summary' })).toContainText('Central Office');
    await expect(dialog.getByRole('complementary', { name: 'Customer summary' })).toContainText('Commercial');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(width);
    await dialog.screenshot({ path: testInfo.outputPath(`add-customer-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('save validates, retains entered fields on failure, and retries successfully', async ({ page }) => {
  const dialog = await open(page);
  let count = 0;
  let payload;
  await page.route('**/customers/', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    count++;
    payload = route.request().postDataJSON();
    return route.fulfill(count === 1 ? { status: 409, json: { detail: 'Customer already exists' } } : { json: { customer_id: 'CUS-NEW' } });
  });
  await dialog.getByRole('button', { name: 'Create Customer' }).click();
  expect(count).toBe(0);
  await dialog.getByLabel('Customer Name *', { exact: true }).fill('Test Customer');
  await dialog.getByLabel('Phone Number *', { exact: true }).fill('invalid');
  await dialog.getByRole('button', { name: 'Create Customer' }).click();
  expect(count).toBe(0);
  await dialog.getByLabel('Phone Number *', { exact: true }).fill('9000000000');
  await dialog.getByLabel('Nickname (internal)').fill('Office');
  await dialog.getByRole('button', { name: 'Create Customer' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Customer already exists');
  await expect(dialog.getByLabel('Nickname (internal)')).toHaveValue('Office');
  await dialog.getByRole('button', { name: 'Create Customer' }).click();
  await expect(dialog).toHaveCount(0);
  expect(payload).toMatchObject({ customer_name: 'Test Customer', nickname: 'Office', phone_number: '9000000000' });
});

test('GPS and clipboard actions populate the map field', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: success => success({ coords: { latitude: 11.8, longitude: 75.4 } }) } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'https://maps.google.com/?q=12,76' } });
  });
  const dialog = await open(page);
  await dialog.getByRole('button', { name: 'Detect Current GPS' }).click();
  await expect(dialog.getByLabel('Map Location (URL)')).toHaveValue('https://maps.google.com/?q=11.8,75.4');
  await dialog.getByRole('button', { name: 'Paste Link' }).click();
  await expect(dialog.getByLabel('Map Location (URL)')).toHaveValue('https://maps.google.com/?q=12,76');
});
