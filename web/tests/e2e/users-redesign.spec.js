import { test, expect } from '@playwright/test';
async function setup(page) {
  let users = Array.from({ length: 10 }, (_, i) => ({ user_id: i === 0 ? 'ADMIN' : `U${i}`, username: `account${i}`, full_name: i ? 'Amal N' : 'Admin', phone: '9000000000', staff_id: i ? 'S1' : null, role: i ? 'technician' : 'admin', status: 'active', created_at: '2026-10-17T10:00:00' }));
  const calls = []; let fail = false;
  await page.route('**/staff/', route => route.fulfill({ json: [{ staff_id: 'S1', name: 'Amal N', is_active: true }] }));
  await page.route('**/users/**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') return route.fulfill({ json: path.endsWith('audit-logs') ? [{ action: 'updated', actor: 'admin', target_id: 'U1', fields: ['role'], created_at: '2026-10-17T11:00:00' }] : users });
    const body = request.postData() ? request.postDataJSON() : null; calls.push({ path, body, method: request.method() });
    if (fail) return route.fulfill({ status: 500, json: { detail: 'Action unavailable' } });
    const id = path.split('/')[2];
    if (request.method() === 'POST' && path === '/users/') {
      const created = { ...body, user_id: 'NEW', status: 'active', created_at: '2026-10-17T11:00:00' }; delete created.password;
      users.push(created); return route.fulfill({ json: created });
    }
    if (request.method() === 'PUT' && !path.endsWith('reset-password')) { users = users.map(user => user.user_id === id ? { ...user, ...body } : user); return route.fulfill({ json: users.find(user => user.user_id === id) }); }
    if (request.method() === 'DELETE') users = users.filter(user => user.user_id !== id);
    if (path.endsWith('deactivate')) users = users.map(user => user.user_id === id ? { ...user, status: 'inactive' } : user);
    if (path.endsWith('activate') && !path.endsWith('deactivate')) users = users.map(user => user.user_id === id ? { ...user, status: 'active' } : user);
    return route.fulfill({ json: { message: 'Done' } });
  });
  await page.goto('/tests/fixtures/users.html');
  await expect(page.getByRole('complementary', { name: 'Account inspector' })).toBeVisible();
  return { calls, fail: value => { fail = value; } };
}
for (const width of [1440, 390, 320]) test(`users fits ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`users-${width}.png`), fullPage: true });
});
test('search, role filters, pagination and own-account guards', async ({ page }) => {
  await setup(page);
  const inspector = page.getByRole('complementary', { name: 'Account inspector' });
  await expect(inspector.getByLabel('Account role')).toBeDisabled();
  await expect(inspector.getByRole('button', { name: 'Deactivate Account' })).toBeDisabled();
  await expect(inspector.getByRole('button', { name: 'Delete User' })).toBeDisabled();
  await page.getByLabel('Users page', { exact: true }).selectOption('2');
  await expect(page.getByRole('button', { name: 'Inspect user account8', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Technician (9)', exact: true }).click();
  await expect(page.getByLabel('Users page', { exact: true })).toHaveValue('1');
  await page.getByLabel('Search users').fill('account1');
  await expect(page.locator('.users-row')).toHaveCount(1);
  await expect(inspector.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', 'https://wa.me/919000000000');
});
test('edits contacts, role and unlinking; failed save keeps draft', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Inspect user account1', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Account inspector' });
  await inspector.getByLabel('Full Name', { exact: true }).fill('Updated Name');
  await inspector.getByLabel('Account role').selectOption('manager');
  await inspector.getByLabel(/^Linked Staff/).selectOption('');
  state.fail(true); page.once('dialog', dialog => dialog.accept());
  await inspector.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('status')).toContainText('Action unavailable');
  await expect(inspector.getByLabel('Full Name', { exact: true })).toHaveValue('Updated Name');
  state.fail(false); page.once('dialog', dialog => dialog.accept());
  await inspector.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('status')).toContainText('Account saved');
  expect(state.calls.at(-1).body).toMatchObject({ staff_id: null, role: 'manager', full_name: 'Updated Name' });
});
test('create, password reset, revoke, activation, delete and audit controls', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Add User', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Add user' });
  await create.getByLabel('Username').fill('newuser');
  await create.getByLabel('Password', { exact: true }).fill('Test-only-value-123');
  await create.getByRole('button', { name: 'Create User' }).click();
  await expect(create).toHaveCount(0);
  expect(state.calls.at(-1).body.username).toBe('newuser');
  await page.getByLabel('Search users').fill('');
  await page.getByRole('button', { name: 'Inspect user account1', exact: true }).click();
  await page.getByRole('button', { name: 'Reset Password', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm account action' });
  await confirm.getByLabel('New Password').fill('Test-only-value-123');
  await confirm.getByLabel('Confirm Password').fill('Test-only-other-123');
  await confirm.getByRole('button', { name: 'Reset Password', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('do not match');
  await confirm.getByLabel('Confirm Password').fill('Test-only-value-123');
  await confirm.getByRole('button', { name: 'Reset Password', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await page.getByRole('button', { name: 'Revoke Sessions', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('All existing sessions revoked');
  expect(state.calls.at(-1).path).toBe('/users/U1/revoke-sessions');
  await page.getByRole('button', { name: 'Deactivate Account', exact: true }).click();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Deactivate Account', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Activate Account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activate Account', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deactivate Account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete User', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect user account1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Audit Logs', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'User audit logs' })).toContainText('updated');
});
test('load failure and retry', async ({ page }) => {
  await setup(page);
  await page.route('**/users/', route => route.fulfill({ status: 500, json: { detail: 'Users unavailable' } }));
  await page.getByRole('button', { name: 'Refresh accounts' }).click();
  await expect(page.getByRole('alert')).toContainText('Users unavailable');
  await page.route('**/users/', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Retry accounts' }).click();
  await expect(page.getByText('No users match these filters')).toBeVisible();
});
