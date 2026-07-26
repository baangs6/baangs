import { test, expect } from '@playwright/test';

test.describe('Public Complaint & Live Tracking Portal', () => {
  test('submit complaint without login and track ticket status', async ({ page }) => {
    const uniq = Date.now();
    const phone = `98${String(uniq).slice(-8)}`;
    const name = `E2E Public User ${uniq}`;
    const complaintText = `CCTV camera 1 offline at reception ${uniq}`;

    // 1. Visit Public Complaint Page
    await page.goto('http://127.0.0.1:5173/#/complaint');
    await expect(page.getByRole('heading', { name: /baangs customer portal/i })).toBeVisible();

    // 2. Fill out complaint form
    await page.getByPlaceholder(/9876543210/i).fill(phone);
    await page.getByPlaceholder(/your full name/i).fill(name);
    await page.getByPlaceholder(/mg road, kochi/i).fill('Marine Drive, Kochi');
    await page.getByPlaceholder(/describe the issue/i).fill(complaintText);

    // 3. Submit
    await page.getByRole('button', { name: /submit service complaint/i }).click();

    // 4. Verify confirmation screen & generated Job ID
    await expect(page.getByRole('heading', { name: /complaint registered/i })).toBeVisible();
    const ticketIdElement = page.locator('text=/JOB-/i');
    await expect(ticketIdElement).toBeVisible();
    const ticketText = await ticketIdElement.textContent();
    expect(ticketText).toContain('JOB-');

    // 5. Click Track Live Ticket Status
    await page.getByRole('button', { name: /track live ticket status/i }).click();

    // 6. Verify Tracking Page Details
    await expect(page.getByRole('heading', { name: /service ticket tracker/i })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(complaintText)).toBeVisible();
    await expect(page.getByText(/received/i)).toBeVisible();
  });
});
