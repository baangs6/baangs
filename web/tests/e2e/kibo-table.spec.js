import { test, expect } from '@playwright/test';

test('table imports, sorts independently, supports keyboard menus, and handles empty data', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/fixtures/kibo-table.html');
  const tables = page.getByRole('table');
  await expect(tables).toHaveCount(3);
  const firstCells = tables.nth(0).getByRole('cell');
  const secondCells = tables.nth(1).getByRole('cell');
  await expect(firstCells).toHaveText(['Zoe', 'Amy']);
  await tables.nth(0).getByRole('button', { name: 'Name' }).click();
  await page.getByRole('menuitem', { name: 'Ascending' }).click();
  await expect(firstCells).toHaveText(['Amy', 'Zoe']);
  await expect(secondCells).toHaveText(['Zoe', 'Amy']);
  await tables.nth(1).getByRole('button', { name: 'Name' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Descending' }).focus();
  await page.keyboard.press('Enter');
  await expect(secondCells).toHaveText(['Zoe', 'Amy']);
  await expect(firstCells).toHaveText(['Amy', 'Zoe']);
  await expect(tables.nth(2).getByRole('cell')).toHaveText('No results.');
  expect(errors).toEqual([]);
});
