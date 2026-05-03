import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi } from '../../api';
import { MdAdd, MdSearch, MdFilterList, MdRefresh } from 'react-icons/md';

const STATUS_LABELS = { pending: 'Pending', in_progress: 'In Progress', complete: 'Complete', cancelled: 'Cancelled' };
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function JobList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: '', priority: '', work_type: '', site_type: '', date_from: '', date_to: '' });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.work_type) params.work_type = filters.work_type;
      if (filters.site_type) params.site_type = filters.site_type;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const res = await jobsApi.list(params);
      setJobs(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Jobs</h2>
          <p>{jobs.length} service requests</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/jobs/create')}>
          <MdAdd /> New Job
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <MdSearch className="search-icon" />
          <input className="form-input search-input" placeholder="Search jobs, customers..." value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <select className="form-select" style={{ width: 140 }} value={filters.status}
          onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="complete">Complete</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="form-select" style={{ width: 130 }} value={filters.priority}
          onChange={e => setFilters({ ...filters, priority: e.target.value })}>
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="form-select" style={{ width: 130 }} value={filters.site_type}
          onChange={e => setFilters({ ...filters, site_type: e.target.value })}>
          <option value="">All Site Types</option>
          <option value="Home">Home</option>
          <option value="Office">Office</option>
          <option value="Shop">Shop</option>
          <option value="Land">Land</option>
        </select>
        <input type="date" className="form-input" style={{ width: 140 }} value={filters.date_from}
          onChange={e => setFilters({ ...filters, date_from: e.target.value })} title="From Date" />
        <input type="date" className="form-input" style={{ width: 140 }} value={filters.date_to}
          onChange={e => setFilters({ ...filters, date_to: e.target.value })} title="To Date" />
        <button className="btn btn-secondary btn-icon" onClick={fetchJobs} title="Refresh"><MdRefresh /></button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔧</div>
          <h3>No jobs found</h3>
          <p>Create your first service request</p>
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
                <th>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.job_id} onClick={() => navigate(`/jobs/${job.job_id}`)} style={{ cursor: 'pointer' }}>
                  <td><span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '0.8rem' }}>{job.job_id}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{job.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{job.phone_number}</div>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{job.location || '—'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{job.work_type}</td>
                  <td style={{ fontSize: '0.85rem' }}>{job.assigned_staff_name || <span style={{ color: 'var(--color-text-muted)' }}>Unassigned</span>}</td>
                  <td><span className={`badge badge-${job.priority}`}>{job.priority}</span></td>
                  <td><span className={`badge badge-${job.status}`}>{STATUS_LABELS[job.status]}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{job.scheduled_date || job.service_request_date?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
