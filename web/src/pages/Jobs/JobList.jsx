import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Download, Users, ClipboardList, CircleCheck, ArrowUpRight, ArrowRight, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { jobsApi, lookupsApi, staffApi } from '../../api';
import { MdAdd, MdCheck, MdClose, MdDelete, MdRefresh, MdSearch } from 'react-icons/md';
import { formatDate } from '../../utils/dateFormat';
import DateRangePicker from '../../components/DateRangePicker';
import AmcIndicator from '../../components/AmcIndicator';
import './JobList.css';

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
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestId = useRef(0);
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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
    status: searchParams.get('status') || '',
    priority: searchParams.get('priority') || '',
    work_type: '',
    site_type: '',
    assigned_staff_id: '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
  });

  useEffect(() => {
    setFilters(current => ({
      ...current,
      status: searchParams.get('status') || '',
      priority: searchParams.get('priority') || '',
      date_from: searchParams.get('date_from') || '',
      date_to: searchParams.get('date_to') || '',
    }));
  }, [searchParams]);

  const fetchJobs = useCallback(async () => {
    setPage(1);
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError('');
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
      if (currentRequest === requestId.current) setJobs(res.data || []);
    } catch (e) {
      if (currentRequest === requestId.current) {
        setJobs([]);
        setLoadError(e.response?.data?.detail || 'Unable to load jobs. Please try refreshing.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    let ignore = false;
    Promise.allSettled([staffApi.list(), lookupsApi.all()]).then(([staffResult, lookupResult]) => {
      if (ignore) return;
      if (staffResult.status === 'fulfilled') setStaff(staffResult.value.data || []);
      if (lookupResult.status === 'fulfilled') setWorkTypes(lookupResult.value.data?.service_types || []);
    });
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
  const pageCount = Math.max(1, Math.ceil(displayedJobs.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedJobs = displayedJobs.slice(pageStart, pageStart + pageSize);
  const pageNumbers = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b);

  const exportJobs = () => {
    const cell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [['Job ID', 'Customer', 'Nickname', 'Phone', 'Location', 'Work Type', 'Assigned To', 'Priority', 'Status', 'Scheduled'],
      ...displayedJobs.map(job => [job.job_id, job.customer_name, job.customer_nickname, job.phone_number, job.location, job.work_type, job.assigned_staff_name, job.priority, job.request_status === 'rejected' ? 'Rejected' : job.status, job.scheduled_date])];
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = activeTab === 'requests' ? 'customer-requests.csv' : 'work-orders.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
    <div className="animate-fade jobs-page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Jobs & Service Requests</h2>
          <p><span className="jobs-record-count">{displayedJobs.length} records found</span> Field dispatch, maintenance, and installations</p>
        </div>
        <div className="jobs-header-actions">
        <button className="btn btn-secondary" onClick={exportJobs} disabled={loading || !displayedJobs.length}><Download size={16} /> Export</button>
        <button className="btn btn-primary" onClick={() => navigate('/jobs/create')}>
          <MdAdd /> New Job
        </button>
        </div>
      </div>

      <div className="jobs-summary" aria-label="Filtered jobs summary">
        <div><span>Total Work Orders</span><strong>{jobs.filter(job => !isCustomerRequest(job)).length}</strong><ClipboardList aria-hidden="true" /></div>
        <div><span>Inbound Requests</span><strong>{customerRequestsCount}</strong><Users aria-hidden="true" /></div>
        <div><span>Technicians on Jobs</span><strong>{new Set(jobs.filter(job => job.assigned_staff_id && job.status === 'in_progress').map(job => job.assigned_staff_id)).size}</strong><Camera aria-hidden="true" /></div>
        <div><span>Completed Jobs</span><strong>{jobs.filter(job => job.status === 'complete').length}</strong><CircleCheck aria-hidden="true" /></div>
      </div>

      {/* Section Tabs */}
      <div className="jobs-tabs" aria-label="Job categories">
        <button
          className={activeTab === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => { setActiveTab('all'); setPage(1); }}
          aria-pressed={activeTab === 'all'}
        >
          All Work Orders ({jobs.filter((job) => !isCustomerRequest(job)).length})
        </button>
        <button
          className={activeTab === 'requests' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
          onClick={() => { setActiveTab('requests'); setPage(1); }}
          aria-pressed={activeTab === 'requests'}
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
            aria-label="Search jobs and customers"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 140 }}
          value={filters.status}
          aria-label="Status"
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
          aria-label="Priority"
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
          value={filters.work_type}
          aria-label="Work type"
          onChange={(e) => setFilters({ ...filters, work_type: e.target.value })}
        >
          <option value="">All Work Types</option>
          {workTypes.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <select
          className="form-select"
          style={{ width: 180 }}
          value={filters.assigned_staff_id}
          aria-label="Assigned technician"
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
        <DateRangePicker start={filters.date_from} end={filters.date_to}
          onChange={(date_from, date_to) => setFilters({ ...filters, date_from, date_to })} />
        <button className="btn btn-secondary btn-icon" onClick={fetchJobs} title="Refresh">
          <MdRefresh />
        </button>
        <button className="btn btn-secondary btn-icon" title="Clear filters" aria-label="Clear filters" onClick={() => setFilters({ search: '', status: '', priority: '', work_type: '', site_type: '', assigned_staff_id: '', date_from: '', date_to: '' })}><RotateCcw size={17} /></button>
      </div>

      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : loadError ? (
        <div className="jobs-load-error" role="alert"><p>{loadError}</p><button className="btn btn-secondary" onClick={fetchJobs}><MdRefresh /> Retry</button></div>
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
        <div className="jobs-rows" aria-label="Jobs">
          {pagedJobs.map(job => {
            const days = daysSinceCreated(job);
            return (
              <article className="jobs-row" key={job.job_id}>
                <div className="jobs-customer">
                  <span className="jobs-device-icon"><Camera size={20} aria-hidden="true" /></span>
                  <div className="jobs-customer-copy">
                    <div className="jobs-id-line">
                      <Link className="jobs-id" to={`/jobs/${job.job_id}`}>{job.job_id}</Link>
                      <span className="jobs-work-type">{job.work_type || '-'}</span>
                    </div>
                    <Link className="jobs-customer-name" to={`/jobs/${job.job_id}`}>{job.customer_name || 'Customer'}</Link>
                    {job.customer_nickname && <span className="jobs-nickname">{job.customer_nickname}</span>}
                    <div className="jobs-contact">{job.phone_number || '-'}<span>{job.location || 'Location not provided'}</span></div>
                    <AmcIndicator coverage={job.amc_coverage} />
                    {job.is_public_submission && <span className="jobs-request-label">Customer Request</span>}
                  </div>
                </div>
                <dl className="jobs-attributes">
                  <div><dt>Assigned To</dt><dd><span className="jobs-tech-initial" aria-hidden="true">{(job.assigned_staff_name || '?').slice(0, 1).toUpperCase()}</span>{job.assigned_staff_name || 'Unassigned'}</dd></div>
                  <div><dt>Priority</dt><dd><span className={`badge badge-${job.priority}`}>{job.priority || '-'}</span></dd></div>
                  <div><dt>Status</dt><dd><span className={`badge badge-${job.status}`}>{job.request_status === 'rejected' ? 'Rejected' : STATUS_LABELS[job.status] || job.status}</span></dd>{job.rejection_remark && <dd className="jobs-rejection">{job.rejection_remark}</dd>}</div>
                  <div><dt>Scheduled</dt><dd>{formatDate(job.scheduled_date || job.service_request_date)}</dd>{days !== null && <dd className="jobs-days">{days} day{days === 1 ? '' : 's'} open</dd>}</div>
                </dl>
                <div className="jobs-row-actions">
                  {activeTab === 'requests' && job.request_status !== 'rejected' && <>
                    <button className="btn btn-success btn-sm" onClick={event => openAccept(event, job)} disabled={actionSaving}><MdCheck /> Accept</button>
                    <button className="btn btn-secondary btn-sm" onClick={event => openReject(event, job)} disabled={actionSaving}><MdClose /> Reject</button>
                  </>}
                  <Link className="btn btn-secondary btn-icon" to={`/jobs/${job.job_id}`} title="Open job" aria-label={`Open ${job.job_id}`}><ArrowUpRight size={17} /></Link>
                  <button className="btn btn-icon jobs-delete" title="Delete job" aria-label={`Delete ${job.job_id}`} onClick={event => openDelete(event, job)} disabled={actionSaving}><MdDelete /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !loadError && displayedJobs.length > 0 && (
        <nav className="jobs-pagination" aria-label="Jobs pagination">
          <span role="status">Showing {pageStart + 1}-{Math.min(pageStart + pageSize, displayedJobs.length)} of {displayedJobs.length}</span>
          <label className="jobs-page-size">Rows per page
            <select className="form-select" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
              {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="jobs-page-buttons">
            <button className="btn btn-secondary btn-icon" aria-label="Previous page" title="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
            {pageNumbers.map((number, index) => <span className="jobs-page-number" key={number}>
              {index > 0 && number - pageNumbers[index - 1] > 1 && <span className="jobs-page-gap" aria-hidden="true">...</span>}
              <button className={`btn ${number === currentPage ? 'btn-primary' : 'btn-secondary'}`} aria-label={`Page ${number}`} aria-current={number === currentPage ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>
            </span>)}
            <button className="btn btn-secondary btn-icon" aria-label="Next page" title="Next page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
          </div>
          <form className="jobs-page-jump" key={`${currentPage}-${pageCount}-${pageSize}`} onSubmit={event => {
            event.preventDefault();
            const target = Number(new FormData(event.currentTarget).get('page'));
            if (Number.isInteger(target) && target >= 1 && target <= pageCount) setPage(target);
          }}>
            <label>Jump to page <input className="form-input" name="page" type="number" min="1" max={pageCount} step="1" required defaultValue={currentPage} /></label>
            <span>of {pageCount}</span>
            <button type="submit" className="btn btn-secondary btn-icon" title="Jump to page" aria-label="Jump to page"><ArrowRight size={17} /></button>
          </form>
        </nav>
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
                  <AmcIndicator coverage={acceptJob.amc_coverage} />
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
              <h3 className="modal-title">{isCustomerRequest(deleteJob) ? 'Delete Customer Request' : 'Delete Work Order'}</h3>
              <button className="btn-icon" onClick={() => setDeleteJob(null)}>x</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                Delete <strong>{deleteJob.job_id}</strong> for <strong>{deleteJob.customer_name}</strong>?
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                This will remove the {isCustomerRequest(deleteJob) ? 'request' : 'work order'} permanently.
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
