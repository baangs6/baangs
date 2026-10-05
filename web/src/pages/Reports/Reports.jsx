import { useEffect, useMemo, useState } from 'react';
import { billingApi, dashboardApi, inventoryApi, staffApi } from '../../api';
import { formatDate } from '../../utils/dateFormat';
import { calculateBillingProfit } from '../../utils/billingMath';
import DateRangePicker from '../../components/DateRangePicker';
import './Reports.css';

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const month = `${y}-${m}`;
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${lastDay}` };
}

export default function Reports() {
  const [dateFilter, setDateFilter] = useState(currentMonthRange);
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [technicians, setTechnicians] = useState([]);
  useEffect(() => {
    staffApi.list().then(response => setTechnicians(response.data || [])).catch(() => setError('Unable to load technician filters.'));
  }, []);
  const [techReport, setTechReport] = useState({
    total_service_completed: 0,
    total_installation_completed: 0,
    average_service_completion_days: 0,
    top_performer: null,
  });
  const [techDeepDive, setTechDeepDive] = useState([]);
  const [billingRows, setBillingRows] = useState([]);
  const [stockSummary, setStockSummary] = useState([]);
  const [qualityReport, setQualityReport] = useState({ summary: {}, technicians: [] });
  const [selectedTechMetric, setSelectedTechMetric] = useState('service');

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {
          date_from: dateFilter.from,
          date_to: dateFilter.to,
        };
        if (technicianFilter !== 'all') {
          params.technician_name = technicianFilter;
        }
        const results = await Promise.allSettled([
          dashboardApi.technicianPerformanceReport(params),
          dashboardApi.technicianPerformanceDeepDive(params),
          billingApi.list(params),
          inventoryApi.stockSummary(),
          dashboardApi.serviceQualityReport(params),
        ]);
        const [techReportRes, techDeepDiveRes, billingRes, stockRes, qualityRes] = results;
        if (ignore) return;
        const data = (result, fallback) => result.status === 'fulfilled' ? (result.value.data || fallback) : fallback;
        const failedSections = results
          .map((result, index) => result.status === 'rejected' ? ['performance summary', 'technician details', 'financial', 'inventory', 'service quality'][index] : null)
          .filter(Boolean);
        setTechReport(data(techReportRes, {
          total_service_completed: 0,
          total_installation_completed: 0,
          average_service_completion_days: 0,
          top_performer: null,
        }));
        setTechDeepDive(data(techDeepDiveRes, []));
        setBillingRows(data(billingRes, []));
        setStockSummary(data(stockRes, []));
        setQualityReport(data(qualityRes, { summary: {}, technicians: [] }));
        if (failedSections.length) setError(`Some report data could not be loaded: ${failedSections.join(', ')}.`);
      } catch {
        if (!ignore) setError('Unable to load reports. Please refresh the page.');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [dateFilter.from, dateFilter.to, technicianFilter]);

  const financialTotals = useMemo(() => {
    const totals = billingRows.reduce((acc, row) => {
      acc.revenue += Number(row.invoice_amount || 0);
      acc.expense += Number(row.expense || 0);
      acc.material += Number(row.material_amount || 0);
      acc.profit += calculateBillingProfit(row).profit;
      return acc;
    }, { revenue: 0, expense: 0, material: 0, profit: 0 });
    return totals;
  }, [billingRows]);

  return (
    <div className="animate-fade reports-page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Reports</h2>
          <p>Technician performance, finance, and inventory reporting</p>
        </div>
        <div className="reports-filters">
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Technician</label>
          <select
            className="form-select"
            value={technicianFilter}
            onChange={(e) => setTechnicianFilter(e.target.value)}
            aria-label="Technician filter"
            style={{ minWidth: 180 }}
          >
            <option value="all">All</option>
            {technicians.map((t) => (
              <option key={t.staff_id} value={t.staff_id}>
                {t.name || t.full_name || t.staff_id}
              </option>
            ))}
          </select>
          <DateRangePicker start={dateFilter.from} end={dateFilter.to} onChange={(from, to) => setDateFilter({ from, to })} />
        </div>
      </div>

      {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
      {loading ? <div className="loading-center"><div className="spinner" /><span>Loading reports...</span></div> : (
        <div className="reports-sections">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">1) Technician Performance</h3>
            </div>
            <div className="reports-metrics">
              <button className="stat-card" style={{ textAlign: 'left' }} onClick={() => setSelectedTechMetric('service')}>
                <div className="stat-value">{techReport.total_service_completed}</div>
                <div className="stat-label">Total Service Completed</div>
                <div className="stat-label" style={{ marginTop: 6, color: 'var(--color-primary)' }}>View details</div>
              </button>
              <button className="stat-card" style={{ textAlign: 'left' }} onClick={() => setSelectedTechMetric('installation')}>
                <div className="stat-value">{techReport.total_installation_completed}</div>
                <div className="stat-label">Total Installation Completed</div>
                <div className="stat-label" style={{ marginTop: 6, color: 'var(--color-primary)' }}>View details</div>
              </button>
              <button className="stat-card" style={{ textAlign: 'left' }} onClick={() => setSelectedTechMetric('avg_time')}>
                <div className="stat-value">{Number(techReport.average_service_completion_days || 0).toFixed(1)}d</div>
                <div className="stat-label">Average Time to Complete Services</div>
                <div className="stat-label" style={{ marginTop: 6, color: 'var(--color-primary)' }}>View details</div>
              </button>
              <button className="stat-card" style={{ textAlign: 'left' }} onClick={() => setSelectedTechMetric('top_performer')}>
                <div className="stat-value">{techReport.top_performer?.staff_name || '-'}</div>
                <div className="stat-label">
                  Top Performer of the Month
                  {techReport.top_performer ? ` (${techReport.top_performer.completed_jobs})` : ''}
                </div>
                <div className="stat-label" style={{ marginTop: 6, color: 'var(--color-primary)' }}>View details</div>
              </button>
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Performance Deep Dive</div>
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Technician</th>
                      <th>Attendance</th>
                      <th>Working Time</th>
                      <th>Installation Time</th>
                      <th>Installations Completed</th>
                      <th>Services Attended</th>
                      <th>Services Completed</th>
                      <th>Avg Service Completion</th>
                      <th>Site Visits</th>
                      <th>New Projects</th>
                      <th>Food Expense</th>
                      <th>Petrol Expense</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techDeepDive.length ? techDeepDive.map((row) => (
                      <tr key={row.staff_id} style={{ cursor: 'pointer' }} onClick={() => setTechnicianFilter(row.staff_id)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {row.photo_url ? <img src={row.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} /> : null}
                            <span>{row.staff_name || row.staff_id}</span>
                          </div>
                        </td>
                        <td>{row.attendance_days || 0} days</td>
                        <td>{Number(row.working_hours || 0).toFixed(1)} hrs</td>
                        <td>{Number(row.installation_hours || 0).toFixed(1)} hrs</td>
                        <td>{row.total_installation_completed || 0}</td>
                        <td>{row.total_service_attended || 0}</td>
                        <td>{row.total_service_completed || 0}</td>
                        <td>{Number(row.average_service_completion_days || 0).toFixed(1)} days</td>
                        <td>{row.total_site_visits || 0}</td>
                        <td>{row.new_projects_created || 0}</td>
                        <td>₹{Number(row.food_expense || 0).toLocaleString()}</td>
                        <td>₹{Number(row.petrol_expense || 0).toLocaleString()}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={12} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                          No technician deep-dive data for this date range
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {selectedTechMetric === 'service' && 'Detail View: Per-technician completed service counts. Click any technician row to filter by that technician.'}
                {selectedTechMetric === 'installation' && 'Detail View: Per-technician completed installation counts. Click any technician row to filter by that technician.'}
                {selectedTechMetric === 'avg_time' && 'Detail View: Per-technician average service completion time. Click any technician row to filter by that technician.'}
                {selectedTechMetric === 'top_performer' && 'Detail View: Ranked list by completed work. Click any technician row to filter by that technician.'}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">2) Service Quality & Discipline</h3></div>
            <div className="stat-grid" style={{ marginBottom: 16 }}>
              {[
                ['Average Repair / Breakdown Time', `${Number(qualityReport.summary?.average_repair_hours || 0).toFixed(1)} hrs`],
                ['Repeat Complaint', `${Number(qualityReport.summary?.repeat_complaint_pct || 0).toFixed(1)}%`],
                ['Customer Satisfaction Score', qualityReport.summary?.customer_satisfaction_score == null ? 'Not yet rated' : `${qualityReport.summary.customer_satisfaction_score}/5 (${qualityReport.summary.customer_rating_count || 0} ratings)`],
                ['Service Report Completion', `${Number(qualityReport.summary?.service_report_completion_pct || 0).toFixed(1)}%`],
                ['Service Calls Completed', qualityReport.summary?.service_calls_completed || 0],
                ['Attendance & Discipline', `${Number(qualityReport.summary?.attendance_discipline_pct || 0).toFixed(1)}%`],
                ['Issues Reporting', qualityReport.summary?.issues_reported || 0],
                ['Self Learning', qualityReport.summary?.self_learning_entries || 0],
                ['Communication & Professional Behaviour', qualityReport.summary?.communication_score == null ? 'Not yet rated' : `${qualityReport.summary.communication_score}/5`],
                ['Scheduled PM Jobs On Time', `${Number(qualityReport.summary?.pm_on_time_pct || 0).toFixed(1)}%`],
              ].map(([label, value]) => (
                <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-value" style={{ fontSize: 22 }}>{value}</div></div>
              ))}
            </div>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead><tr><th>Technician</th><th>Customer Rating</th><th>Avg Repair</th><th>Calls</th><th>Reports</th><th>Attendance</th><th>Issues</th><th>Learning</th><th>PM On Time</th></tr></thead>
                <tbody>
                  {qualityReport.technicians?.length ? qualityReport.technicians.map((row) => (
                    <tr key={row.staff_id}>
                      <td>{row.staff_name || row.staff_id}</td><td>{row.customer_satisfaction_score == null ? '-' : `${row.customer_satisfaction_score}/5 (${row.customer_rating_count})`}</td><td>{Number(row.average_repair_hours || 0).toFixed(1)} hrs</td><td>{row.service_calls_completed || 0}</td><td>{Number(row.service_report_completion_pct || 0).toFixed(1)}%</td><td>{Number(row.attendance_discipline_pct || 0).toFixed(1)}%</td><td>{row.issues_reported || 0}</td><td>{row.self_learning_entries || 0}</td><td>{Number(row.pm_on_time_pct || 0).toFixed(1)}%</td>
                    </tr>
                  )) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>No technician quality data for this date range</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">3) Financial Report</h3>
            </div>
            <div className="stat-grid" style={{ marginBottom: 12 }}>
              <div className="stat-card green">
                <div className="stat-label">Revenue</div>
                <div className="stat-value">₹{financialTotals.revenue.toLocaleString()}</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-label">Expense</div>
                <div className="stat-value">₹{financialTotals.expense.toLocaleString()}</div>
              </div>
              <div className="stat-card accent">
                <div className="stat-label">Material</div>
                <div className="stat-value">₹{financialTotals.material.toLocaleString()}</div>
              </div>
              <div className="stat-card accent">
                <div className="stat-label">Profit</div>
                <div className="stat-value">₹{financialTotals.profit.toLocaleString()}</div>
              </div>
            </div>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Billing ID</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Invoice</th>
                    <th>Expense</th>
                    <th>Material</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRows.length ? billingRows.map((b) => (
                    <tr key={b.billing_id}>
                      <td>{b.billing_id}</td>
                      <td>{b.customer_name || '-'}</td>
                      <td>{formatDate(b.complete_date)}</td>
                      <td>₹{Number(b.invoice_amount || 0).toLocaleString()}</td>
                      <td>₹{Number(b.expense || 0).toLocaleString()}</td>
                      <td>₹{Number(b.material_amount || 0).toLocaleString()}</td>
                      <td>₹{calculateBillingProfit(b).profit.toLocaleString()}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>No financial records for this date range</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">4) Inventory Report - Current Stock</h3>
            </div>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Item</th>
                    <th>Initial Qty</th>
                    <th>Transactions</th>
                    <th>Current Stock</th>
                    <th>Low Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {stockSummary.length ? stockSummary.map((s) => (
                    <tr key={s.model_number}>
                      <td>{s.model_number}</td>
                      <td>{s.item_name}</td>
                      <td>{s.initial_quantity}</td>
                      <td>{s.total_transactions}</td>
                      <td>{s.current_stock}</td>
                      <td><span className={`badge ${s.low_stock === 'YES' ? 'badge-cancelled' : 'badge-complete'}`}>{s.low_stock}</span></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>No inventory data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
