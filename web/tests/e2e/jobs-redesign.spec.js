import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const jobs = [
  { job_id: 'JOB-TEST-001', customer_name: 'Test Customer', customer_nickname: 'Office', phone_number: '9000000000', location: 'Kannur', work_type: 'installation', status: 'in_progress', priority: 'high', assigned_staff_id: 'TECH-1', assigned_staff_name: 'Test Technician', scheduled_date: '2026-10-16', amc_coverage: { free_visits_used: 1, free_visits_remaining: 3 } },
  { job_id: 'JOB-TEST-002', customer_name: 'Completed Customer', work_type: 'maintenance', status: 'complete', priority: 'low', scheduled_date: '2026-10-15' },
  { job_id: 'JOB-TEST-003', customer_name: 'Request Customer', is_public_submission: true, request_status: 'pending', work_type: 'maintenance', status: 'pending', priority: 'urgent' },
];

async function setup(page, onList) {
  await page.route('**/jobs/**', route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.fulfill({ json: { success: true } });
    if (onList) return onList(route, url);
    const status = url.searchParams.get('status');
    return route.fulfill({ json: jobs.filter(job => !status || job.status === status) });
  });
  await page.route('**/staff/', route => route.fulfill({ json: [{ staff_id: 'TECH-1', name: 'Test Technician', is_active: true }] }));
  await page.route('**/lookups/', route => route.fulfill({ json: { service_types: [{ value: 'installation', label: 'Installation' }] } }));
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/jobs.html');
  await expect(page.getByRole('heading', { name: 'Jobs & Service Requests' })).toBeVisible();
}

for (const width of [1440, 1024, 390, 320]) {
  test(`jobs design fits ${width}px and preserves job details`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page);
    await expect(page.locator('.jobs-row')).toHaveCount(2);
    await expect(page.locator('.jobs-row').first()).toContainText('Office');
    await expect(page.locator('.jobs-row').first()).toContainText('3 remaining');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`jobs-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Open JOB-TEST-001', exact: true }).click();
    await expect(page).toHaveURL(/\/jobs\/JOB-TEST-001$/);
    expect(errors).toEqual([]);
  });
}

test('filters retain dashboard dates, export visible jobs, and reset', async ({ page }) => {
  const requests = [];
  await setup(page, (route, url) => {
    requests.push(url.searchParams);
    return route.fulfill({ json: jobs.filter(job => !url.searchParams.get('status') || job.status === url.searchParams.get('status')) });
  });
  await page.getByLabel('Status', { exact: true }).selectOption('complete');
  await expect(page.locator('.jobs-row')).toHaveCount(1);
  expect(requests.at(-1).get('date_from')).toBe('2026-10-01');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadEvent;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('JOB-TEST-002');
  expect(csv).not.toContain('JOB-TEST-001');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.jobs-row')).toHaveCount(2);
  expect(requests.at(-1).has('date_from')).toBe(false);
});

test('customer request actions keep confirmation flows', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Customer Requests/ }).click();
  await expect(page.locator('.jobs-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Accept Customer Request' })).toBeVisible();
  await page.locator('.modal .form-select').selectOption('TECH-1');
  const accept = page.waitForRequest(request => request.url().endsWith('/JOB-TEST-003/accept') && request.method() === 'PATCH');
  await page.getByRole('button', { name: 'Accept & Assign' }).click();
  expect((await accept).postDataJSON().assigned_staff_id).toBe('TECH-1');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.locator('.modal textarea').fill('Unavailable');
  const reject = page.waitForRequest(request => request.url().endsWith('/JOB-TEST-003/reject') && request.method() === 'PATCH');
  await page.getByRole('button', { name: 'Reject Request', exact: true }).click();
  expect((await reject).postDataJSON().remark).toBe('Unavailable');
  await page.getByRole('button', { name: 'Delete JOB-TEST-003' }).click();
  await expect(page.getByRole('heading', { name: 'Delete Customer Request' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
});

test('load failure has a retry instead of a misleading empty list', async ({ page }) => {
  let fail = true;
  await setup(page, route => route.fulfill(fail ? { status: 503, json: { detail: 'Jobs temporarily unavailable' } } : { json: jobs }));
  await expect(page.getByRole('alert')).toContainText('Jobs temporarily unavailable');
  fail = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.jobs-row')).toHaveCount(2);
});

test('pagination navigates all records and resets for page size, tabs, and filters', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const manyJobs = Array.from({ length: 45 }, (_, index) => ({ ...jobs[1], job_id: `JOB-PAGE-${index + 1}`, customer_name: `Customer ${index + 1}` }));
  await setup(page, route => route.fulfill({ json: manyJobs }));
  const pagination = page.getByRole('navigation', { name: 'Jobs pagination' });
  await expect(page.locator('.jobs-row')).toHaveCount(20);
  await expect(pagination).toContainText('Showing 1-20 of 45');
  await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Next page' }).click();
  await expect(pagination).toContainText('Showing 21-40 of 45');
  await pagination.getByRole('button', { name: 'Page 3', exact: true }).click();
  await expect(page.locator('.jobs-row')).toHaveCount(5);
  await expect(pagination.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByLabel('Rows per page').selectOption('10');
  await expect(pagination).toContainText('Showing 1-10 of 45');
  const jump = page.getByRole('spinbutton', { name: 'Jump to page' });
  await jump.fill('4');
  await jump.press('Enter');
  await expect(pagination).toContainText('Showing 31-40 of 45');
  await expect(jump).toHaveValue('4');
  await jump.fill('6');
  await pagination.getByRole('button', { name: 'Jump to page', exact: true }).click();
  await expect(pagination).toContainText('Showing 31-40 of 45');
  expect(await jump.evaluate(input => input.validity.rangeOverflow)).toBe(true);
  await jump.fill('0');
  await jump.press('Enter');
  expect(await jump.evaluate(input => input.validity.rangeUnderflow)).toBe(true);
  await jump.fill('1.5');
  await jump.press('Enter');
  expect(await jump.evaluate(input => input.validity.stepMismatch)).toBe(true);
  await jump.fill('');
  await jump.press('Enter');
  expect(await jump.evaluate(input => input.validity.valueMissing)).toBe(true);
  await jump.fill('2');
  await pagination.getByRole('button', { name: 'Jump to page', exact: true }).click();
  await expect(pagination).toContainText('Showing 11-20 of 45');
  await pagination.getByRole('button', { name: 'Page 5', exact: true }).click();
  await page.getByLabel('Status', { exact: true }).selectOption('complete');
  await expect(pagination).toContainText('Showing 1-10 of 45');
  await pagination.getByRole('button', { name: 'Page 5', exact: true }).click();
  await page.getByRole('button', { name: /Customer Requests/ }).click();
  await expect(pagination).toHaveCount(0);
  await page.getByRole('button', { name: /All Work Orders/ }).click();
  await expect(pagination).toContainText('Showing 1-10 of 45');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
