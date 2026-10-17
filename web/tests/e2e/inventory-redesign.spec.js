import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const tabs = ['Dashboard', 'Items Master', 'Transactions Log', 'Stock Summary', 'Item Sold Details'];
async function setup(page, role = 'admin') {
  let items = Array.from({ length: 13 }, (_, i) => ({ _id: `I${i}`, barcode: `B${i}`, item_name: `Camera ${i}`, model_number: `MODEL-${String(i).padStart(2, '0')}`, serial_numbers: i === 0 ? ['S1', 'S2'] : [], unit_type: 'Pcs', purchase_price: 10, selling_price: 20, tax_percentage: 0, opening_quantity: 5, current_quantity: i === 0 ? 2 : 5, minimum_stock_level: 3, category: i % 2 ? 'Power' : 'Cameras', warranty: '2 years', connectivity: 'IP', storage_location: 'Rack B', supplier: 'Vendor', created_at: '2026-10-17T10:00:00', status: 'active' }));
  let transactions = Array.from({ length: 13 }, (_, i) => ({ _id: `T${i}`, barcode: 'B0', transaction_datetime: '2026-10-17T10:00:00', quantity_changed: -2, transaction_type: 'STOCK_OUT', serial_numbers: ['S1', 'S2'], serial_number: 'S1, S2', balance_after_transaction: 2, linked_technician_id: 'ST1', staff_name: 'Amal', customer_details: `Customer ${i}`, amount_paid: 40, purchase_price: 10, selling_price: 20 }));
  const calls = []; let fail = false;
  await page.route('**/staff/', route => route.fulfill({ json: [{ staff_id: 'ST1', name: 'Amal' }] }));
  await page.route('**/customers/*', route => route.fulfill({ json: [{ customer_id: 'C1', customer_name: 'Customer One', phone_number: '9000000000' }] }));
  await page.route('**/inventory/**', route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (req.method() === 'GET') {
      if (path.endsWith('transactions')) return route.fulfill({ json: transactions });
      if (path.endsWith('stock-summary')) return route.fulfill({ json: items.map(item => ({ model_number: item.model_number, item_name: item.item_name, initial_quantity: item.opening_quantity, total_transactions: -1, current_stock: item.current_quantity, minimum_stock_level: item.minimum_stock_level, low_stock: item.current_quantity <= item.minimum_stock_level ? 'YES' : 'NO' })) });
      if (path.endsWith('sold-details')) return route.fulfill({ json: transactions.map(row => ({ ...row, item_name: 'Camera 0', sold_price: 20, sale_amount: 40, linked_job_id: 'JOB-1' })) });
      return route.fulfill({ json: items });
    }
    if (path.endsWith('import-csv')) { calls.push({ path, body: req.postData() }); return route.fulfill({ json: { success: 1, errors: [] } }); }
    const body = req.postData() ? req.postDataJSON() : null; calls.push({ path, body, method: req.method() });
    if (fail) return route.fulfill({ status: 500, json: { detail: 'Inventory save unavailable' } });
    if (path.endsWith('/adjust')) {
      const barcode = path.split('/')[2]; items = items.map(item => item.barcode === barcode ? { ...item, current_quantity: item.current_quantity + body.quantity_changed } : item);
      const item = items.find(item => item.barcode === barcode);
      transactions.unshift({ ...body, _id: 'NEW-T', barcode, balance_after_transaction: item.current_quantity, transaction_datetime: '2026-10-17T12:00:00' });
      return route.fulfill({ json: { new_quantity: item.current_quantity } });
    }
    if (req.method() === 'POST') { const item = { ...body, barcode: 'NEW', _id: 'NEW', current_quantity: body.opening_quantity }; items.push(item); return route.fulfill({ json: item }); }
    const barcode = path.split('/')[2];
    if (req.method() === 'DELETE') { items = items.filter(item => item.barcode !== barcode); return route.fulfill({ json: {} }); }
    items = items.map(item => item.barcode === barcode ? { ...item, ...body } : item);
    return route.fulfill({ json: items.find(item => item.barcode === barcode) });
  });
  await page.goto(`/tests/fixtures/inventory.html?role=${role}`);
  await expect(page.getByRole('table', { name: 'Low stock alerts' })).toBeVisible();
  return { calls, fail: value => { fail = value; } };
}
for (const width of [1440, 390, 320]) test(`all inventory views fit ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  for (const name of tabs) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByText('Loading inventory...', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: name === 'Transactions Log' ? 'Inventory Movements' : name === 'Dashboard' ? 'Inventory Dashboard' : name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`inventory-${name.replaceAll(' ', '-')}-${width}.png`), fullPage: true });
  }
});
test('catalog serial search, pagination, export, spec print and reorder request', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Prepare Reorder', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Inventory action' });
  await expect(dialog.getByLabel('Requested Quantity')).toHaveValue('1');
  const reorderDownload = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download Request' }).click();
  expect((await reorderDownload).suggestedFilename()).toBe('reorder-request.csv');
  await dialog.getByRole('button', { name: 'Close inventory action' }).click();
  await page.getByRole('button', { name: 'Items Master', exact: true }).click();
  const details = page.getByRole('region', { name: 'Catalog item details' });
  await expect(details).toContainText('S1'); await expect(details).toContainText('S2');
  await page.getByLabel('Catalog page', { exact: true }).selectOption('2');
  await expect(page.getByRole('region', { name: 'Catalog items' })).toContainText('Camera 12');
  await page.getByLabel('Search inventory', { exact: true }).fill('S2');
  await expect(page.getByLabel('Catalog page', { exact: true })).toHaveValue('1');
  await expect(details).toContainText('Camera 0');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Catalog' }).click();
  const csv = await readFile(await (await download).path(), 'utf8'); expect(csv).toContain('S1|S2'); expect(csv).not.toContain('Camera 12');
  await page.evaluate(() => { window.open = () => ({ opener: null, document: document.implementation.createHTMLDocument(), focus() {}, print() { window.printWasCalled = true; } }); });
  await page.getByRole('button', { name: 'Print Spec Sheet' }).click();
  expect(await page.evaluate(() => window.printWasCalled)).toBe(true);
});
test('create, edit metadata and serials, retry save and deactivate', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Create New Item', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Inventory action' });
  await dialog.getByLabel('Item Name', { exact: true }).fill('New Camera');
  await dialog.getByLabel('Model Number', { exact: true }).fill('NEW-MODEL');
  await dialog.getByLabel('Tax %', { exact: true }).fill('0');
  await dialog.getByLabel('Opening Quantity', { exact: true }).fill('2');
  await dialog.getByLabel('Serial numbers (one per line)', { exact: true }).fill('N1\nN2');
  state.fail(true); await dialog.getByRole('button', { name: 'Save Item' }).click();
  await expect(dialog.getByRole('status')).toContainText('Inventory save unavailable');
  await expect(dialog.getByLabel('Item Name', { exact: true })).toHaveValue('New Camera');
  state.fail(false); await dialog.getByRole('button', { name: 'Save Item' }).click();
  await expect(dialog).toHaveCount(0); expect(state.calls.at(-1).body.tax_percentage).toBe(0);
  await page.getByRole('button', { name: 'Items Master', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Item', exact: true }).click();
  await dialog.getByLabel('Warranty', { exact: true }).fill('3 years');
  await dialog.getByRole('button', { name: 'Save Item' }).click();
  await expect(dialog).toHaveCount(0); expect(state.calls.at(-1).body.warranty).toBe('3 years');
  await page.getByRole('button', { name: 'Deactivate Item', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm Deactivate' }).click();
  await expect(page.locator('.stock-notice')).toContainText('Item deactivated');
});
test('multi-serial issue, movement filters, all-row export and report margins', async ({ page }) => {
  const state = await setup(page); await page.getByRole('button', { name: 'Transactions Log', exact: true }).click();
  await page.getByRole('combobox', { name: 'Item', exact: true }).selectOption('B0');
  await page.getByRole('combobox', { name: 'Movement Type', exact: true }).selectOption('STOCK_OUT');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByRole('checkbox', { name: 'S1', exact: true }).check(); await page.getByRole('checkbox', { name: 'S2', exact: true }).check();
  page.once('dialog', confirm => confirm.accept()); await page.getByRole('button', { name: 'Submit Entry' }).click();
  await expect(page.locator('.stock-notice')).toContainText('Stock movement recorded');
  expect(state.calls.at(-1).body).toMatchObject({ quantity_changed: -2, serial_numbers: ['S1', 'S2'] });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csv = await readFile(await (await download).path(), 'utf8'); expect(csv).toContain('Customer 12');
  await page.getByLabel('Transactions page', { exact: true }).selectOption('2');
  await expect(page.getByRole('table', { name: 'Transactions', exact: true })).toContainText('Customer 12');
  await page.getByRole('button', { name: 'Stock Summary', exact: true }).click();
  await page.getByLabel('Stock health').selectOption('low');
  await expect(page.getByRole('table', { name: 'Stock summary' }).locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Item Sold Details', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Sold details' })).toContainText('Rs 20.00');
  await expect(page.getByRole('link', { name: 'JOB-1' }).first()).toHaveAttribute('href', '/jobs/JOB-1');
});
test('CSV upload, load retry and role-aware write controls', async ({ page }) => {
  const state = await setup(page); await page.getByRole('button', { name: 'Items Master', exact: true }).click();
  page.once('dialog', confirm => confirm.accept());
  await page.locator('input[type=file]').setInputFiles({ name: 'items.csv', mimeType: 'text/csv', buffer: Buffer.from('item_name,model_number\n"Camera, Outdoor",C1\n') });
  await expect(page.locator('.stock-notice')).toContainText('Imported 1 items');
  expect(state.calls.at(-1).path).toBe('/inventory/import-csv');
  await page.route('**/inventory/', route => route.fulfill({ status: 500, json: { detail: 'Inventory unavailable' } }));
  await page.getByRole('button', { name: 'Refresh inventory' }).click();
  await expect(page.getByRole('alert')).toContainText('Inventory unavailable');
  await page.route('**/inventory/', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Retry inventory' }).click();
  await expect(page.getByText('No matching items')).toBeVisible();
  await page.unroute('**/inventory/');
  await page.goto('/tests/fixtures/inventory.html?role=manager');
  await expect(page.getByRole('button', { name: 'Items Master', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create New Item', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Transactions Log', exact: true })).toHaveCount(0);
});
test('unusual model names cannot change object prototypes', async ({ page }) => {
  await setup(page);
  await page.route('**/inventory/', route => route.fulfill({ json: [{ barcode: 'SAFE', model_number: '__proto__', item_name: 'Special Model', current_quantity: 1, minimum_stock_level: 2, purchase_price: 10, selling_price: 20, unit_type: 'Pcs' }] }));
  await page.getByRole('button', { name: 'Refresh inventory' }).click();
  await expect(page.getByRole('table', { name: 'Low stock alerts' })).toContainText('Special Model');
  expect(await page.evaluate(() => Object.prototype.current_quantity)).toBeUndefined();
});
