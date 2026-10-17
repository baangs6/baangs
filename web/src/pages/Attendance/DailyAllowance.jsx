import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceApi } from '../../api';
import { formatDate, formatDateTime } from '../../utils/dateFormat';
import { Search, Download, Printer, RefreshCw, Receipt, ChevronLeft, ChevronRight, ChevronDown, ExternalLink, Trash2, Wallet, CircleCheck, Clock3, MessageCircle } from 'lucide-react';
import './DailyAllowance.css';

const money = value => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const categoryName = value => ({ food: 'Food', petrol: 'Travel & Fuel', other: 'Other Expense' })[value] || value || 'Other Expense';
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
function receiptUrl(value) {
  try { const url = new URL(value, window.location.origin); return value && ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
const eligible = row => Number(row.balance_amount || 0) > 0;

export default function DailyAllowance({ filters, staff }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selectedId, setSelectedId] = useState(null);
  const [checkedIds, setCheckedIds] = useState([]);
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const [payment, setPayment] = useState({ amount: '', channel: 'Cash', remark: '' });
  const [batch, setBatch] = useState({ amount: '', channel: 'Cash', remark: '' });
  const [photo, setPhoto] = useState(null);
  const dialog = useRef(null);
  const requestId = useRef(0);
  const currentFilters = useRef(filters);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const params = Object.fromEntries(Object.entries(currentFilters.current).filter(([, value]) => value));
      const all = [];
      for (let skip = 0; ; skip += 200) {
        const { data } = await attendanceApi.allowances({ ...params, skip, limit: 200 });
        if (id !== requestId.current) return;
        const page = Array.isArray(data) ? data : [];
        all.push(...page);
        if (page.length < 200) break;
      }
      setRows([...new Map(all.map(row => [row.allowance_id, row])).values()]);
    } catch (err) {
      if (id === requestId.current) setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Unable to load expenses. Please try again.');
    } finally { if (id === requestId.current) setLoading(false); }
  }, []);
  const invalidateRequest = useCallback(() => { requestId.current++; }, []);
  useEffect(() => { currentFilters.current = filters; load(); return invalidateRequest; }, [filters, load, invalidateRequest]);
  useEffect(() => { if (photo) dialog.current?.showModal(); }, [photo]);

  const filtered = rows.filter(row => (category === 'all' || row.expense_type === category) && (status === 'all' || row.payment_status === status) && [row.staff_name, row.staff_id, row.allowance_id, row.remark].join(' ').toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => sort === 'amount' ? Number(b.amount) - Number(a.amount) : sort === 'oldest' ? String(a.date).localeCompare(String(b.date)) : String(b.date).localeCompare(String(a.date)));
  const key = JSON.stringify([filters, search, category, status, sort, filtered.map(row => row.allowance_id)]);
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const page = Math.min(pagination.key === key ? pagination.page : 1, pages);
  const visible = filtered.slice((page - 1) * 6, page * 6);
  const selected = visible.find(row => row.allowance_id === selectedId) || visible[0];
  const checked = filtered.filter(row => eligible(row) && checkedIds.includes(row.allowance_id));
  const checkedBalance = checked.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
  const totals = filtered.reduce((sum, row) => ({ amount: sum.amount + Number(row.amount || 0), paid: sum.paid + Number(row.paid_amount || 0), balance: sum.balance + Number(row.balance_amount || 0) }), { amount: 0, paid: 0, balance: 0 });
  const receipt = selected && receiptUrl(selected.bill_url);
  const staffRecord = selected && staff.find(person => person.staff_id === selected.staff_id);
  const phone = String(staffRecord?.phone || staffRecord?.phone_number || '').replace(/\D/g, '');
  const selectClaim = row => { if (busy) return; setSelectedId(row.allowance_id); setPayment({ amount: '', channel: 'Cash', remark: '' }); setNotice(''); };
  const toggle = row => setCheckedIds(ids => ids.includes(row.allowance_id) ? ids.filter(id => id !== row.allowance_id) : [...ids, row.allowance_id]);

  const recordPayment = async (claims, form, isBatch) => {
    if (busy) return;
    const balance = claims.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
    const amount = Number(form.amount || balance);
    if (!claims.length || !Number.isFinite(amount) || amount <= 0) { setNotice('Select a payable expense and enter a valid amount.'); return; }
    if (amount > balance && !window.confirm(`Record ${money(amount - balance)} above the outstanding balance?`)) return;
    setBusy(true); setNotice('');
    try {
      const { data } = await attendanceApi.payAllowances({ allowance_ids: claims.map(row => row.allowance_id), paid_amount: amount, payment_remark: `${form.channel}${form.remark.trim() ? ` | ${form.remark.trim()}` : ''}` });
      if (Array.isArray(data)) setRows(old => old.map(row => data.find(updated => updated.allowance_id === row.allowance_id) || row));
      if (isBatch) { setCheckedIds([]); setBatch({ amount: '', channel: 'Cash', remark: '' }); }
      else setPayment({ amount: '', channel: 'Cash', remark: '' });
      setNotice('Payment recorded. No bank transfer was initiated.');
      await load();
    } catch (err) { setNotice(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : 'Unable to record payment. Your entries have been kept.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected || !window.confirm(`Delete expense ${selected.allowance_id} for ${selected.staff_name || selected.staff_id}? This removes the expense record${Number(selected.paid_amount) > 0 ? ' and its recorded payment history' : ''}.`)) return;
    setBusy(true); setNotice('');
    try { await attendanceApi.deleteAllowance(selected.allowance_id); setRows(old => old.filter(row => row.allowance_id !== selected.allowance_id)); setCheckedIds(ids => ids.filter(id => id !== selected.allowance_id)); setNotice('Expense deleted.'); await load(); }
    catch (err) { setNotice(err.response?.data?.detail || 'Unable to delete expense.'); }
    finally { setBusy(false); }
  };
  const exportCsv = () => {
    const cell = value => { let text = String(value ?? ''); if (/^\s*[=+@-]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
    const fields = ['allowance_id', 'date', 'staff_name', 'staff_id', 'expense_type', 'amount', 'paid_amount', 'balance_amount', 'extra_paid_amount', 'payment_status', 'remark', 'payment_remark', 'payment_made_date'];
    const csv = [fields, ...filtered.map(row => fields.map(field => row[field]))].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'daily-allowances.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const printVoucher = () => {
    const win = window.open('', '_blank', 'width=720,height=850');
    if (!win) { setNotice('Allow pop-ups to print this voucher.'); return; }
    win.opener = null;
    win.document.title = `Expense ${selected.allowance_id}`;
    const heading = win.document.createElement('h1'); heading.textContent = 'BAANGS Expense Voucher'; win.document.body.append(heading);
    for (const [name, value] of [['Reference', selected.allowance_id], ['Staff', selected.staff_name || selected.staff_id], ['Date', selected.date], ['Category', categoryName(selected.expense_type)], ['Claimed', money(selected.amount)], ['Paid', money(selected.paid_amount)], ['Outstanding', money(selected.balance_amount)], ['Payment status', selected.payment_status], ['Remark', selected.remark || '-'], ['Payment reference', selected.payment_remark || '-']]) {
      const paragraph = win.document.createElement('p'); paragraph.textContent = `${name}: ${value}`; win.document.body.append(paragraph);
    }
    win.document.body.style.cssText = 'font:16px Arial,sans-serif;padding:32px;color:#132327;'; win.focus(); win.print();
  };
  const paymentFields = (form, setForm, balance, prefix) => <div className="allowance-payment-fields"><label>Amount to record<input aria-label={`${prefix} payment amount`} type="number" min="0.01" step="0.01" className="form-input" placeholder={Number(balance).toFixed(2)} value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} disabled={busy} /></label><label>Payment mode<select aria-label={`${prefix} payment mode`} className="form-select" value={form.channel} onChange={event => setForm({ ...form, channel: event.target.value })} disabled={busy}><option>Cash</option><option>UPI</option><option>Bank Transfer</option></select></label><label className="allowance-reference">Transaction reference / note<input aria-label={`${prefix} payment reference`} className="form-input" value={form.remark} onChange={event => setForm({ ...form, remark: event.target.value })} disabled={busy} /></label></div>;

  return <div className="allowance-console">
    <div className="allowance-toolbar"><label className="attendance-search"><Search size={17} /><input aria-label="Search expenses" placeholder="Search staff, claim or remark" value={search} onChange={event => setSearch(event.target.value)} /></label><select className="form-select" aria-label="Expense payment status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All Payment Status</option>{['unpaid', 'partial', 'paid', 'overpaid'].map(value => <option key={value}>{value}</option>)}</select><button className="btn btn-secondary" onClick={exportCsv} disabled={loading || !!error}><Download size={17} />Export Statement</button><button className="btn-icon" title="Refresh expenses" aria-label="Refresh expenses" onClick={load} disabled={busy || loading}><RefreshCw size={17} /></button></div>
    {notice && <p className="allowance-notice" role="status">{notice}</p>}
    {error && <div role="alert" className="attendance-error">{error}<button className="btn btn-secondary" onClick={load}>Retry expenses</button></div>}
    {loading ? <div className="loading-center" role="status">Loading expenses...</div> : !error && <>
      <div className="allowance-summary"><div><span>Total Expenses</span><strong>{money(totals.amount)}</strong><small>{filtered.length} claims in this view</small><Wallet size={22} /></div><div><span>Recorded / Paid</span><strong>{money(totals.paid)}</strong><small>{filtered.filter(row => ['paid', 'overpaid'].includes(row.payment_status)).length} claims settled</small><CircleCheck size={22} /></div><div><span>Outstanding Balance</span><strong>{money(totals.balance)}</strong><small>{filtered.filter(eligible).length} claims with balance</small><Clock3 size={22} /></div></div>
      <div className="allowance-categories" aria-label="Expense categories">{[['all', 'All Expenses'], ['food', 'Food'], ['petrol', 'Travel & Fuel'], ['other', 'Other Expenses']].map(([value, label]) => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{label}<span>{value === 'all' ? rows.length : rows.filter(row => row.expense_type === value).length}</span></button>)}</div>
      <div className="allowance-workspace"><section className="allowance-feed">
        <div className="allowance-batch"><div className="allowance-section-heading"><h3>Selected: {checked.length} items</h3><strong>{money(checkedBalance)} balance</strong></div><label className="allowance-select-all"><input type="checkbox" aria-label="Select all payable matching expenses" checked={filtered.some(eligible) && filtered.filter(eligible).every(row => checkedIds.includes(row.allowance_id))} onChange={event => setCheckedIds(event.target.checked ? filtered.filter(eligible).map(row => row.allowance_id) : [])} disabled={busy} />Select all matching payable claims</label>{checked.length > 0 && paymentFields(batch, setBatch, checkedBalance, 'Batch')}<button className="btn btn-primary" disabled={!checked.length || busy} onClick={() => recordPayment(checked, batch, true)}><Wallet size={17} />{busy ? 'Saving...' : 'Record Batch Payment'}</button></div>
        <div className="allowance-section-heading"><h3>Expense Claim Feed ({filtered.length})</h3><label className="allowance-sort">Sort by<select aria-label="Sort expenses" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Date (Newest)</option><option value="oldest">Date (Oldest)</option><option value="amount">Amount (Highest)</option></select><ChevronDown size={14} /></label></div>
        {!filtered.length ? <div className="allowance-empty"><Receipt size={32} /><p>No expense rows found</p></div> : <>{visible.map(row => <article key={row.allowance_id} className={`allowance-claim ${row.allowance_id === selected?.allowance_id ? 'is-selected' : ''}`}><input type="checkbox" aria-label={`Select ${row.allowance_id}`} checked={checkedIds.includes(row.allowance_id)} disabled={!eligible(row) || busy} onChange={() => toggle(row)} /><button aria-label={`Inspect expense ${row.allowance_id}`} aria-pressed={row.allowance_id === selected?.allowance_id} onClick={() => selectClaim(row)}><span className="attendance-avatar">{initials(row.staff_name || row.staff_id)}</span><span className="allowance-claim-info"><strong>{row.staff_name || row.staff_id}</strong><small>{formatDate(row.date)} | {categoryName(row.expense_type)}</small><span>{row.remark || 'No remark'}</span></span><span className="allowance-claim-amount"><strong>{money(row.amount)}</strong><small className={`allowance-payment-status is-${row.payment_status}`}>{row.payment_status}</small></span><ChevronRight size={18} /></button></article>)}<div className="attendance-pagination"><span>{(page - 1) * 6 + 1}-{Math.min(page * 6, filtered.length)} of {filtered.length} claims</span><div><button className="btn-icon" aria-label="Previous expense page" disabled={page === 1} onClick={() => setPagination({ key, page: page - 1 })}><ChevronLeft size={17} /></button><label>Page<select aria-label="Expense page" value={page} onChange={event => setPagination({ key, page: Number(event.target.value) })}>{Array.from({ length: pages }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select>of {pages}</label><button className="btn-icon" aria-label="Next expense page" disabled={page === pages} onClick={() => setPagination({ key, page: page + 1 })}><ChevronRight size={17} /></button></div></div></>}
      </section>{selected && <aside className="allowance-inspector" aria-label="Voucher inspector"><div className="allowance-inspector-header"><div><small>{selected.allowance_id}</small><h3>Voucher Inspector</h3></div><span className={`allowance-payment-status is-${selected.payment_status}`}>{selected.payment_status}</span><button className="btn-icon" aria-label="Print voucher" title="Print voucher / Save as PDF" onClick={printVoucher}><Printer size={18} /></button></div><div className="allowance-inspector-body"><div className="allowance-person"><span className="attendance-avatar">{initials(selected.staff_name || selected.staff_id)}</span><div><strong>{selected.staff_name || selected.staff_id}</strong><small>{selected.staff_id}</small></div><small>{formatDateTime(selected.created_at || selected.date)}</small></div><div className="allowance-description"><span>{categoryName(selected.expense_type)}</span><p>{selected.remark || 'No expense remark recorded'}</p></div><dl className="allowance-finances">{[['Claimed Amount', selected.amount], ['Recorded Paid', selected.paid_amount], ['Outstanding Balance', selected.balance_amount], ['Extra Paid', selected.extra_paid_amount]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl><section className="allowance-proof"><h4><Receipt size={16} />Attached Proof / Bill</h4>{receipt ? <><button aria-label="Zoom receipt" onClick={() => setPhoto(receipt)}><img src={receipt} alt="Expense receipt" /><span>Inspect Zoom<ExternalLink size={14} /></span></button><a href={receipt} target="_blank" rel="noopener noreferrer">Open original receipt<ExternalLink size={13} /></a></> : <div className="allowance-no-proof"><Receipt size={28} /><p>No receipt attached</p></div>}</section><dl className="allowance-payment-record"><dt>Payment reference / note</dt><dd>{selected.payment_remark || 'Not recorded'}</dd><dt>Recorded by / date</dt><dd>{selected.paid_by || '-'} | {formatDateTime(selected.paid_at || selected.payment_made_date)}</dd></dl>{eligible(selected) && <section className="allowance-record-form"><h4>Record Payment</h4>{paymentFields(payment, setPayment, selected.balance_amount, 'Voucher')}<button className="btn btn-primary" disabled={busy} onClick={() => recordPayment([selected], payment, false)}><Wallet size={17} />{busy ? 'Saving...' : `Record Payment ${money(Number(payment.amount || selected.balance_amount))}`}</button></section>}<div className="allowance-inspector-actions">{phone && <a className="btn btn-secondary" href={`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(`Please clarify expense ${selected.allowance_id}: ${selected.remark || categoryName(selected.expense_type)} (${money(selected.amount)}).`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Query on WhatsApp</a>}<button className="btn btn-secondary" disabled={busy} onClick={remove}><Trash2 size={16} />Delete Expense</button></div></div></aside>}</div>
    </>}
    {photo && <dialog ref={dialog} className="allowance-receipt-dialog" aria-label="Receipt preview" onCancel={() => setPhoto(null)}><img src={photo} alt="Full expense receipt" /><button className="btn btn-secondary" onClick={() => setPhoto(null)}>Close receipt</button></dialog>}
  </div>;
}
