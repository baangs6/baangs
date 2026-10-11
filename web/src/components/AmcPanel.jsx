import { useCallback, useEffect, useState } from 'react';
import { amcApi } from '../api';
import { useAuth } from '../context/useAuth';
import { formatDate } from '../utils/dateFormat';

export default function AmcPanel({ customer, job, onChange }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [link, setLink] = useState({ amc_id: '', replacement_products: false });
  const [benefits, setBenefits] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = job?.job_id || customer?.customer_id;
  const isAdmin = user?.role === 'admin';
  const isJob = !!job;
  const load = useCallback(async () => {
    try {
      const { data } = await (isJob ? amcApi.job(id) : amcApi.list(id));
      setRows(isJob ? data.contracts : data);
      if (isJob) { setLink({ amc_id: data.amc_id || '', replacement_products: data.replacement_products }); setBenefits(data.benefits); }
      setError('');
    } catch (e) { setError(e.response?.status === 404 ? 'AMC is unavailable on this backend. Deploy the backend update or use the updated local server.' : e.response?.data?.detail || 'Unable to load AMC'); }
  }, [id, isJob]);
  useEffect(() => { load(); }, [load, job?.status]);
  async function save(action) {
    setBusy(true); setError('');
    try { await action(); setForm(null); await load(); onChange?.(); }
    catch (e) { setError(e.response?.data?.detail || 'Unable to save AMC'); }
    finally { setBusy(false); }
  }
  return <section style={{ padding: '20px 0', borderTop: '1px solid var(--color-border)', marginBottom: 20 }}>
    <h3>Annual Maintenance Contract</h3>
    {error && <p role="alert">{error}</p>}
    {job && isAdmin && job.status !== 'complete' && !benefits && <div className="form-grid" style={{ marginTop: 12 }}>
      <label className="form-group">Service visit contract<select className="form-select" value={link.amc_id} onChange={e => setLink({ ...link, amc_id: e.target.value })}>
        <option value="">No AMC</option>{rows.filter(r => r.status === 'active').map(r => <option key={r.amc_id} value={r.amc_id}>{r.nickname || r.location} | {r.free_visits_remaining} free remaining | {r.amc_id}</option>)}
      </select></label>
      <label><input type="checkbox" checked={link.replacement_products} disabled={!link.amc_id} onChange={e => setLink({ ...link, replacement_products: e.target.checked })} /> All products billed on this job are replacements (10% discount)</label>
      <button className="btn btn-primary" disabled={busy} onClick={() => save(() => amcApi.link(id, { ...link, amc_id: link.amc_id || null }))}>Save AMC Selection</button>
    </div>}
    {benefits && <p>{benefits.amc_id}: {benefits.free_service ? 'Included service visit' : 'Service charges apply'} | Replacement discount: {benefits.product_discount_percent}%</p>}
    {!error && rows.length === 0 && <p>No AMC contracts for this location.</p>}
    {rows.map(r => <article key={r.amc_id} style={{ padding: '16px 0', borderBottom: '1px solid var(--color-border)' }}>
      <strong>{r.nickname || r.location} | {r.amc_id}</strong>
      <p>{formatDate(r.start_date)} to {formatDate(r.end_date)} | {r.status} | {r.days_remaining} days remaining</p>
      <p>Free visits: {r.free_visits_used}/4 used, {r.free_visits_remaining} remaining | Extra visits: {r.extra_visits} | Contract: Rs {r.amount}</p>
      {r.notes && <p>{r.notes}</p>}
      {!!r.visits.length && <ul>{r.visits.map(v => <li key={v.job_id}><a href={`/jobs/${v.job_id}`}>{v.job_id}</a> | {formatDate(v.completed_on)} | {v.free_service ? 'Included service' : 'Chargeable service'}</li>)}</ul>}
      {!job && isAdmin && r.status !== 'cancelled' && r.status !== 'expired' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (window.confirm('Cancel this AMC? Completed visit history will be retained.')) save(() => amcApi.cancel(id, r.amc_id)); }}>Cancel AMC</button>}
    </article>)}
    {!job && isAdmin && !form && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setForm({ start_date: '', location: customer.location || '', nickname: customer.nickname || '', amount: 0, notes: '' })}>Add / Renew AMC</button>}
    {form && <form onSubmit={e => { e.preventDefault(); save(() => amcApi.create(id, form)); }} style={{ marginTop: 16 }}>
      <div className="form-grid">{[['location', 'Location', 'text'], ['nickname', 'Site nickname', 'text'], ['start_date', 'Start date', 'date'], ['amount', 'Contract amount', 'number']].map(([key, label, type]) => <label className="form-group" key={key}>{label}<input className="form-input" type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} required={key === 'location' || key === 'start_date'} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}</div>
      <label className="form-group">Terms / notes<textarea className="form-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
      <button className="btn btn-primary" disabled={busy}>Save Contract</button> <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
    </form>}
  </section>;
}
