import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MdCheckCircle, MdQuestionAnswer, MdSchool } from 'react-icons/md';
import { staffApi, updatesApi } from '../../api';
import { formatDateTime } from '../../utils/dateFormat';
import RangeSwitch from '../../components/RangeSwitch';
import DateRangePicker from '../../components/DateRangePicker';

export default function LearningLog() {
  const [period, setPeriod] = useState('day');
  const [staffId, setStaffId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [staff, setStaff] = useState([]);
  const [data, setData] = useState({ summary: {}, items: [] });
  const [replies, setReplies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (period === 'custom' && (!dateFrom || !dateTo)) return;
    setLoading(true);
    setError('');
    try {
      const params = { period };
      if (staffId) params.staff_id = staffId;
      if (status) params.doubt_status = status;
      if (period === 'custom') Object.assign(params, { date_from: dateFrom, date_to: dateTo });
      const response = await updatesApi.learningLog(params);
      setData(response.data || { summary: {}, items: [] });
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load learning and doubt records');
    } finally {
      setLoading(false);
    }
  }, [period, staffId, status, dateFrom, dateTo]);

  useEffect(() => {
    staffApi.list().then((res) => setStaff(Array.isArray(res.data) ? res.data : [])).catch(() => setStaff([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (item, doubtStatus) => {
    try {
      await updatesApi.reviewDoubt(item.update_id, {
        admin_reply: replies[item.update_id] ?? item.admin_reply ?? '',
        doubt_status: doubtStatus,
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to update this doubt');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div><h1>Learning & Doubts</h1><p>Technician notes from completed field work</p></div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
          <RangeSwitch value={period} onChange={setPeriod} />
          <DateRangePicker
            start={dateFrom}
            end={dateTo}
            active={period === 'custom'}
            onChange={(start, end) => { setDateFrom(start); setDateTo(end); if (start && end) setPeriod('custom'); }}
          />
          <label className="form-group">Technician<select value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">All technicians</option>{staff.map((person) => <option key={person.staff_id} value={person.staff_id}>{person.name || person.full_name || person.staff_id}</option>)}</select></label>
          <label className="form-group">Doubt status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="answered">Answered</option><option value="resolved">Resolved</option></select></label>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><span>Total notes</span><strong>{data.summary?.total || 0}</strong></div>
        <div className="stat-card"><span>Learnings</span><strong>{data.summary?.learnings || 0}</strong></div>
        <div className="stat-card"><span>Doubts</span><strong>{data.summary?.doubts || 0}</strong></div>
        <div className="stat-card"><span>Open doubts</span><strong>{data.summary?.open_doubts || 0}</strong></div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? <div className="loading-center"><div className="spinner" /></div> : data.items?.length === 0 ? <div className="card empty-state"><MdSchool size={36} /><h3>No notes in this period</h3></div> : (
        <div style={{ display: 'grid', gap: 14 }}>
          {data.items.map((item) => (
            <article className="card" key={item.update_id} style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div><strong>{item.staff_name || item.assigned_staff_id}</strong><div className="text-muted">{formatDateTime(item.update_time)}</div></div>
                <Link className="btn btn-secondary btn-sm" to={`/jobs/${item.job_id}`}>{item.job_id}{item.customer_name ? ` · ${item.customer_name}` : ''}</Link>
              </div>
              {item.learning_notes && <div style={{ marginTop: 16, padding: 14, background: 'var(--color-success-light, #ecfdf5)', borderLeft: '3px solid var(--color-success)' }}><strong><MdSchool /> Learned{item.learning_category ? ` · ${item.learning_category}` : ''}</strong><p style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap' }}>{item.learning_notes}</p></div>}
              {item.issues_faced && <div style={{ marginTop: 12, padding: 14, background: 'var(--color-warning-light, #fffbeb)', borderLeft: '3px solid var(--color-warning)' }}>
                <strong><MdQuestionAnswer /> Doubt · {item.doubt_status || 'open'}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{item.issues_faced}</p>
                {item.admin_reply && <p><strong>Admin reply:</strong> {item.admin_reply}</p>}
                <textarea rows="2" value={replies[item.update_id] ?? item.admin_reply ?? ''} onChange={(e) => setReplies((old) => ({ ...old, [item.update_id]: e.target.value }))} placeholder="Write a helpful reply" />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-primary btn-sm" onClick={() => review(item, 'answered')}>Reply</button><button className="btn btn-secondary btn-sm" onClick={() => review(item, 'resolved')}><MdCheckCircle /> Resolve</button></div>
              </div>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
