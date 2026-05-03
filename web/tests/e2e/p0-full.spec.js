import { test, expect, request } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8000';

async function apiLogin(api, username, password, platform = 'web') {
  const res = await api.post(`${API_BASE}/auth/login`, {
    data: { username, password, platform },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.access_token;
}

async function loginWeb(page, username = 'sahil', password = 'password123') {
  await page.goto('/');
  await page.locator('input[placeholder="Enter username"]').fill(username);
  await page.locator('input[placeholder="Enter password"]').fill(password);
  await page.getByRole('button', { name: /login/i }).click();
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
}

test.describe('P0 Full (API-seeded cross-module)', () => {
  test('job create/verify/update flow + invoice persistence', async ({ page }) => {
    const uniq = Date.now();
    const customerName = `E2E Customer ${uniq}`;
    const phone = `98${String(uniq).slice(-8)}`;
    const api = await request.newContext();
    const techToken = await apiLogin(api, 'sarun', 'password123', 'mobile');
    const adminToken = await apiLogin(api, 'sahil', 'password123', 'web');

    const customerRes = await api.post(`${API_BASE}/customers/`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { customer_name: customerName, phone_number: phone, location: 'Kochi', site_type: 'Office' },
    });
    expect(customerRes.ok()).toBeTruthy();

    const createJobRes = await api.post(`${API_BASE}/jobs/`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        customer_name: customerName,
        phone_number: phone,
        location: 'Kochi',
        site_type: 'Office',
        work_type: 'installation',
        complaint: 'Install test camera set',
        priority: 'medium',
        assigned_staff_id: 'STF-SARUN01',
      },
    });
    expect(createJobRes.ok()).toBeTruthy();
    const createdJob = await createJobRes.json();
    const jobId = createdJob.job_id;

    await loginWeb(page);
    await page.getByRole('link', { name: /jobs/i }).click();
    await expect(page.getByText(jobId)).toBeVisible();
    await page.getByText(jobId).click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}$`));

    const updateRes = await api.post(`${API_BASE}/updates/`, {
      headers: { Authorization: `Bearer ${techToken}` },
      data: {
        job_id: jobId,
        status: 'complete',
        visit_notes: 'Completed by E2E test',
        invoice_amount: 5100,
        collected_amount: 2000,
        expense: 300,
      },
    });
    expect(updateRes.ok()).toBeTruthy();

    const jobRes = await api.get(`${API_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(jobRes.ok()).toBeTruthy();
    const jobData = await jobRes.json();
    expect(jobData.status).toBe('complete');

    const billingListRes = await api.get(`${API_BASE}/billing/`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(billingListRes.ok()).toBeTruthy();
    const bills = await billingListRes.json();
    const row = bills.find((b) => b.job_id === jobId);
    expect(row).toBeTruthy();
    expect(Number(row.invoice_amount)).toBeGreaterThanOrEqual(5100);
  });

  test('attendance admin view + leave approve flow + billing visibility', async ({ page }) => {
    const api = await request.newContext();
    const techToken = await apiLogin(api, 'sarun', 'password123', 'mobile');
    const adminToken = await apiLogin(api, 'sahil', 'password123', 'web');
    const uniq = Date.now();

    const leaveReason = `E2E leave request ${uniq}`;
    const leaveApply = await api.post(`${API_BASE}/leaves/`, {
      headers: { Authorization: `Bearer ${techToken}` },
      data: {
        leave_type: 'casual',
        from_date: '2026-05-20',
        to_date: '2026-05-21',
        reason: leaveReason,
      },
    });
    expect(leaveApply.ok()).toBeTruthy();
    const leave = await leaveApply.json();

    await loginWeb(page);
    await page.getByRole('link', { name: /attendance/i }).click();
    await expect(page.getByRole('heading', { name: /attendance report/i })).toBeVisible();

    await page.getByRole('button', { name: /attendance log/i }).click();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Sarun' }).first()).toBeVisible();

    await page.getByRole('button', { name: /leave history/i }).click();
    await expect(page.getByRole('heading', { name: /leave applications \(pending\)/i })).toBeVisible();
    const pendingRow = page.locator('tr', { hasText: leaveReason });
    await pendingRow.getByRole('button', { name: /accept/i }).click();

    const approvedListRes = await api.get(`${API_BASE}/leaves/`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: { status: 'approved' },
    });
    expect(approvedListRes.ok()).toBeTruthy();
    const approvedRows = await approvedListRes.json();
    expect(approvedRows.some((r) => r.leave_id === leave.leave_id)).toBeTruthy();

    await page.getByRole('link', { name: /billing/i }).click();
    await expect(page.getByRole('heading', { name: /billing & revenue/i })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });
});

