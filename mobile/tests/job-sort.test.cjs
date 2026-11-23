const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('created-date sorting supports both directions without changing source data', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/jobSort.js'), 'utf8');
  const { sortJobsByCreatedDate } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const jobs = [
    { job_id: 'JOB-20261122-001', service_request_date: '2026-11-22', scheduled_date: '2027-01-01' },
    { job_id: 'JOB-20261123-002', service_request_date: '2026-11-23' },
    { job_id: 'JOB-20261123-001', service_request_date: '2026-11-23' },
    { job_id: 'missing', created_at: 'invalid' },
    { job_id: 'timestamp', created_at: '2026-11-24T08:00:00+05:30', service_request_date: '2026-11-20' },
  ];
  const original = [...jobs];
  assert.deepEqual(sortJobsByCreatedDate(jobs).map(j => j.job_id), ['timestamp', 'JOB-20261123-002', 'JOB-20261123-001', 'JOB-20261122-001', 'missing']);
  assert.deepEqual(sortJobsByCreatedDate(jobs, 'asc').map(j => j.job_id), ['JOB-20261122-001', 'JOB-20261123-001', 'JOB-20261123-002', 'timestamp', 'missing']);
  assert.deepEqual(jobs, original);
});
