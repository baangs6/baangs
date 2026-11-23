export function sortJobsByCreatedDate(jobs, direction = 'desc') {
  const timestamp = job => {
    const value = Date.parse(job.created_at || job.service_request_date || '');
    return Number.isFinite(value) ? value : null;
  };
  return [...jobs].sort((a, b) => {
    const left = timestamp(a);
    const right = timestamp(b);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    const difference = left - right || String(a.job_id || '').localeCompare(String(b.job_id || ''));
    return direction === 'asc' ? difference : -difference;
  });
}
