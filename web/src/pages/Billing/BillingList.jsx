import { useEffect, useState } from 'react';
import { billingApi } from '../../api';
import { MdAttachMoney, MdTrendingUp, MdDownload } from 'react-icons/md';
import { exportApi } from '../../api';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function BillingList() {
  const [billing, setBilling] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      const bRes = await billingApi.list(monthFilter ? { month: monthFilter } : {});
      setBilling(bRes.data);
      setLoading(false);
    };
    load().catch(console.error);
  }, [monthFilter]);

  const totalRevenue = billing.reduce((acc, b) => acc + b.invoice_amount + (b.collected_amount || 0), 0);
  const totalProfit = billing.reduce((acc, b) => acc + b.profit, 0);
  const totalCollected = billing.reduce((acc, b) => acc + (b.collected_amount || 0), 0);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Billing & Revenue</h2>
          <p>{billing.length} invoices</p>
        </div>
        <button className="btn btn-secondary" onClick={async () => {
          const res = await exportApi.billingCsv(); downloadBlob(res.data, 'billing.csv');
        }}><MdDownload /> Export CSV</button>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card green">
          <div className="stat-icon green"><MdAttachMoney /></div>
          <div className="stat-value">₹{(totalRevenue/1000).toFixed(1)}K</div>
          <div className="stat-label">Total Revenue</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-icon accent"><MdTrendingUp /></div>
          <div className="stat-value">₹{(totalProfit/1000).toFixed(1)}K</div>
          <div className="stat-label">Total Profit</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon amber"><MdAttachMoney /></div>
          <div className="stat-value">₹{(totalCollected/1000).toFixed(1)}K</div>
          <div className="stat-label">Amount Collected</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-icon purple"><MdTrendingUp /></div>
          <div className="stat-value">{totalRevenue > 0 ? ((totalProfit/totalRevenue)*100).toFixed(1) : 0}%</div>
          <div className="stat-label">Avg Profit Margin</div>
        </div>
      </div>

      {/* Filter */}
      <div className="filter-bar">
        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <label className="form-label" style={{ whiteSpace: 'nowrap' }}>Filter Month:</label>
          <input className="form-input" type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={{ width: 160 }} />
          {monthFilter && <button className="btn btn-secondary btn-sm" onClick={() => setMonthFilter('')}>Clear</button>}
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Work Type</th>
                <th>Invoice</th>
                <th>Amount Collected</th>
                <th>Expense</th>
                <th>Material</th>
                <th>Profit</th>
                <th>Margin</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {billing.map(b => (
                <tr key={b.billing_id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '0.8rem' }}>{b.job_id}</td>
                  <td style={{ fontWeight: 600 }}>{b.customer_name || '—'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{b.complete_date}</td>
                  <td style={{ fontSize: '0.85rem' }}>{b.work_type || '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>₹{b.invoice_amount.toLocaleString()}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-success)' }}>₹{(b.collected_amount || 0).toLocaleString()}</td>
                  <td style={{ color: 'var(--color-danger)' }}>₹{b.expense.toLocaleString()}</td>
                  <td style={{ color: 'var(--color-warning)' }}>₹{b.material_amount.toLocaleString()}</td>
                  <td style={{ fontWeight: 600, color: b.profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>₹{b.profit.toLocaleString()}</td>
                  <td><span className={`badge badge-${b.profit_percentage >= 30 ? 'complete' : b.profit_percentage >= 10 ? 'in_progress' : 'cancelled'}`}>{b.profit_percentage?.toFixed(1)}%</span></td>
                  <td style={{ fontSize: '0.8rem' }}>{b.payment_mode} {b.payment_id ? `·${b.payment_id.slice(0,8)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {billing.length === 0 && <div className="empty-state"><p>No billing records for this period</p></div>}
        </div>
      )}
    </div>
  );
}
