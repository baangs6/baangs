import { useState } from 'react';
import { quotationsApi } from '../api';

export default function QuotationCustomerFollowup({ customer, onSaved }) {
  const [remark, setRemark] = useState(customer.customer_remark || '');
  const [date, setDate] = useState(customer.followup_date || '');
  const [done, setDone] = useState(customer.followup_done || false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(completed = done) {
    setBusy(true); setMessage('');
    try {
      const { data } = await quotationsApi.followup(customer.quote_id, { customer_remark: remark, followup_date: date || null, followup_done: completed });
      onSaved(data); setDone(completed); setMessage('Customer follow-up saved.');
    } catch (error) { setMessage(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Unable to save follow-up. Please try again.'); }
    finally { setBusy(false); }
  }
  const due = date && !done && date <= new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return <section className="quote-followup"><h3>Remarks & Follow-up</h3>
    <label className="form-group">Customer remarks<textarea className="form-input" rows={3} maxLength={3000} value={remark} onChange={e => setRemark(e.target.value)} /></label>
    <div className="quote-actions"><label className="form-group">Follow-up date<input type="date" className="form-input" value={date} onChange={e => { setDate(e.target.value); setDone(false); }} /></label>
      <span className={`quote-status ${due ? 'rejected' : 'accepted'}`}>{done ? 'Completed' : due ? 'Follow-up due' : date ? 'Scheduled' : 'Not scheduled'}</span>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save()}>Save Remarks / Reminder</button>
      {date && !done && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => save(true)}>Mark Done</button>}
    </div>{message && <p role="status">{message}</p>}
  </section>;
}
