import { test, expect } from '@playwright/test';

async function loginWeb(page, username = 'sahil', password = 'password123') {
  await page.goto('/');
  await page.locator('input[placeholder="Enter username"]').fill(username);
  await page.locator('input[placeholder="Enter password"]').fill(password);
  await page.getByRole('button', { name: /login/i }).click();
}

test.describe('P0 Smoke (Fast CI Gate)', () => {
  test('admin login + protected dashboard + core nav/pages load', async ({ page }) => {
    await loginWeb(page);

    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /jobs/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /attendance/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /billing/i })).toBeVisible();

    await page.getByRole('link', { name: /jobs/i }).click();
    await expect(page.getByRole('heading', { name: /^jobs$/i })).toBeVisible();

    await page.getByRole('link', { name: /attendance/i }).click();
    await expect(page.getByRole('heading', { name: /attendance report/i })).toBeVisible();

    await page.getByRole('link', { name: /billing/i }).click();
    await expect(page.getByRole('heading', { name: /billing & revenue/i })).toBeVisible();
  });
});

