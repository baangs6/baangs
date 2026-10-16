import { test, expect } from '@playwright/test';

for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['narrow-mobile', 320, 800], ['tablet', 768, 1024]]) {
  test(`home design fits ${name} and loads every service image`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('CCTV sales& services.');
    await expect(page.locator('.site-service')).toHaveCount(6);
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('.site-service img, .site-hero-media img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width <= 800) {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Contact', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('enquiry validates the phone, preserves input on error, and displays a real returned ticket', async ({ page }) => {
  let payload;
  let attempts = 0;
  await page.route('**/public/complaints', route => {
    attempts += 1;
    payload = route.request().postDataJSON();
    return route.fulfill(attempts === 1
      ? { status: 429, json: { detail: 'Please try again shortly' } }
      : { json: { success: true, job_id: 'JOB-TEST-001' } });
  });
  await page.goto('/');
  const form = page.getByRole('form', { name: 'Request a Site Evaluation' });
  await form.getByLabel('Full Name').fill('Test Customer');
  await form.getByLabel('Phone Number').fill('123');
  await form.getByLabel('Location & Notes').fill('Kannur, new camera installation');
  await form.getByRole('button', { name: 'Submit Request' }).click();
  await expect(form.getByRole('alert')).toContainText('10-digit');
  expect(attempts).toBe(0);
  await form.getByLabel('Phone Number').fill('+91 98765 43210');
  await form.getByRole('button', { name: 'Submit Request' }).click();
  await expect(form.getByRole('alert')).toHaveText('Please try again shortly');
  await expect(form.getByLabel('Full Name')).toHaveValue('Test Customer');
  await form.getByRole('button', { name: 'Submit Request' }).click();
  await expect(page.getByRole('status')).toContainText('JOB-TEST-001');
  expect(payload).toMatchObject({ customer_name: 'Test Customer', phone_number: '9876543210', work_type: 'inspection' });
  await expect(page.getByRole('status').getByRole('link', { name: 'Track your request' })).toHaveAttribute('href', '/track/JOB-TEST-001');
});
