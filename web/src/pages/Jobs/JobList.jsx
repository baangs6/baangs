import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi, staffApi } from '../../api';
import { MdAdd, MdCheck, MdClose, MdDelete, MdRefresh, MdSearch } from 'react-icons/md';

const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', complete: 'Complete', cancelled: 'Cancelled' };

function isCustomerRequest(job) {
  return Boolean(job.is_public_submission) && job.request_status !== 'accepted';
}

function daysSinceCreated(job) {
  if (job.status === 'complete') return null;
  const rawDate = job.service_request_date || job.scheduled_date;
  if (!rawDate) return null;
  const createdAt = new Date(rawDate.slice(0, 10));
  if (Number.isNaN(createdAt.getTime())) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const createdStart = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
  return Math.max(0, Math.floor((todayStart - createdStart) / 86400000));
}

export default function JobList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [actionSaving, setActionSaving] = useState(false);
  const [acceptJob, setAcceptJob] = useState(null);
  const [rejectJob, setRejectJob] = useState(null);
  const [deleteJob, setDeleteJob] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [acceptForm, setAcceptForm] = useState({
    assigned_staff_id: '',
    scheduled_date: '',
    preferred_time: '',
  });
  const [rejectRemark, setRejectRemark] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    priority: '',
    work_type: '',
    site_type: '',
    assigned_staff_id: '',
    date_from: '',
    date_to: '',
  });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.work_type) params.work_type = filters.work_type;
      if (filters.site_type) params.site_type = filters.site_type;
      if (filters.assigned_staff_id) params.assigned_staff_id = filters.assigned_staff_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const res = await jobsApi.list(params);
      setJobs(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    let ignore = false;
    staffApi
      .list()
      .then((res) => {
        if (!ignore) setStaff(res.data || []);
      })
      .catch(console.error);
    return () => {
      ignore = true;
    };
  }, []);

  const customerRequestsCount = jobs.filter(isCustomerRequest).length;

  const displayedJobs = jobs.filter((job) => {
    if (activeTab === 'requests') {
      return isCustomerRequest(job);
    }
    return !isCustomerRequest(job);
  });

  const openAccept = (event, job) => {
    event.stopPropagation();
    setAcceptJob(job);
    setAcceptForm({
      assigned_staff_id: job.assigned_staff_id || '',
      scheduled_date: job.scheduled_date || '',
      preferred_time: job.preferred_time || '',
    });
  };

  const openReject = (event, job) => {
    event.stopPropagation();
    setRejectJob(job);
    setRejectRemark(job.rejection_remark || '');
  };

  const submitAccept = async (event) => {
    event.preventDefault();
    if (!acceptForm.assigned_staff_id) {
      alert('Please select technician');
      return;
    }
    setActionSaving(true);
    try {
      await jobsApi.acceptRequest(acceptJob.job_id, {
        assigned_staff_id: acceptForm.assigned_staff_id,
        additional_staff_ids: [],
        scheduled_date: acceptForm.scheduled_date || null,
        preferred_time: acceptForm.preferred_time || null,
      });
      setAcceptJob(null);
      await fetchJobs();
    } catch (e) {
      alert(e.response?.data?.detail || 'Unable to accept request');
    } finally {
      setActionSaving(false);
    }
  };

  const submitReject = async (event) => {
    event.preventDefault();
    if (!rejectRemark.trim()) {
      alert('Please enter reject remark');
      return;
    }
    setActionSaving(true);
    try {
      await jobsApi.rejectRequest(rejectJob.job_id, { remark: rejectRemark.trim() });
      setRejectJob(null);
      setRejectRemark('');
      await fetchJobs();
    } catch (e) {
      alert(e.response?.data?.detail || 'Unable to reject request');
    } finally {
      setActionSaving(false);
    }
  };

  const openDelete = (event, job) => {
    event.stopPropagation();
    setDeleteJob(job);
    setDeleteError('');
  };

  const confirmDelete = async () => {
    setActionSaving(true);
    try {
      await jobsApi.delete(deleteJob.job_id);
      setDeleteJob(null);
      setDeleteError('');
      await fetchJobs();
    } catch (e) {
      setDeleteError(e.response?.data?.detail || 'Unable to delete request');
    } finally {
      setActionSaving(false);
    }
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Jobs & Service Requests</h2>
          <p>{displayedJobs.length} records found</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/jobs/create')}>
          <MdAdd /> New Job
        </button>
      </div>

      {/* Section Tabs */}
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          className={activeTab === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => setActiveTab('all')}
        >
          All Work Orders ({jobs.filter((job) => !isCustomerRequest(job)).length})
        </button>
        <button
          className={activeTab === 'requests' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => setActiveTab('requests')}
        >
          Customer Requests ({customerRequestsCount})
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <MdSearch className="search-icon" />
          <input
            className="form-input search-input"
            placeholder="Search jobs, customers..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 140 }}
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="complete">Complete</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          className="form-select"
          style={{ width: 130 }}
          value={filters.priority}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
        >
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="form-select"
          style={{ width: 130 }}
          value={filters.site_type}
          onChange={(e) => setFilters({ ...filters, site_type: e.target.value })}
        >
          <option value="">All Site Types</option>
          <option value="Home">Home</option>
          <option value="Office">Office</option>
          <option value="Shop">Shop</option>
          <option value="Land">Land</option>
        </select>
        <select
          className="form-select"
          style={{ width: 180 }}
          value={filters.assigned_staff_id}
          onChange={(e) => setFilters({ ...filters, assigned_staff_id: e.target.value })}
        >
          <option value="">All Assigned To</option>
          <option value="__unassigned">Unassigned</option>
          {staff
            .filter((s) => s.is_active)
            .map((s) => (
              <option key={s.staff_id} value={s.staff_id}>
                {s.name} ({s.staff_id})
              </option>
            ))}
        </select>
        <input
          type="date"
          className="form-input"
          style={{ width: 140 }}
          value={filters.date_from}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          title="From Date"
        />
        <input
          type="date"
          className="form-input"
          style={{ width: 140 }}
          value={filters.date_to}
          onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          title="To Date"
        />
        <button className="btn btn-secondary btn-icon" onClick={fetchJobs} title="Refresh">
          <MdRefresh />
        </button>
      </div>

      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : displayedJobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔧</div>
          <h3>No jobs found</h3>
          <p>{activeTab === 'requests' ? 'No customer requests submitted yet.' : 'Create your first service request.'}</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/jobs/create')}>
            <MdAdd /> Create Job
          </button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Work Type</th>
                <th>Assigned To</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Days Open</th>
                <th>Scheduled</th>
                {activeTab === 'requests' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {displayedJobs.map((job) => (
                <tr key={job.job_id} onClick={() => navigate(`/jobs/${job.job_id}`)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '0.8rem' }}>
                      {job.job_id}
                    </span>
                    {job.is_public_submission && (
                      <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginLeft: 6 }}>
                        Customer Request
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{job.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{job.phone_number}</div>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{job.location || '—'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{job.work_type}</td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {job.assigned_staff_name || <span style={{ color: 'var(--color-text-muted)' }}>Unassigned</span>}
                  </td>
                  <td>
                    <span className={`badge badge-${job.priority}`}>{job.priority}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${job.status}`}>
                      {job.request_status === 'rejected' ? 'Rejected' : STATUS_LABELS[job.status]}
                    </span>
                    {job.rejection_remark && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        {job.rejection_remark}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {daysSinceCreated(job) === null ? (
                      <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                    ) : (
                      `${daysSinceCreated(job)} day${daysSinceCreated(job) === 1 ? '' : 's'}`
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {job.scheduled_date || job.service_request_date?.slice(0, 10)}
                  </td>
                  {activeTab === 'requests' && (
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {job.request_status !== 'rejected' && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={(event) => openAccept(event, job)} disabled={actionSaving}>
                              <MdCheck /> Accept
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={(event) => openReject(event, job)} disabled={actionSaving}>
                              <MdClose /> Reject
                            </button>
                          </>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={(event) => openDelete(event, job)} disabled={actionSaving}>
                          <MdDelete /> Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {acceptJob && (
        <div className="modal-overlay" onClick={() => setAcceptJob(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Accept Customer Request</h3>
              <button className="btn-icon" onClick={() => setAcceptJob(null)}>x</button>
            </div>
            <form onSubmit={submitAccept}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Customer</label>
                  <div style={{ fontWeight: 600 }}>{acceptJob.customer_name} - {acceptJob.phone_number}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Assign Technician *</label>
                  <select
                    className="form-select"
                    value={acceptForm.assigned_staff_id}
                    onChange={(event) => setAcceptForm((form) => ({ ...form, assigned_staff_id: event.target.value }))}
                    required
                  >
                    <option value="">Select technician</option>
                    {staff.filter((s) => s.is_active).map((s) => (
                      <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.staff_id})</option>
                    ))}
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Scheduled Date</label>
                    <input
                      className="form-input"
                      type="date"
                      value={acceptForm.scheduled_date}
                      onChange={(event) => setAcceptForm((form) => ({ ...form, scheduled_date: event.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Preferred Time</label>
                    <input
                      className="form-input"
                      type="time"
                      value={acceptForm.preferred_time}
                      onChange={(event) => setAcceptForm((form) => ({ ...form, preferred_time: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" type="button" onClick={() => setAcceptJob(null)}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={actionSaving}>{actionSaving ? 'Saving...' : 'Accept & Assign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rejectJob && (
        <div className="modal-overlay" onClick={() => setRejectJob(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Customer Request</h3>
              <button className="btn-icon" onClick={() => setRejectJob(null)}>x</button>
            </div>
            <form onSubmit={submitReject}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Reject Remark *</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    value={rejectRemark}
                    onChange={(event) => setRejectRemark(event.target.value)}
                    placeholder="Enter reason for rejecting this customer request"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" type="button" onClick={() => setRejectJob(null)}>Cancel</button>
                <button className="btn btn-danger" type="submit" disabled={actionSaving}>{actionSaving ? 'Saving...' : 'Reject Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteJob && (
        <div className="modal-overlay" onClick={() => setDeleteJob(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Delete Customer Request</h3>
              <button className="btn-icon" onClick={() => setDeleteJob(null)}>x</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                Delete <strong>{deleteJob.job_id}</strong> for <strong>{deleteJob.customer_name}</strong>?
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                This will remove the request permanently.
              </p>
              {deleteError && (
                <p style={{ color: 'var(--color-danger)', fontSize: '0.9rem', marginTop: 12 }}>
                  {deleteError}
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" type="button" onClick={() => setDeleteJob(null)}>Cancel</button>
              <button className="btn btn-danger" type="button" onClick={confirmDelete} disabled={actionSaving}>
                {actionSaving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

