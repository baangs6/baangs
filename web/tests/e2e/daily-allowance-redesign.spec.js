import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function setup(page, count = 8) {
  let rows = Array.from({ length: count }, (_, i) => ({ allowance_id: `EXP-${i}`, staff_id: 'ST-1', staff_name: 'Amal N', date: `2026-10-${String(17 - i % 17).padStart(2, '0')}`, expense_type: i % 2 ? 'food' : 'other', amount: '100', paid_amount: 0, balance_amount: 100, extra_paid_amount: 0, payment_status: 'unpaid', remark: `Expense ${i}`, bill_url: i === 0 ? '/receipt.png' : null }));
  const payments = [];
  let fail = false;
  await page.route('**/attendance/', route => route.fulfill({ json: [] }));
  await page.route('**/staff/', route => route.fulfill({ json: [{ staff_id: 'ST-1', name: 'Amal N', phone_number: '9000000000' }] }));
  await page.route('**/leaves/**', route => route.fulfill({ json: [] }));
  await page.route('**/receipt.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/attendance/allowances**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON(); payments.push(body);
      if (fail) return route.fulfill({ status: 500, json: { detail: 'Payment unavailable' } });
      let left = body.paid_amount;
      rows = rows.map(row => {
        if (!body.allowance_ids.includes(row.allowance_id)) return row;
        const paid = Math.min(left, row.balance_amount); left -= paid;
        const balance = row.balance_amount - paid;
        return { ...row, paid_amount: row.paid_amount + paid, balance_amount: balance, payment_status: balance ? 'partial' : 'paid', payment_remark: body.payment_remark };
      });
      return route.fulfill({ json: rows.filter(row => body.allowance_ids.includes(row.allowance_id)) });
    }
    if (req.method() === 'DELETE') { rows = rows.filter(row => !req.url().endsWith(`/${row.allowance_id}`)); return route.fulfill({ json: {} }); }
    const skip = Number(new URL(req.url()).searchParams.get('skip'));
    return route.fulfill({ json: rows.slice(skip, skip + 200) });
  });
  await page.goto('/tests/fixtures/attendance.html');
  await page.getByRole('tab', { name: 'Daily Allowance' }).click();
  await expect(page.getByRole('complementary', { name: 'Voucher inspector' })).toBeVisible();
  return { payments, fail: value => { fail = value; } };
}
for (const width of [1440, 390, 320]) test(`allowance fits ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`allowance-${width}.png`), fullPage: true });
});
test('filters, page jump, export, receipt and query', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.allowance-summary')).toContainText('Rs 800.00');
  await page.getByRole('button', { name: 'Zoom receipt', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Receipt preview' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Query on WhatsApp' })).toHaveAttribute('href', /wa.me\/919000000000/);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Statement' }).click();
  const file = await download; expect(file.suggestedFilename()).toBe('daily-allowances.csv');
  expect(await readFile(await file.path(), 'utf8')).toContain('EXP-7');
  await page.getByLabel('Expense page', { exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: 'Inspect expense EXP-6', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Food/ }).click();
  await expect(page.getByLabel('Expense page', { exact: true })).toHaveValue('1');
  await page.getByLabel('Search expenses').fill('Expense 3');
  await expect(page.locator('.allowance-claim')).toHaveCount(1);
});
test('single payment, failed retry, batch and delete', async ({ page }) => {
  const state = await setup(page);
  await page.getByLabel('Voucher payment amount').fill('40');
  await page.getByLabel('Voucher payment mode').selectOption('UPI');
  await page.getByLabel('Voucher payment reference').fill('REF-123');
  state.fail(true);
  await page.getByRole('button', { name: /^Record Payment Rs/ }).click();
  await expect(page.getByRole('status')).toContainText('Payment unavailable');
  await expect(page.getByLabel('Voucher payment amount')).toHaveValue('40');
  state.fail(false);
  await page.getByRole('button', { name: /^Record Payment Rs/ }).click();
  await expect(page.locator('.allowance-finances')).toContainText('Rs 60.00');
  expect(state.payments.at(-1)).toEqual({ allowance_ids: ['EXP-0'], paid_amount: 40, payment_remark: 'UPI | REF-123' });
  await page.getByLabel('Select EXP-0', { exact: true }).check();
  await page.getByLabel('Select EXP-1', { exact: true }).check();
  await page.getByRole('button', { name: 'Record Batch Payment' }).click();
  await expect(page.getByLabel('Select EXP-0', { exact: true })).toBeDisabled();
  expect(state.payments.at(-1).paid_amount).toBe(160);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete Expense' }).click();
  await expect(page.getByRole('button', { name: 'Inspect expense EXP-0', exact: true })).toHaveCount(0);
});
test('fetches more than the backend page size', async ({ page }) => {
  await setup(page, 201);
  await expect(page.locator('.allowance-summary')).toContainText('201 claims');
  await page.getByLabel('Search expenses').fill('Expense 200');
  await expect(page.getByRole('button', { name: 'Inspect expense EXP-200', exact: true })).toBeVisible();
});
