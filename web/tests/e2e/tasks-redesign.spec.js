import { test, expect } from '@playwright/test';
async function setup(page) {
  let tasks = ['pending', 'on_track', 'completed', 'at_risk', 'paused', 'canceled'].map((status, i) => ({ task_id: `TSK-${i}`, title: `Camera task ${i}`, description: 'Inspect CCTV installation', status, due_date: i === 4 ? null : '2026-10-17', assignee_user_ids: ['U1'], assignee_names: ['Sahil'], created_by_name: 'Sahil', created_by_user_id: 'U1', created_at: '2026-10-17T10:00:00', updated_at: '2026-10-17T10:00:00', subtasks: [{ subtask_id: `SUB-${i}`, title: 'Check cables', status: 'pending', due_date: null, assignee_user_ids: [], assignee_names: [] }], comments: [] }));
  const calls = []; let fail = false;
  await page.route('**/tasks/**', route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (req.method() === 'GET') return route.fulfill({ json: path.endsWith('assignees') ? [{ user_id: 'U1', full_name: 'Sahil', role: 'admin' }, { user_id: 'U2', full_name: 'Sanika', role: 'sales' }] : tasks });
    const body = req.postDataJSON(); calls.push({ path, body });
    if (fail) return route.fulfill({ status: 500, json: { detail: 'Task save unavailable' } });
    if (path === '/tasks/') {
      const task = { ...tasks[0], ...body, task_id: 'NEW', subtasks: body.subtasks.map((sub, i) => ({ ...sub, subtask_id: `NEW-S${i}` })) };
      tasks.unshift(task); return route.fulfill({ json: task });
    }
    const id = path.split('/')[2];
    tasks = tasks.map(task => {
      if (task.task_id !== id) return task;
      if (path.endsWith('comments')) return { ...task, comments: [...task.comments, { ...body, comment_id: 'C1', created_by_name: 'Sahil', created_at: '2026-10-17T11:00:00' }] };
      if (path.endsWith('/subtasks')) return { ...task, subtasks: [...task.subtasks, { ...body, subtask_id: 'ADDED', assignee_names: [] }] };
      if (path.includes('/subtasks/')) return { ...task, subtasks: task.subtasks.map(sub => sub.subtask_id === path.split('/').at(-1) ? { ...sub, ...body } : sub) };
      return { ...task, ...body };
    });
    return route.fulfill({ json: tasks.find(task => task.task_id === id) });
  });
  await page.goto('/tests/fixtures/tasks.html');
  return { calls, fail: value => { fail = value; } };
}
test('board, list and calendar show real task data', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('region', { name: 'Pending & Triage' })).toContainText('Camera task 0');
  await expect(page.getByRole('region', { name: 'Canceled' })).toContainText('Camera task 5');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Tasks list' })).toContainText('TSK-0');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByLabel('Calendar month', { exact: true }).fill('2026-10');
  await expect(page.getByRole('button', { name: 'Open TSK-0', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Without a due date', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next calendar month' }).click();
  await expect(page.getByLabel('Calendar month', { exact: true })).toHaveValue('2026-11');
});
for (const width of [1440, 390, 320]) test(`task views fit ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await setup(page);
  await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible();
  for (const view of ['Kanban', 'List', 'Calendar']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`tasks-${view}-${width}.png`), fullPage: true });
  }
});
test('filters, inline subtasks, drag status and failed mutation retry', async ({ page }) => {
  const state = await setup(page);
  const pending = page.getByRole('region', { name: 'Pending & Triage' });
  state.fail(true); await pending.getByRole('checkbox', { name: 'Complete Check cables for TSK-0', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Task save unavailable');
  await expect(pending.getByRole('checkbox', { name: 'Complete Check cables for TSK-0', exact: true })).not.toBeChecked();
  state.fail(false); await pending.getByRole('checkbox', { name: 'Complete Check cables for TSK-0', exact: true }).click();
  await expect(pending.getByRole('checkbox', { name: 'Complete Check cables for TSK-0', exact: true })).toBeChecked();
  await page.locator('[data-task-id="TSK-0"]').dragTo(page.getByRole('region', { name: 'Completed', exact: true }));
  await expect(page.getByRole('region', { name: 'Completed', exact: true })).toContainText('Camera task 0');
  expect(state.calls.at(-1).body).toEqual({ status: 'completed' });
  await page.getByLabel('Search tasks', { exact: true }).fill('TSK-1');
  await expect(page.locator('[data-task-id]')).toHaveCount(1);
  await page.getByLabel('Tagged person', { exact: true }).selectOption('U2');
  await expect(page.getByText('No tasks match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('[data-task-id]')).toHaveCount(6);
});
test('create, edit, add subtask, retag and comment', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'New Task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Task editor' });
  await dialog.getByLabel('Task title', { exact: true }).fill('New install');
  await dialog.getByLabel('Task description', { exact: true }).fill('Install camera');
  await dialog.getByRole('checkbox', { name: 'Sahil admin', exact: true }).check();
  await dialog.getByRole('button', { name: 'Add Draft Subtask' }).click();
  await dialog.getByLabel('Draft subtask 1 title', { exact: true }).fill('Run cable');
  await dialog.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.calls.at(-1).body.subtasks[0].title).toBe('Run cable');
  await page.getByRole('button', { name: 'Open NEW', exact: true }).click();
  await dialog.getByLabel('Task title', { exact: true }).fill('Updated install');
  await dialog.locator('form').first().getByRole('checkbox', { name: 'Sanika sales', exact: true }).check();
  await dialog.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('Saved');
  expect(state.calls.at(-1).body.assignee_user_ids).toEqual(['U1', 'U2']);
  await dialog.getByLabel('New subtask title', { exact: true }).fill('Test signal');
  await dialog.getByRole('button', { name: 'Add Subtask', exact: true }).click();
  await expect(dialog.getByText('Test signal', { exact: true })).toBeVisible();
  await dialog.getByLabel('Task update', { exact: true }).fill('Ready for inspection');
  await dialog.getByRole('button', { name: 'Post Update', exact: true }).click();
  await expect(dialog.getByText('Ready for inspection', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close task editor' }).click();
  await expect(page.getByRole('button', { name: 'Open NEW', exact: true })).toContainText('Updated install');
});
test('failed create and comment retain drafts; incomplete completion can be canceled', async ({ page }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'New Task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Task editor' });
  await dialog.getByLabel('Task title', { exact: true }).fill('Keep this draft');
  state.fail(true);
  await dialog.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Task save unavailable');
  await expect(dialog.getByLabel('Task title', { exact: true })).toHaveValue('Keep this draft');
  page.once('dialog', confirm => confirm.accept());
  await dialog.getByRole('button', { name: 'Close task editor' }).click();
  state.fail(false);
  const before = state.calls.length;
  page.once('dialog', confirm => confirm.dismiss());
  await page.getByLabel('Status for TSK-0', { exact: true }).selectOption('completed');
  expect(state.calls.length).toBe(before);
  await expect(page.getByLabel('Status for TSK-0', { exact: true })).toHaveValue('pending');
  await page.getByRole('button', { name: 'Open TSK-0', exact: true }).click();
  await dialog.getByLabel('Task update', { exact: true }).fill('Keep update draft');
  state.fail(true); await dialog.getByRole('button', { name: 'Post Update', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Task save unavailable');
  await expect(dialog.getByRole('textbox', { name: 'Task update', exact: true })).toHaveValue('Keep update draft');
});
test('load error retry restores empty board', async ({ page }) => {
  await setup(page);
  await page.route('**/tasks/', route => route.fulfill({ status: 500, json: { detail: 'Tasks unavailable' } }));
  await page.getByRole('button', { name: 'Refresh tasks' }).click();
  await expect(page.getByRole('alert')).toContainText('Tasks unavailable');
  await page.route('**/tasks/', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Retry tasks' }).click();
  await expect(page.getByText('No tasks match these filters')).toBeVisible();
});
