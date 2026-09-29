export function serviceProgress(job) {
  const status = (job?.status || 'pending').toLowerCase();
  if (status === 'cancelled' || status === 'rejected') return { step: 0, label: status };
  if (status === 'complete' || status === 'completed') return { step: 4, label: 'completed' };
  if (status === 'in_progress') return { step: 3, label: 'in progress' };
  // Older servers expose only a technician name; new responses have a boolean.
  const assigned = job?.is_assigned ?? Boolean(job?.assigned_staff_id ||
    (job?.assigned_staff_name && job.assigned_staff_name !== 'Awaiting Technician Assignment'));
  if (assigned || status === 'assigned') return { step: 2, label: 'assigned' };
  return { step: 1, label: 'received' };
}
