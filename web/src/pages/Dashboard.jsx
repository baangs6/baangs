import { createElement, useEffect, useState } from 'react';
import { dashboardApi, exportApi } from '../api';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { MdWork, MdPeople, MdAttachMoney, MdTrendingUp, MdEngineering, MdDownload, MdLocationOn, MdOpenInNew } from 'react-icons/md';
import { formatDateTime } from '../utils/dateFormat';
import DateRangePicker from '../components/DateRangePicker';
import './Dashboard.css';

const STATUS_COLORS = {
  pending: '#f59e0b', in_progress: '#3b82f6', complete: '#10b981', cancelled: '#ef4444'
};
const PRIORITY_COLORS = {
  low: '#10b981', medium: '#3b82f6', high: '#f59e0b', urgent: '#ef4444'
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DASHBOARD_DATE_FILTER_KEY = 'dashboard_date_filter_v1';

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const from = `${year}-${month}-01`;
  const to = `${year}-${month}-${String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  return { from, to };
}

function getInitialDateFilter() {
  const fallback = getCurrentMonthRange();
  try {
    const raw = localStorage.getItem(DASHBOARD_DATE_FILTER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.from === 'string' && typeof parsed?.to === 'string') {
      return { from: parsed.from, to: parsed.to };
    }
  } catch (e) {
    console.error('Invalid dashboard date filter in storage', e);
  }
  return fallback;
}

function fieldStatusBadge(status = '') {
  const normalized = status.toLowerCase();
  if (normalized.includes('on job') || normalized.includes('checked in')) return 'badge-in_progress';
  if (normalized.includes('checked out')) return 'badge-complete';
  if (normalized.includes('assigned')) return 'badge-pending';
  return 'badge-cancelled';
}

function formatDashboardTime(value) {
  return formatDateTime(value);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [jobsByStatus, setJobsByStatus] = useState([]);
  const [jobsByPriority, setJobsByPriority] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [techPerf, setTechPerf] = useState([]);
  const [techDetail, setTechDetail] = useState([]);
  const [fieldStaff, setFieldStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(getInitialDateFilter);

  const filteredDestination = (destination) => {
    const [path, query = ''] = destination.split('?');
    if (path !== '/jobs') return destination;
    const params = new URLSearchParams(query);
    if (dateFilter.from) params.set('date_from', dateFilter.from);
    if (dateFilter.to) params.set('date_to', dateFilter.to);
    return params.size ? `${path}?${params.toString()}` : path;
  };

  const openWithKeyboard = (event, destination) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(filteredDestination(destination));
    }
  };

  const clickablePanel = (destination, label) => ({
    role: 'button',
    tabIndex: 0,
    title: label,
    'aria-label': label,
    onClick: () => navigate(filteredDestination(destination)),
    onKeyDown: (event) => openWithKeyboard(event, destination),
    style: { cursor: 'pointer' },
  });

  useEffect(() => {
    localStorage.setItem(DASHBOARD_DATE_FILTER_KEY, JSON.stringify(dateFilter));
  }, [dateFilter]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = {
          date_from: dateFilter.from,
          date_to: dateFilter.to,
        };
        const [sumRes, statusRes, priorityRes, revenueRes, techRes, techDetailRes, fieldStaffRes] = await Promise.allSettled([
          dashboardApi.summary(params),
          dashboardApi.jobsByStatus(params),
          dashboardApi.jobsByPriority(params),
          dashboardApi.monthlyRevenue(params),
          dashboardApi.technicianPerformance(params),
          dashboardApi.technicianPerformanceDeepDive(params),
          dashboardApi.fieldStaffStatus(),
        ]);
        if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);
        if (statusRes.status === 'fulfilled') setJobsByStatus(statusRes.value.data);
        if (priorityRes.status === 'fulfilled') setJobsByPriority(priorityRes.value.data);
        if (revenueRes.status === 'fulfilled') setMonthlyRevenue(revenueRes.value.data);
        if (techRes.status === 'fulfilled') setTechPerf(techRes.value.data);
        if (techDetailRes.status === 'fulfilled') setTechDetail(techDetailRes.value.data);
        if (fieldStaffRes.status === 'fulfilled') setFieldStaff(fieldStaffRes.value.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateFilter.from, dateFilter.to]);

  const handleExport = async (type) => {
    try {
      let res;
      let filename;
      if (type === 'jobs') { res = await exportApi.jobsCsv(); filename = 'jobs.csv'; }
      else if (type === 'customers') { res = await exportApi.customersCsv(); filename = 'customers.csv'; }
      else if (type === 'billing') { res = await exportApi.billingCsv(); filename = 'billing.csv'; }
      else { res = await exportApi.allJson(); filename = 'baangs_export.json'; }
      downloadBlob(res.data, filename);
    } catch (e) {
      console.error('Export error', e);
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /><span>Loading dashboard...</span></div>;

  const jobs = summary?.jobs || {};
  const revenue = summary?.revenue || {};
  const metricGroups = [
    { title: 'Service Volume & Completion', tag: 'Active flow', items: [
      ['Total Jobs', jobs.total || 0, MdWork, '/jobs', 'blue'],
      ['In Progress', jobs.in_progress || 0, MdWork, '/jobs?status=in_progress', 'amber'],
      ['Completed', jobs.complete || 0, MdWork, '/jobs?status=complete', 'green'],
      ['Pending Jobs', jobs.pending || 0, MdWork, '/jobs?status=pending', 'red'],
    ] },
    { title: 'Business Revenue & Capacity', tag: 'Finance hub', items: [
      ['Customers', summary?.customers?.total || 0, MdPeople, '/customers', 'blue'],
      ['Total Revenue', `Rs ${Number(revenue.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, MdAttachMoney, '/billing', 'green'],
      ['Total Profit', `Rs ${Number(revenue.profit || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, MdTrendingUp, '/reports', 'green'],
      ['Active Staff', summary?.staff?.total || 0, MdEngineering, '/staff', 'purple'],
    ] },
  ];

  return (
    <div className="animate-fade ops-dashboard">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Dashboard</h2>
          <p>Field service operations overview</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DateRangePicker start={dateFilter.from} end={dateFilter.to} onChange={(from, to) => setDateFilter({ from, to })} />
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('jobs')}><MdDownload /> Jobs CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('all')}><MdDownload /> Full Export</button>
        </div>
      </div>

      {/* Stats */}
      <div className="dashboard-metrics">
        {metricGroups.map(group => (
          <section className="dashboard-metric-group" key={group.title}>
            <div className="dashboard-group-heading"><h3>{group.title}</h3><span>{group.tag}</span></div>
            <div className="dashboard-metric-grid">
              {group.items.map(([label, value, icon, destination, tone]) => (
                <button key={label} type="button" className={`dashboard-metric ${tone}`} onClick={() => navigate(filteredDestination(destination))}>
                  <span className="dashboard-metric-label">{label}{createElement(icon, { 'aria-hidden': true })}</span>
                  <strong>{value}</strong>
                  <span className="dashboard-metric-caption">{label === 'Completed' && jobs.total ? `${Math.round((jobs.complete || 0) / jobs.total * 100)}% completion` : 'View details'}<MdOpenInNew aria-hidden="true" /></span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="card dashboard-dispatch">
        <div className="card-header">
          <h3 className="card-title">Today Checked-In Technicians</h3>
          <span className="dashboard-count">{fieldStaff.length} checked in</span>
        </div>
        {fieldStaff.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Status</th>
                  <th>Job / Customer</th>
                  <th>Last Update</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {fieldStaff.map((staff) => (
                  <tr
                    key={staff.staff_id}
                    role={staff.job_id ? 'button' : undefined}
                    tabIndex={staff.job_id ? 0 : undefined}
                    onClick={staff.job_id ? () => navigate(`/jobs/${staff.job_id}`) : undefined}
                    onKeyDown={staff.job_id ? (event) => openWithKeyboard(event, `/jobs/${staff.job_id}`) : undefined}
                    style={staff.job_id ? { cursor: 'pointer' } : undefined}
                  >
                    <td>
                      <div style={{ fontWeight: 600 }}>{staff.staff_name || staff.staff_id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{staff.staff_id}</div>
                    </td>
                    <td>
                      <span className={`badge ${fieldStatusBadge(staff.status)}`}>{staff.status}</span>
                      {staff.source ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{staff.source}</div>
                      ) : null}
                    </td>
                    <td>
                      {staff.job_id ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/jobs/${staff.job_id}`);
                          }}
                          style={{ textAlign: 'left' }}
                        >
                          <div style={{ fontWeight: 600 }}>{staff.job_id}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{staff.customer_name || '-'}</div>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>No active job</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                      {formatDashboardTime(staff.last_update_time)}
                    </td>
                    <td>
                      {staff.map_url ? (
                        <a className="btn btn-secondary btn-sm" href={staff.map_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                          <MdLocationOn /> Map <MdOpenInNew />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>No GPS</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state"><p>No technicians checked in today</p></div>}
      </div>

      {/* Charts Row 1 */}
      <div className="dashboard-chart-group">
        <div className="card dashboard-revenue" {...clickablePanel('/billing', 'View billing details')}>
          <div className="card-header">
            <h3 className="card-title">Monthly Revenue & Profit</h3>
          </div>
          {monthlyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyRevenue}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ece9" vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #dce5df', borderRadius: 8 }}
                  formatter={v => [`₹${v.toLocaleString()}`, '']}
                />
                <Area isAnimationActive={false} type="monotone" dataKey="revenue" stroke="#00d4ff" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                <Area isAnimationActive={false} type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profGrad)" strokeWidth={2} name="Profit" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No billing data yet</p></div>}
        </div>

        <div className="card dashboard-status" {...clickablePanel('/jobs', 'View jobs by status')}>
          <div className="card-header">
            <h3 className="card-title">Jobs by Status</h3>
          </div>
          {jobsByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie isAnimationActive={false} data={jobsByStatus} dataKey="count" nameKey="status" cx="50%" cy="45%" innerRadius={48} outerRadius={70} paddingAngle={3}>
                  {jobsByStatus.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #dce5df', borderRadius: 8 }} />
                <Legend formatter={value => value.replaceAll('_', ' ')} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No job data yet</p></div>}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="dashboard-chart-group">
        <div className="card dashboard-priority" {...clickablePanel('/jobs', 'View jobs by priority')}>
          <div className="card-header">
            <h3 className="card-title">Jobs by Priority</h3>
          </div>
          {jobsByPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={jobsByPriority} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ece9" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis type="category" dataKey="priority" stroke="#64748b" fontSize={11} width={60} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #dce5df', borderRadius: 8 }} />
                <Bar isAnimationActive={false} dataKey="count" radius={[0, 4, 4, 0]}>
                  {jobsByPriority.map((entry) => (
                    <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] || '#64748b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No data yet</p></div>}
        </div>

        <div className="card dashboard-performance" {...clickablePanel('/reports', 'View technician performance reports')}>
          <div className="card-header">
            <h3 className="card-title">Technician Performance</h3>
          </div>
          {techPerf.length > 0 ? (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Attendance</th>
                    <th>Working</th>
                    <th>Installations</th>
                    <th>Services</th>
                  </tr>
                </thead>
                <tbody>
                  {techPerf.slice(0, 5).map(t => {
                    const detail = techDetail.find((item) => item.staff_id === t.staff_id) || {};
                    return (
                    <tr key={t.staff_id} onClick={() => navigate('/reports')} style={{ cursor: 'pointer' }}>
                      <td>{t.staff_name || t.staff_id}</td>
                      <td>{detail.attendance_days || 0}d</td>
                      <td>{Number(detail.working_hours || 0).toFixed(1)}h</td>
                      <td><span className="badge badge-complete">{detail.total_installation_completed || 0}</span></td>
                      <td><span className="badge badge-in_progress">{detail.total_service_attended || 0}</span></td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state"><p>No performance data yet</p></div>}
        </div>
      </div>
    </div>
  );
}
