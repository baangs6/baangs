import { useEffect, useMemo, useState } from 'react';
import { billingApi, dashboardApi, inventoryApi } from '../../api';

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const month = `${y}-${m}`;
  return { from: `${month}-01`, to: `${month}-31` };
}

export default function Reports() {
  const [dateFilter, setDateFilter] = useState(currentMonthRange);
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [techPerf, setTechPerf] = useState([]);
  const [techReport, setTechReport] = useState({
    total_service_completed: 0,
    total_installation_completed: 0,
    average_service_completion_days: 0,
    top_performer: null,
  });
  const [techDeepDive, setTechDeepDive] = useState([]);
  const [billingRows, setBillingRows] = useState([]);
  const [stockSummary, setStockSummary] = useState([]);
  const [selectedTechMetric, setSelectedTechMetric] = useState('service');

  useEffect(() => {
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
        const [techRes, techReportRes, techDeepDiveRes, billingRes, stockRes] = await Promise.all([
          dashboardApi.technicianPerformance(params),
          dashboardApi.technicianPerformanceReport(params),
          dashboardApi.technicianPerformanceDeepDive(params),
          billingApi.list({ date_from: dateFilter.from, date_to: dateFilter.to }),
          inventoryApi.stockSummary(),
        ]);
        setTechPerf(techRes.data || []);
        setTechReport(techReportRes.data || {
          total_service_completed: 0,
          total_installation_completed: 0,
          average_service_completion_days: 0,
          top_performer: null,
        });
        setTechDeepDive(techDeepDiveRes.data || []);
        setBillingRows(billingRes.data || []);
        setStockSummary(stockRes.data || []);
      } catch (e) {
        setError(e.response?.data?.detail || 'Error loading reports');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateFilter.from, dateFilter.to, technicianFilter]);

  const financialTotals = useMemo(() => {
    const totals = billingRows.reduce((acc, row) => {
      acc.revenue += Number(row.invoice_amount || 0);
      acc.expense += Number(row.expense || 0);
      acc.profit += Number(row.profit || 0);
      return acc;
    }, { revenue: 0, expense: 0, profit: 0 });
    return totals;
  }, [billingRows]);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Reports</h2>
          <p>Technician performance, finance, and inventory reporting</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Technician</label>
          <select
            className="form-select"
            value={technicianFilter}
            onChange={(e) => setTechnicianFilter(e.target.value)}
            aria-label="Technician filter"
            style={{ minWidth: 180 }}
          >
            <option value="all">All</option>
            {techPerf.map((t) => (
              <option key={t.staff_id} value={t.staff_name || t.staff_id}>
                {t.staff_name || t.staff_id}
              </option>
            ))}
          </select>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>From</label>
          <input
            type="date"
            className="input"
            value={dateFilter.from}
            onChange={(e) => setDateFilter((prev) => ({ ...prev, from: e.target.value }))}
            aria-label="From date"
          />
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>To</label>
          <input
            type="date"
            className="input"
            value={dateFilter.to}
            onChange={(e) => setDateFilter((prev) => ({ ...prev, to: e.target.value }))}
            aria-label="To date"
          />
        </div>
      </div>

      {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
      {loading ? <div className="loading-center"><div className="spinner" /><span>Loading reports...</span></div> : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">1) Technician Performance</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
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
                      <th>Total Service Completed</th>
                      <th>Total Installation Completed</th>
                      <th>Average Time to Complete Services</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techDeepDive.length ? techDeepDive.map((row) => (
                      <tr key={row.staff_id} style={{ cursor: 'pointer' }} onClick={() => setTechnicianFilter(row.staff_name || row.staff_id)}>
                        <td>{row.staff_name || row.staff_id}</td>
                        <td>{row.total_service_completed}</td>
                        <td>{row.total_installation_completed}</td>
                        <td>{Number(row.average_service_completion_days || 0).toFixed(1)}d</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
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
            <div className="card-header">
              <h3 className="card-title">2) Financial Report</h3>
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
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRows.length ? billingRows.map((b) => (
                    <tr key={b.billing_id}>
                      <td>{b.billing_id}</td>
                      <td>{b.customer_name || '-'}</td>
                      <td>{b.complete_date}</td>
                      <td>₹{Number(b.invoice_amount || 0).toLocaleString()}</td>
                      <td>₹{Number(b.expense || 0).toLocaleString()}</td>
                      <td>₹{Number(b.profit || 0).toLocaleString()}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>No financial records for this date range</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">3) Inventory Report</h3>
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
