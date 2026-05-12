import { useEffect, useState, useCallback } from 'react';
import { attendanceApi, staffApi, exportApi, leavesApi } from '../../api';
import { MdDownload, MdLocationOn, MdPhoto } from 'react-icons/md';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceReport() {
  const [records, setRecords] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ staff_id: '', date_from: '', date_to: '' });
  const [viewPhoto, setViewPhoto] = useState(null);
  const [leaveRows, setLeaveRows] = useState([]);
  const [leaveHistoryRows, setLeaveHistoryRows] = useState([]);
  const [activeTab, setActiveTab] = useState('attendance');
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payrollData, setPayrollData] = useState({ totals: null, items: [] });
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [allowanceRows, setAllowanceRows] = useState([]);
  const [allowanceLoading, setAllowanceLoading] = useState(false);
  const [selectedAllowances, setSelectedAllowances] = useState([]);
  const [payForm, setPayForm] = useState({ paid_amount: '', payment_remark: '' });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.staff_id) params.staff_id = filters.staff_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const res = await attendanceApi.list(params);
      setRecords(res.data);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { staffApi.list().then(r => setStaff(r.data)); }, []);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => {
    leavesApi.list({ status: 'pending' }).then((r) => setLeaveRows(r.data || [])).catch(console.error);
    leavesApi.list().then((r) => setLeaveHistoryRows(r.data || [])).catch(console.error);
  }, []);

  const loadPayroll = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const res = await staffApi.payrollSummary(payrollMonth);
      setPayrollData({
        totals: res.data?.totals || null,
        items: res.data?.items || [],
      });
    } catch (e) {
      console.error(e);
      setPayrollData({ totals: null, items: [] });
    } finally {
      setPayrollLoading(false);
    }
  }, [payrollMonth]);

  useEffect(() => {
    if (activeTab === 'payroll') loadPayroll();
  }, [activeTab, loadPayroll]);

  const loadAllowances = useCallback(async () => {
    setAllowanceLoading(true);
    try {
      const params = {};
      if (filters.staff_id) params.staff_id = filters.staff_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      const res = await attendanceApi.allowances(params);
      setAllowanceRows(res.data || []);
      setSelectedAllowances([]);
      setPayForm({ paid_amount: '', payment_remark: '' });
    } catch (e) {
      console.error(e);
      setAllowanceRows([]);
    } finally {
      setAllowanceLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (activeTab === 'allowance') loadAllowances();
  }, [activeTab, loadAllowances]);

  const handleExport = async () => {
    try {
      const res = await exportApi.attendanceCsv();
      downloadBlob(res.data, 'attendance.csv');
    } catch (e) { console.error(e); }
  };

  const decideLeave = async (leaveId, decision) => {
    try {
      await leavesApi.decide(leaveId, decision);
      const res = await leavesApi.list({ status: 'pending' });
      setLeaveRows(res.data || []);
      const historyRes = await leavesApi.list();
      setLeaveHistoryRows(historyRes.data || []);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.detail || 'Failed to update leave');
    }
  };

  const payableAllowanceRows = allowanceRows.filter((row) => Number(row.balance_amount || 0) > 0);

  const toggleAllowance = (allowanceId) => {
    const row = allowanceRows.find((item) => item.allowance_id === allowanceId);
    if (!row || Number(row.balance_amount || 0) <= 0) return;
    setSelectedAllowances((prev) =>
      prev.includes(allowanceId)
        ? prev.filter((id) => id !== allowanceId)
        : [...prev, allowanceId]
    );
  };

  const selectedAllowanceRows = payableAllowanceRows.filter((row) => selectedAllowances.includes(row.allowance_id));
  const selectedBalance = selectedAllowanceRows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
  const enteredPayment = Number(payForm.paid_amount || 0);
  const paymentDifference = enteredPayment - selectedBalance;

  const paySelectedAllowances = async () => {
    if (selectedAllowances.length === 0) {
      alert('Select at least one expense');
      return;
    }
    if (!enteredPayment || enteredPayment <= 0) {
      alert('Enter a valid paid amount');
      return;
    }
    try {
      await attendanceApi.payAllowances({
        allowance_ids: selectedAllowances,
        paid_amount: enteredPayment,
        payment_remark: payForm.payment_remark,
      });
      await loadAllowances();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to update payment');
    }
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Attendance Report</h2>
          <p>{records.length} records</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}><MdDownload /> Export CSV</button>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={activeTab === 'attendance' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setActiveTab('attendance')}
          >
            Attendance Log
          </button>
          <button
            className={activeTab === 'leave' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setActiveTab('leave')}
          >
            Leave History
          </button>
          <button
            className={activeTab === 'payroll' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setActiveTab('payroll')}
          >
            Payroll
          </button>
          <button
            className={activeTab === 'allowance' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setActiveTab('allowance')}
          >
            Daily Allowance
          </button>
        </div>
      </div>

      {(activeTab === 'attendance' || activeTab === 'allowance') && (
        <div className="filter-bar">
          <select className="form-select" style={{ width: 200 }} value={filters.staff_id}
            onChange={e => setFilters({ ...filters, staff_id: e.target.value })}>
            <option value="">All Staff</option>
            {staff.map(s => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
          </select>
          <input className="form-input" type="date" value={filters.date_from} style={{ width: 160 }}
            onChange={e => setFilters({ ...filters, date_from: e.target.value })} placeholder="Date from" />
          <input className="form-input" type="date" value={filters.date_to} style={{ width: 160 }}
            onChange={e => setFilters({ ...filters, date_to: e.target.value })} />
          <button className="btn btn-secondary" onClick={() => setFilters({ staff_id: '', date_from: '', date_to: '' })}>Clear</button>
        </div>
      )}

      {activeTab === 'payroll' ? (
        <>
          <div className="card" style={{ marginBottom: 16, padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="form-input"
              type="month"
              value={payrollMonth}
              onChange={(e) => setPayrollMonth(e.target.value)}
              style={{ width: 200 }}
            />
            <button className="btn btn-secondary btn-sm" onClick={loadPayroll}>Load Payroll</button>
          </div>

          {payrollLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <>
              {payrollData.totals && (
                <div className="stats-grid" style={{ marginBottom: 12 }}>
                  <div className="stat-card">
                    <div className="stat-value">{payrollData.totals.total_staff || 0}</div>
                    <div className="stat-label">Employees</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">₹{Number(payrollData.totals.total_gross_pay || 0).toFixed(2)}</div>
                    <div className="stat-label">Total Gross</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">₹{Number(payrollData.totals.total_net_pay || 0).toFixed(2)}</div>
                    <div className="stat-label">Total Net</div>
                  </div>
                </div>
              )}

              <div className="card">
                <h3 className="card-title" style={{ marginBottom: 12 }}>Monthly Payroll</h3>
                {payrollData.items.length === 0 ? (
                  <div className="empty-state"><p>No payroll rows for this month</p></div>
                ) : (
                  <div className="table-wrapper" style={{ border: 'none' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Staff</th>
                          <th>Type</th>
                          <th>Present</th>
                          <th>Paid Leave</th>
                          <th>Unpaid Leave</th>
                          <th>Payable Days</th>
                          <th>Base Pay</th>
                          <th>Overtime</th>
                          <th>Allowance</th>
                          <th>Deduction</th>
                          <th>Net Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollData.items.map((p) => (
                          <tr key={p.staff_id}>
                            <td>{p.name || p.staff_id}</td>
                            <td>{String(p.salary_type || '-').toUpperCase()}</td>
                            <td>{p.present_days}</td>
                            <td>{p.paid_leave_days}</td>
                            <td>{p.unpaid_leave_days}</td>
                            <td>{p.payable_days}</td>
                            <td>₹{Number(p.base_pay || 0).toFixed(2)}</td>
                            <td>₹{Number(p.overtime_pay || 0).toFixed(2)}</td>
                            <td>₹{Number(p.allowance || 0).toFixed(2)}</td>
                            <td>₹{Number(p.deduction || 0).toFixed(2)}</td>
                            <td style={{ fontWeight: 700 }}>₹{Number(p.net_pay || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : activeTab === 'allowance' ? (
        <>
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card">
              <div className="stat-value">₹{allowanceRows.reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2)}</div>
              <div className="stat-label">Total Expenses</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">₹{allowanceRows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0).toFixed(2)}</div>
              <div className="stat-label">Paid</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">₹{allowanceRows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0).toFixed(2)}</div>
              <div className="stat-label">Balance</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">₹{allowanceRows.reduce((sum, row) => sum + Number(row.extra_paid_amount || 0), 0).toFixed(2)}</div>
              <div className="stat-label">Extra Paid</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="card-title" style={{ marginBottom: 12 }}>Pay Selected Expenses</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <div className="detail-label">Selected</div>
                <div style={{ fontWeight: 700 }}>{selectedAllowances.length} rows · ₹{selectedBalance.toFixed(2)} balance</div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Paid Amount</label>
                <input
                  className="form-input"
                  type="number"
                  value={payForm.paid_amount}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, paid_amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Payment Remark</label>
                <input
                  className="form-input"
                  value={payForm.payment_remark}
                  onChange={(e) => setPayForm((prev) => ({ ...prev, payment_remark: e.target.value }))}
                  placeholder="Cash / UPI ref"
                />
              </div>
              <button className="btn btn-success" onClick={paySelectedAllowances}>Paid</button>
            </div>
            {selectedAllowances.length > 0 && enteredPayment > 0 ? (
              <div style={{ marginTop: 10, fontSize: '0.85rem', color: paymentDifference >= 0 ? 'var(--color-success)' : 'var(--color-amber)' }}>
                {paymentDifference >= 0
                  ? `Extra paid after clearing balance: ₹${paymentDifference.toFixed(2)}`
                  : `Balance remaining after payment: ₹${Math.abs(paymentDifference).toFixed(2)}`}
              </div>
            ) : null}
          </div>

          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 12 }}>Daily Allowance Expenses</h3>
            {allowanceLoading ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : allowanceRows.length === 0 ? (
              <div className="empty-state"><p>No expense rows found</p></div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={payableAllowanceRows.length > 0 && selectedAllowances.length === payableAllowanceRows.length}
                          onChange={(e) => setSelectedAllowances(e.target.checked ? payableAllowanceRows.map((row) => row.allowance_id) : [])}
                        />
                      </th>
                      <th>Date</th>
                      <th>Staff</th>
                      <th>Expense Type</th>
                      <th>Amount</th>
                      <th>Bill</th>
                      <th>Remark</th>
                      <th>Payment Status</th>
                      <th>Payment Date</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allowanceRows.map((row) => (
                      <tr key={row.allowance_id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedAllowances.includes(row.allowance_id)}
                            disabled={Number(row.balance_amount || 0) <= 0}
                            onChange={() => toggleAllowance(row.allowance_id)}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{row.date}</td>
                        <td>{row.staff_name || row.staff_id}</td>
                        <td>{formatExpenseType(row.expense_type)}</td>
                        <td>₹{Number(row.amount || 0).toFixed(2)}</td>
                        <td>
                          {row.bill_url ? (
                            <button className="btn btn-secondary btn-sm" onClick={() => setViewPhoto(row.bill_url)} style={{ padding: 4 }}>
                              <img src={row.bill_url} alt="Bill" style={{ width: 42, height: 32, objectFit: 'cover', borderRadius: 4 }} />
                            </button>
                          ) : '—'}
                        </td>
                        <td style={{ maxWidth: 220, fontSize: '0.82rem' }}>{row.remark || '—'}</td>
                        <td><span className={`badge ${statusBadgeClass(row.payment_status)}`}>{row.payment_status}</span></td>
                        <td>{row.payment_made_date || '—'}</td>
                        <td>₹{Number(row.paid_amount || 0).toFixed(2)}</td>
                        <td>₹{Number(row.balance_amount || 0).toFixed(2)}</td>
                        <td>₹{Number(row.extra_paid_amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'leave' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="card-title" style={{ marginBottom: 12 }}>Leave Applications (Pending)</h3>
            {leaveRows.length === 0 ? (
              <div className="empty-state"><p>No pending leave requests</p></div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRows.map((l) => (
                      <tr key={l.leave_id}>
                        <td>{l.staff_name || l.staff_id}</td>
                        <td>{String(l.leave_type || '-').toUpperCase()}</td>
                        <td>{l.from_date}</td>
                        <td>{l.to_date}</td>
                        <td style={{ maxWidth: 260 }}>{l.reason}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-success btn-sm" onClick={() => decideLeave(l.leave_id, 'approved')}>Accept</button>
                            <button className="btn btn-danger btn-sm" onClick={() => decideLeave(l.leave_id, 'rejected')}>Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 className="card-title" style={{ marginBottom: 12 }}>All Leave Requests</h3>
            {leaveHistoryRows.length === 0 ? (
              <div className="empty-state"><p>No leave history yet</p></div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Decision Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveHistoryRows.map((l) => (
                      <tr key={`history-${l.leave_id}`}>
                        <td>{l.staff_name || l.staff_id}</td>
                        <td>{String(l.leave_type || '-').toUpperCase()}</td>
                        <td>{l.from_date}</td>
                        <td>{l.to_date}</td>
                        <td style={{ maxWidth: 280 }}>{l.reason}</td>
                        <td>
                          {l.status === 'approved' && <span className="badge badge-complete">Approved</span>}
                          {l.status === 'rejected' && <span className="badge badge-cancelled">Rejected</span>}
                          {l.status !== 'approved' && l.status !== 'rejected' && <span className="badge badge-in_progress">Pending</span>}
                        </td>
                        <td>{l.decision_at || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📍</div>
          <h3>No attendance records</h3>
          <p>Technicians use the mobile app to check in/out</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Staff</th>
                <th>Check-In</th>
                <th>Check-Out</th>
                <th>Location (In)</th>
                <th>Remarks</th>
                <th>Status</th>
                <th>Photos</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.attendance_id}>
                  <td style={{ fontWeight: 600 }}>{r.date}</td>
                  <td>{r.staff_name || r.staff_id}</td>
                  <td style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--color-success)' }}>
                    {r.checkin_time?.slice(11, 19) || '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: r.checkout_time ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {r.checkout_time?.slice(11, 19) || '—'}
                  </td>
                  <td>
                    {r.checkin_latitude ? (
                      <a href={`https://maps.google.com/?q=${r.checkin_latitude},${r.checkin_longitude}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                        <MdLocationOn style={{ color: 'var(--color-accent)' }} />
                        {r.checkin_latitude?.toFixed(4)}, {r.checkin_longitude?.toFixed(4)}
                      </a>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', maxWidth: 200 }}>{r.remarks || '—'}</td>
                  <td>
                    {r.is_checked_out
                      ? <span className="badge badge-complete">Checked Out</span>
                      : <span className="badge badge-in_progress">Active</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.checkin_photo_url && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewPhoto(r.checkin_photo_url)} title="Check-in photo">
                          <MdPhoto /> In
                        </button>
                      )}
                      {r.checkout_photo_url && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setViewPhoto(r.checkout_photo_url)} title="Check-out photo">
                          <MdPhoto /> Out
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Photo Viewer Modal */}
      {viewPhoto && (
        <div className="modal-overlay" onClick={() => setViewPhoto(null)}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', maxWidth: 500 }}>
            <img src={viewPhoto} alt="Attendance photo" style={{ width: '100%', maxHeight: 500, objectFit: 'cover', display: 'block' }} />
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setViewPhoto(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatExpenseType(value) {
  if (value === 'food') return 'Food Expense';
  if (value === 'petrol') return 'Petrol Expense';
  return 'Other Expense';
}

function statusBadgeClass(status) {
  if (status === 'paid' || status === 'overpaid') return 'badge-complete';
  if (status === 'partial') return 'badge-in_progress';
  return 'badge-pending';
}
