import { test, expect } from '@playwright/test';

const camera = { barcode: 'CAM', item_name: 'Camera', model_number: 'Model 1', selling_price: 100, current_quantity: 10 };
const cable = { barcode: 'CABLE', item_name: 'Cable', selling_price: 20, current_quantity: 100 };
const used = { ...camera, _id: 'usage-1', quantity_used: 2, unit_selling_price: 100, warranty_years: 1 };

test('edit, add, remove, save and show errors without closing the editor', async ({ page }, testInfo) => {
  let saved;
  let rejectSave = true;
  await page.route('**/inventory/', route => route.fulfill({ json: [camera, cable] }));
  await page.route('**/jobs/TEST/items', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { version: 'a'.repeat(64), items: [used] } });
    saved = route.request().postDataJSON();
    return route.fulfill(rejectSave
      ? { status: 409, json: { detail: 'Items changed. Reopen the editor' } }
      : { json: { message: 'Job items updated' } });
  });
  await page.goto('/tests/fixtures/job-items.html');
  await page.getByRole('button', { name: 'Edit Items' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Quantity for item 1', { exact: true }).fill('3');
  await dialog.getByLabel('Price for item 1', { exact: true }).fill('150');
  await dialog.getByLabel('Warranty for item 1').selectOption('3');
  await expect(dialog.getByText('Material Total: Rs 450.00')).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('editor-desktop.png') });
  await dialog.getByLabel('Inventory product').fill('CABLE');
  await dialog.getByRole('button', { name: 'Add Item' }).click();
  await expect(dialog.getByText('Material Total: Rs 470.00')).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove item 2' }).click();
  await dialog.getByRole('button', { name: 'Save Items' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Items changed. Reopen the editor');
  expect(saved.items[0]).toMatchObject({ usage_id: 'usage-1', quantity_used: 3, unit_selling_price: 150, warranty_years: 3 });
  rejectSave = false;
  await dialog.getByRole('button', { name: 'Save Items' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Saved');
});

test('mobile editor fits the viewport and technicians cannot edit prices', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/inventory/', route => route.fulfill({ json: [camera] }));
  await page.route('**/jobs/TEST/items', route => route.fulfill({ json: { version: 'a'.repeat(64), items: [used] } }));
  await page.goto('/tests/fixtures/job-items.html');
  await page.getByRole('button', { name: 'Edit Items' }).click();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('editor-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/tests/fixtures/job-items.html?role=technician');
  await expect(page.getByRole('button', { name: 'Edit Items' })).toHaveCount(0);
});

test('search by item name and serial, select multiple serials, and save one unit per serial', async ({ page }, testInfo) => {
  let saved;
  const serialized = { ...camera, barcode: 'INV-9', item_name: 'Outdoor Camera', serial_numbers: ['SER-001', 'SER-002'], serial_number: 'SER-003, SER-004', warranty_years: 2 };
  await page.route('**/inventory/', route => route.fulfill({ json: [serialized, cable] }));
  await page.route('**/jobs/TEST/items', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { version: 'a'.repeat(64), items: [] } });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { message: 'Saved' } });
  });
  await page.goto('/tests/fixtures/job-items.html');
  await page.getByRole('button', { name: 'Edit Items' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Inventory product').fill('outdoor');
  await dialog.getByRole('button', { name: /Outdoor Camera.*INV-9/ }).click();
  await dialog.getByRole('button', { name: 'Add Item' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Select at least one serial number');
  await dialog.getByLabel('SER-001', { exact: true }).check();
  await dialog.getByLabel('SER-003', { exact: true }).check();
  await expect(dialog.getByText('2 selected', { exact: true })).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('serial-selection.png') });
  await dialog.getByRole('button', { name: 'Add Item' }).click();
  await expect(dialog.getByLabel('Serial number for item 1')).toHaveValue('SER-001');
  await expect(dialog.getByLabel('Serial number for item 2')).toHaveValue('SER-003');
  await expect(dialog.getByLabel('Quantity for item 1', { exact: true })).toHaveAttribute('readonly', '');
  await expect(dialog.getByText('Material Total: Rs 200.00')).toBeVisible();
  await dialog.getByLabel('Inventory product').fill('SER-004');
  await dialog.getByRole('button', { name: /Outdoor Camera.*INV-9/ }).click();
  await expect(dialog.getByRole('checkbox', { name: /SER-001/ })).toBeDisabled();
  await dialog.getByLabel('SER-004', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Add Item' }).click();
  await dialog.getByRole('button', { name: 'Save Items' }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved.items.map(row => row.serial_number)).toEqual(['SER-001', 'SER-003', 'SER-004']);
  expect(saved.items.every(row => row.quantity_used === 1 && row.warranty_years === 2 && row.unit_selling_price === 100)).toBe(true);
});
