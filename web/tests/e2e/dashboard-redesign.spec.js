import { test, expect } from '@playwright/test';

async function mockDashboard(page) {
  await page.addInitScript(() => localStorage.setItem('dashboard_date_filter_v1', JSON.stringify({ from: '2026-10-01', to: '2026-10-31' })));
  await page.route('**/dashboard/**', route => {
    const path = new URL(route.request().url()).pathname.split('/').pop();
    const data = {
      summary: { jobs: { total: 52, in_progress: 12, complete: 39, pending: 1 }, revenue: { total: 7500, profit: 5000 }, customers: { total: 38 }, staff: { total: 8 } },
      'jobs-by-status': [{ status: 'complete', count: 39 }, { status: 'in_progress', count: 12 }, { status: 'pending', count: 1 }],
      'jobs-by-priority': [{ priority: 'low', count: 20 }, { priority: 'medium', count: 32 }],
      'monthly-revenue': [{ month: 'Sep', revenue: 5000, profit: 3000 }, { month: 'Oct', revenue: 7500, profit: 5000 }],
      'technician-performance': [{ staff_id: 'TECH-1', staff_name: 'Test Technician' }],
      'technician-performance-deep-dive': [{ staff_id: 'TECH-1', attendance_days: 3, working_hours: 12, total_installation_completed: 2, total_service_attended: 4 }],
      'field-staff-status': [{ staff_id: 'TECH-1', staff_name: 'Test Technician', job_id: 'JOB-TEST', customer_name: 'Test Customer', status: 'On job', last_update_time: '2026-10-16T10:00:00', map_url: 'https://maps.google.com/?q=11,75' }],
    };
    return route.fulfill({ json: data[path] || [] });
  });
  await page.route('**/notifications/**', route => route.fulfill({ json: route.request().url().includes('count') ? { count: 0 } : [] }));
  await page.goto('/tests/fixtures/dashboard.html');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

for (const width of [1440, 1024, 390, 320]) {
  test(`dashboard fits ${width}px with live-data panels`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mockDashboard(page);
    await expect(page.locator('.dashboard-metric')).toHaveCount(8);
    await expect(page.locator('.dashboard-dispatch')).toContainText('Test Customer');
    await expect(page.locator('.dashboard-performance')).toContainText('12.0h');
    await expect(page.locator('.dashboard-revenue .recharts-surface[role="application"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('metric links retain dates and status, and dispatch jobs open', async ({ page }) => {
  await mockDashboard(page);
  await page.getByRole('button', { name: /In Progress.*12/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/jobs\?status=in_progress&date_from=2026-10-01&date_to=2026-10-31/);
  await page.getByRole('button', { name: 'JOB-TEST Test Customer', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/JOB-TEST$/);
});
