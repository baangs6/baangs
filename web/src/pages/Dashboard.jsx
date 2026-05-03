import { useEffect, useState } from 'react';
import { dashboardApi, exportApi } from '../api';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { MdWork, MdPeople, MdAttachMoney, MdTrendingUp, MdEngineering, MdDownload } from 'react-icons/md';

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

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [jobsByStatus, setJobsByStatus] = useState([]);
  const [jobsByPriority, setJobsByPriority] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [techPerf, setTechPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(getInitialDateFilter);

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
        const [sumRes, statusRes, priorityRes, revenueRes, techRes] = await Promise.all([
          dashboardApi.summary(params),
          dashboardApi.jobsByStatus(params),
          dashboardApi.jobsByPriority(params),
          dashboardApi.monthlyRevenue(params),
          dashboardApi.technicianPerformance(params),
        ]);
        setSummary(sumRes.data);
        setJobsByStatus(statusRes.data);
        setJobsByPriority(priorityRes.data);
        setMonthlyRevenue(revenueRes.data);
        setTechPerf(techRes.data);
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

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Dashboard</h2>
          <p>Welcome back! Here's your operations overview.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="date"
            className="input"
            value={dateFilter.from}
            onChange={(e) => setDateFilter((prev) => ({ ...prev, from: e.target.value }))}
            aria-label="From date"
          />
          <input
            type="date"
            className="input"
            value={dateFilter.to}
            onChange={(e) => setDateFilter((prev) => ({ ...prev, to: e.target.value }))}
            aria-label="To date"
          />
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('jobs')}><MdDownload /> Jobs CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('all')}><MdDownload /> Full Export</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card accent">
          <div className="stat-icon accent"><MdWork /></div>
          <div className="stat-value">{jobs.total || 0}</div>
          <div className="stat-label">Total Jobs</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-icon purple"><MdWork /></div>
          <div className="stat-value">{jobs.in_progress || 0}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green"><MdWork /></div>
          <div className="stat-value">{jobs.complete || 0}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon amber"><MdPeople /></div>
          <div className="stat-value">{summary?.customers?.total || 0}</div>
          <div className="stat-label">Customers</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green"><MdAttachMoney /></div>
          <div className="stat-value">₹{((revenue.total || 0) / 1000).toFixed(1)}K</div>
          <div className="stat-label">Total Revenue</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-icon accent"><MdTrendingUp /></div>
          <div className="stat-value">₹{((revenue.profit || 0) / 1000).toFixed(1)}K</div>
          <div className="stat-label">Total Profit</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-icon purple"><MdEngineering /></div>
          <div className="stat-value">{summary?.staff?.total || 0}</div>
          <div className="stat-label">Active Staff</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon amber"><MdWork /></div>
          <div className="stat-value">{jobs.pending || 0}</div>
          <div className="stat-label">Pending Jobs</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
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
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ background: '#141928', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  formatter={v => [`₹${v.toLocaleString()}`, '']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#00d4ff" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profGrad)" strokeWidth={2} name="Profit" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No billing data yet</p></div>}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Jobs by Status</h3>
          </div>
          {jobsByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={jobsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, count }) => `${status}: ${count}`} labelLine={false}>
                  {jobsByStatus.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#141928', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No job data yet</p></div>}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Jobs by Priority</h3>
          </div>
          {jobsByPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={jobsByPriority} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis type="category" dataKey="priority" stroke="#64748b" fontSize={11} width={60} />
                <Tooltip contentStyle={{ background: '#141928', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {jobsByPriority.map((entry) => (
                    <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] || '#64748b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-state"><p>No data yet</p></div>}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Technician Performance</h3>
          </div>
          {techPerf.length > 0 ? (
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Total</th>
                    <th>Done</th>
                    <th>WIP</th>
                  </tr>
                </thead>
                <tbody>
                  {techPerf.slice(0, 5).map(t => (
                    <tr key={t.staff_id}>
                      <td>{t.staff_name || t.staff_id}</td>
                      <td>{t.total_jobs}</td>
                      <td><span className="badge badge-complete">{t.completed}</span></td>
                      <td><span className="badge badge-in_progress">{t.in_progress}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state"><p>No performance data yet</p></div>}
        </div>
      </div>
    </div>
  );
}
