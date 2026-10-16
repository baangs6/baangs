import { test, expect } from '@playwright/test';

const customer = { customer_id: 'CUS-1', customer_name: 'Test Customer', nickname: 'Central Office', phone_number: '9000000000', alternative_phone_number: '9111111111', location: 'Kannur', map_location: '11.8,75.4', site_type: 'Office', total_jobs: 2, first_request_date: '2026-04-12', latest_request_date: '2026-10-07' };
async function setup(page, failProfile = () => false) {
  await page.route('**/customers/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json = customer;
    if (path.endsWith('/amc')) json = [{ amc_id: 'AMC-1', location: 'Kannur', nickname: 'Central Office', status: 'active', start_date: '2026-04-12', end_date: '2027-04-11', free_visits_used: 1, free_visits_remaining: 3, days_remaining: 180, extra_visits: 0, amount: 2500, visits: [] }];
    else if (path.endsWith('/warranty')) json = [{ usage_id: 'USE-1', item_name: 'Camera', model_number: 'CAM-2MP', serial_number: 'SERIAL-1', quantity_used: 2, installation_date: '2026-04-12', days_completed: 180, warranty_years: 1, warranty_expiry: '2027-04-12', warranty_status: 'under_warranty', days_remaining: 185, job_id: 'JOB-1' }];
    else if (path.endsWith('/jobs')) json = [{ job_id: 'JOB-1', work_type: 'installation', status: 'complete', priority: 'medium', service_request_date: '2026-04-12' }, { job_id: 'JOB-2', work_type: 'maintenance', status: 'pending', priority: 'high', service_request_date: '2026-10-07' }];
    else if (path === '/customers/') json = [customer];
    else if (failProfile()) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({ json });
  });
  await page.route('**/quotations/**', route => route.fulfill({ json: [{ quote_id: 'QT-1', estimation_no: 'CE/2627/001', customer_id: 'CUS-1', customer_name: 'Test Customer', phone_number: '9000000000', total: 2500, status: 'draft', quote_date: '2026-10-01', items: [] }] }));
  await page.route('**/inventory/**', route => route.fulfill({ json: [] }));
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/customer-profile.html');
}

for (const width of [1440, 1024, 390, 320]) {
  test(`customer profile fits ${width}px with real record tabs`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await expect(page.getByRole('heading', { name: 'Test Customer' })).toBeVisible();
    await expect(page.locator('.profile-nickname')).toHaveText('Central Office');
    await expect(page.locator('.profile-amc')).toContainText('3 remaining');
    await expect(page.getByRole('tabpanel', { name: /Job History/ })).toContainText('JOB-1');
    await expect(page.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', 'https://wa.me/919000000000');
    await page.getByRole('tab', { name: /Products & Warranty/ }).click();
    await expect(page.getByRole('tabpanel', { name: /Products/ })).toContainText('SERIAL-1');
    await expect(page.getByRole('tabpanel', { name: /Products/ })).toContainText('Under warranty');
    await page.getByRole('tab', { name: 'Quotations Given' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Quotations Given' })).toContainText('CE/2627/001');
    await page.getByRole('tab', { name: /Job History/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('tabs support keyboard, jobs open, and new forms receive the customer', async ({ page }) => {
  await setup(page);
  const jobsTab = page.getByRole('tab', { name: /Job History/ });
  await jobsTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Products/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await page.getByRole('link', { name: 'JOB-1', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/JOB-1$/);
  await setup(page);
  await page.getByRole('button', { name: 'New Job', exact: true }).click();
  await expect(page.getByTestId('destination')).toContainText('Central Office');
  await expect(page).toHaveURL(/\/jobs\/create$/);
  await setup(page);
  await page.getByRole('button', { name: 'Add Quotation', exact: true }).click();
  await expect(page).toHaveURL(/\/quotations$/);
  await expect(page.getByText('New quotation', { exact: true })).toBeVisible();
  await expect(page.locator('input[value="Test Customer"]').first()).toBeVisible();
});

test('profile failure shows retry rather than an infinite spinner', async ({ page }) => {
  let fail = true;
  await setup(page, () => fail);
  await expect(page.getByRole('alert')).toContainText('Unable to load customer profile');
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Test Customer' })).toBeVisible();
});
