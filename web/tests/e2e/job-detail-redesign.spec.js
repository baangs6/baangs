import { test, expect } from '@playwright/test';

const job = { job_id: 'JOB-TEST', customer_name: 'Test Customer', customer_nickname: 'Office', customer_id: 'CUS-1', phone_number: '9000000000', location: 'Kannur', site_type: 'Office', work_type: 'installation', status: 'pending', priority: 'medium', complaint: 'Install cameras at the entrance', service_request_date: '2026-10-16', scheduled_date: '2026-10-17', assigned_staff_id: 'TECH-1', assigned_staff_name: 'Test Technician', additional_staff_names: ['Second Technician'], inventory_used: [{ _id: 'USE-1', barcode: 'CAM', item_name: 'Camera', quantity_used: 1, serial_number: 'SER-001', unit_selling_price: 500 }] };
async function setup(page) {
  await page.route('**/jobs/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/amc') ? { contracts: [], benefits: null } : path.endsWith('/customer-history') ? { history: [] } : job });
  });
  await page.route('**/updates/**', route => route.fulfill({ json: [{ update_id: 'UP-1', staff_name: 'Test Technician', status: 'pending', visit_notes: 'Initial site check', update_time: '2026-10-16' }] }));
  await page.route('**/billing/**', route => route.fulfill({ json: [] }));
  await page.route('**/staff/', route => route.fulfill({ json: [{ staff_id: 'TECH-1', name: 'Test Technician', is_active: true }] }));
  await page.route('**/lookups/', route => route.fulfill({ json: { service_types: [{ value: 'installation', label: 'Installation' }] } }));
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/job-detail.html');
  await expect(page.getByRole('heading', { name: 'JOB-TEST', exact: true })).toBeVisible();
}

for (const width of [1440, 1024, 390, 320]) {
  test(`job detail fits ${width}px and retains ticket, serial, and history data`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await expect(page.locator('.job-detail-main-grid')).toContainText('Second Technician');
    await expect(page.locator('.job-scope-description')).toContainText('Install cameras at the entrance');
    await expect(page.locator('.job-items-section')).toContainText('SER-001');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`job-detail-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('#job-history')).toContainText('Initial site check');
    await page.getByRole('button', { name: 'Customer History', exact: true }).click();
    await expect(page.getByText('No previous service history for this customer')).toBeVisible();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.getByText('No files uploaded')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('edit, status update, and billing actions still open their forms', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Edit Job', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit Job', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Update Status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Update Job Status' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Mark Complete and Bill', exact: true }).click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Jobs' }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});
