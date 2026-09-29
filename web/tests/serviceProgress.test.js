import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceProgress } from '../src/utils/serviceProgress.js';

for (const [job, step] of [
  [{ status: 'pending', is_assigned: true }, 2],
  [{ status: 'pending', is_assigned: false }, 1],
  [{ status: 'pending', assigned_staff_name: 'Technician' }, 2],
  [{ status: 'pending', assigned_staff_name: 'Awaiting Technician Assignment' }, 1],
  [{ status: 'pending', is_assigned: false, assigned_staff_name: 'Old name' }, 1],
  [{ status: 'in_progress', is_assigned: true }, 3],
  [{ status: 'complete' }, 4],
  [{ status: 'completed' }, 4],
  [{ status: 'cancelled', is_assigned: true }, 0],
]) {
  test(JSON.stringify(job), () => assert.equal(serviceProgress(job).step, step));
}
