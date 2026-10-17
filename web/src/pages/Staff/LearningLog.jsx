import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, BadgeCheck, CircleHelp, TriangleAlert, Search, Plus, ArrowRight, Bookmark, MapPin, MessageCircle, RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { staffApi, updatesApi } from '../../api';
import { formatDateTime } from '../../utils/dateFormat';
import RangeSwitch from '../../components/RangeSwitch';
import DateRangePicker from '../../components/DateRangePicker';
import './LearningLog.css';

const initials = name => String(name || '?').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const errorMessage = (error, fallback) => typeof error.response?.data?.detail === 'string' ? error.response.data.detail : fallback;

export default function LearningLog() {
  const [period, setPeriod] = useState('month');
  const [staffId, setStaffId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [staff, setStaff] = useState([]);
  const [items, setItems] = useState([]);
  const [replies, setReplies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const [entry, setEntry] = useState(null);
  const requestId = useRef(0);
  const dialog = useRef(null);
  const invalidate = useCallback(() => { requestId.current++; }, []);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (period === 'custom' && (!dateFrom || !dateTo || dateFrom > dateTo)) { setError('Choose a valid start and end date.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const params = { period, ...(staffId && { staff_id: staffId }), ...(period === 'custom' && { date_from: dateFrom, date_to: dateTo }) };
      const { data } = await updatesApi.learningLog(params);
      if (id === requestId.current) setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) { if (id === requestId.current) setError(errorMessage(err, 'Unable to load learning and doubt records')); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [period, staffId, dateFrom, dateTo]);
  useEffect(() => { load(); return invalidate; }, [load, invalidate]);
  useEffect(() => { staffApi.list().then(({ data }) => setStaff(Array.isArray(data) ? data : [])).catch(() => setNotice('Technician list unavailable. Refresh the page to retry.')); }, []);
  useEffect(() => { if (entry) dialog.current?.showModal(); }, [entry]);

  const filtered = items.filter(item => (!status || (item.issues_faced && item.doubt_status === status)) && (tab === 'all' || tab === 'learning' && item.learning_notes || tab === 'open' && item.issues_faced && item.doubt_status === 'open' || tab === 'sop' && item.team_sop) && [item.staff_name, item.job_id, item.customer_name, item.learning_notes, item.issues_faced, item.learning_category, item.admin_reply].join(' ').toLowerCase().includes(search.toLowerCase().trim()));
  const key = JSON.stringify([period, staffId, dateFrom, dateTo, status, tab, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 4));
  const page = Math.min(pagination.key === key ? pagination.page : 1, pages);
  const visible = filtered.slice((page - 1) * 4, page * 4);
  const selected = visible.find(item => item.update_id === selectedId) || visible[0];
  const counts = { all: items.length, learning: items.filter(item => item.learning_notes).length, open: items.filter(item => item.issues_faced && item.doubt_status === 'open').length, sop: items.filter(item => item.team_sop).length };
  const technician = selected && staff.find(person => person.staff_id === selected.assigned_staff_id);
  const phone = String(technician?.phone_number || technician?.phone || '').replace(/\D/g, '');
  const draft = selected ? replies[selected.update_id] ?? selected.admin_reply ?? '' : '';
  const unsaved = selected && draft !== (selected.admin_reply || '');

  const review = async (changes) => {
    if (busy || !selected) return;
    if ((changes.doubt_status === 'answered' || changes.team_sop) && !draft.trim() && !selected.learning_notes) { setNotice('Write a resolution before publishing or saving a team SOP.'); return; }
    const id = selected.update_id;
    setBusy(true); setNotice('');
    try {
      const { data } = await updatesApi.reviewDoubt(id, { admin_reply: draft, doubt_status: selected.doubt_status || 'open', ...changes });
      setItems(old => old.map(item => item.update_id === id ? { ...item, ...data } : item));
      setReplies(old => { const next = { ...old }; delete next[id]; return next; });
      setNotice('Saved successfully.');
    } catch (err) { setNotice(errorMessage(err, 'Unable to save. Your resolution has been kept.')); }
    finally { setBusy(false); }
  };
  const createEntry = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setNotice('');
    try {
      await updatesApi.createLearning(entry);
      setEntry(null); setNotice('Note logged. The list follows the selected date and technician filters.'); await load();
    } catch (err) { setNotice(errorMessage(err, 'Unable to log this note. Your entries have been kept.')); }
    finally { setBusy(false); }
  };

  return <div className="learning-console">
    <header className="learning-header"><div><small>KNOWLEDGE BASE & ESCALATIONS</small><h1>Learning & Doubts</h1><p>Technician notes, field learnings and team resolutions</p></div><div className="learning-controls"><RangeSwitch value={period} onChange={setPeriod} /><DateRangePicker start={dateFrom} end={dateTo} active={period === 'custom'} onChange={(start, end) => { setDateFrom(start); setDateTo(end); if (start && end) setPeriod('custom'); }} /><select className="form-select" aria-label="Technician" value={staffId} onChange={event => setStaffId(event.target.value)}><option value="">All Technicians</option>{staff.map(person => <option key={person.staff_id} value={person.staff_id}>{person.name || person.full_name || person.staff_id}</option>)}</select><select className="form-select" aria-label="Doubt status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All Statuses</option><option value="open">Open Doubts</option><option value="answered">Answered</option><option value="resolved">Resolved</option></select><button className="btn btn-primary" onClick={() => { setNotice(''); setEntry({ job_id: '', staff_id: staffId, kind: 'doubt', note: '', category: 'General' }); }}><Plus size={17} />Log Query</button><button className="btn-icon" aria-label="Refresh notes" title="Refresh notes" disabled={busy || loading} onClick={load}><RefreshCw size={17} /></button></div></header>
    {notice && <p role="status" className="learning-notice">{notice}</p>}
    {error && <div role="alert" className="learning-error">{error}<button className="btn btn-secondary" onClick={load}>Retry notes</button></div>}
    {loading ? <div className="loading-center" role="status">Loading notes...</div> : !error && <>
      <div className="learning-metrics">{[['Total Field Notes', counts.all, <BookOpen size={23} />], ['Team SOPs', counts.sop, <BadgeCheck size={23} />], ['Total Doubts Logged', items.filter(item => item.issues_faced).length, <CircleHelp size={23} />], ['Open Doubts', counts.open, <TriangleAlert size={23} />]].map(([label, value, icon]) => <div key={label}><span>{label}</span><strong>{value}</strong>{icon}</div>)}</div>
      {items.length >= 1000 && <p role="status">Showing up to 1,000 notes. Narrow the date range for complete results.</p>}
      <div className="learning-workspace"><section className="learning-feed"><div className="learning-search-panel"><label className="learning-search"><Search size={18} /><input aria-label="Search notes" placeholder="Search notes, technician or job" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="btn-icon" aria-label="Clear search" onClick={() => setSearch('')}><X size={16} /></button>}</label><div className="learning-tabs" aria-label="Note categories">{[['all', 'All Notes'], ['learning', 'Field Learnings'], ['open', 'Open Doubts'], ['sop', 'Team SOPs']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}<span>{counts[value]}</span></button>)}</div></div>
        {!filtered.length ? <div className="learning-empty"><BookOpen size={32} /><h3>No notes match these filters</h3></div> : <>{visible.map(item => <article className={`learning-note ${item.update_id === selected?.update_id ? 'is-selected' : ''}`} key={item.update_id}><button aria-label={`Inspect note ${item.update_id}`} aria-pressed={selected?.update_id === item.update_id} onClick={() => setSelectedId(item.update_id)}><div className="learning-note-top"><span className="learning-avatar">{initials(item.staff_name)}</span><div><strong>{item.staff_name || item.assigned_staff_id}</strong><small>{item.customer_name || item.job_id}</small></div><span className={`learning-badge ${item.team_sop ? 'is-sop' : ''}`}>{item.team_sop ? 'Team SOP' : item.issues_faced ? item.doubt_status : 'Field Learning'}</span></div><h3>{item.issues_faced || item.learning_notes}</h3><p>{item.learning_notes || item.visit_notes || item.admin_reply || 'Awaiting a resolution'}</p><div className="learning-note-footer"><span>{item.learning_category || 'General'}</span><small>{formatDateTime(item.update_time)}</small><ArrowRight size={17} /></div>{item.site_visit_required && <span className="learning-badge">Site visit required</span>}</button></article>)}<div className="learning-pagination"><span>{(page - 1) * 4 + 1}-{Math.min(page * 4, filtered.length)} of {filtered.length} notes</span><div><button className="btn-icon" aria-label="Previous notes page" disabled={page === 1} onClick={() => setPagination({ key, page: page - 1 })}><ChevronLeft size={17} /></button><label>Page<select aria-label="Notes page" value={page} onChange={event => setPagination({ key, page: Number(event.target.value) })}>{Array.from({ length: pages }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select>of {pages}</label><button className="btn-icon" aria-label="Next notes page" disabled={page === pages} onClick={() => setPagination({ key, page: page + 1 })}><ChevronRight size={17} /></button></div></div></>}
      </section>{selected && <aside className="learning-inspector" aria-label="Note inspector"><header><div><span className="learning-badge">{selected.issues_faced ? `Doubt: ${selected.doubt_status}` : 'Field Learning'}</span><small>{selected.update_id}</small></div><h2>{selected.issues_faced || selected.learning_notes}</h2><dl><div><dt>Logged by</dt><dd>{selected.staff_name}</dd></div><div><dt>Linked Job Order</dt><dd><Link to={`/jobs/${encodeURIComponent(selected.job_id)}`}>{selected.job_id}</Link></dd></div></dl></header><div className="learning-inspector-body"><small>{formatDateTime(selected.update_time)}</small><h4>Field Query / Learning</h4><p className="learning-full-note">{selected.issues_faced}{selected.issues_faced && selected.learning_notes ? '\n\n' : ''}{selected.learning_notes}</p><div className="learning-resolution"><h3><BadgeCheck size={19} />Expert Resolution & Field Directives</h3><label htmlFor="learning-resolution">Resolution</label><textarea id="learning-resolution" className="form-textarea" rows={7} maxLength={10000} value={draft} disabled={busy} onChange={event => setReplies(old => ({ ...old, [selected.update_id]: event.target.value }))} /><small>{selected.replied_by ? `Last saved by ${selected.replied_by} | ${formatDateTime(selected.replied_at)}` : 'No admin resolution saved yet'}</small></div><div className="learning-actions"><button className="btn btn-primary" disabled={busy} onClick={() => review({ doubt_status: selected.issues_faced ? 'answered' : 'resolved' })}>{busy ? 'Saving...' : 'Save Resolution'}</button>{selected.issues_faced && <button className="btn btn-secondary" disabled={busy} onClick={() => review({ doubt_status: selected.doubt_status === 'resolved' ? 'open' : 'resolved' })}>{selected.doubt_status === 'resolved' ? 'Reopen Doubt' : 'Mark Resolved'}</button>}<button className="btn btn-secondary" disabled={busy} onClick={() => review({ team_sop: !selected.team_sop })}><Bookmark size={16} />{selected.team_sop ? 'Remove Team SOP' : 'Save to Team SOP'}</button><button className="btn btn-secondary" disabled={busy} onClick={() => review({ site_visit_required: !selected.site_visit_required })}><MapPin size={16} />{selected.site_visit_required ? 'Clear Site Visit Flag' : 'Flag for Site Visit'}</button>{phone && selected.admin_reply && !unsaved && <a className="btn btn-primary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(`BAANGS resolution | ${selected.job_id}\n${selected.admin_reply}`)}`}><MessageCircle size={17} />Send Saved Resolution via WhatsApp</a>}</div></div></aside>}</div>
    </>}
    {entry && <dialog ref={dialog} className="learning-entry-dialog" aria-label="Log field note" onCancel={event => { if (busy) event.preventDefault(); else setEntry(null); }}><form onSubmit={createEntry}><header><h2>Log Field Note</h2><button type="button" className="btn-icon" aria-label="Close log form" disabled={busy} onClick={() => setEntry(null)}><X size={18} /></button></header>{notice && <p role="status">{notice}</p>}<label>Job ID<input className="form-input" required maxLength={100} value={entry.job_id} onChange={event => setEntry({ ...entry, job_id: event.target.value })} /></label><label>Technician<select className="form-select" required value={entry.staff_id} onChange={event => setEntry({ ...entry, staff_id: event.target.value })}><option value="">Select technician</option>{staff.map(person => <option key={person.staff_id} value={person.staff_id}>{person.name || person.full_name || person.staff_id}</option>)}</select></label><label>Note type<select className="form-select" value={entry.kind} onChange={event => setEntry({ ...entry, kind: event.target.value })}><option value="doubt">Doubt / Query</option><option value="learning">Field Learning</option></select></label><label>Category<input className="form-input" maxLength={100} value={entry.category} onChange={event => setEntry({ ...entry, category: event.target.value })} /></label><label>Note<textarea className="form-textarea" required maxLength={10000} rows={5} value={entry.note} onChange={event => setEntry({ ...entry, note: event.target.value })} /></label><button className="btn btn-primary" disabled={busy || !entry.note.trim()}>{busy ? 'Saving...' : 'Save Note'}</button></form></dialog>}
  </div>;
}
