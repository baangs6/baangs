import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Search, CheckCheck, Trash2, Settings, RefreshCw, ArrowRight, Phone, Briefcase, Boxes, TriangleAlert, CheckSquare, Mail, MailOpen, ChevronDown } from 'lucide-react';
import { notificationsApi } from '../../api';
import { formatDateTime } from '../../utils/dateFormat';
import './NotificationCenter.css';

const DEFAULT_PREFS = { desktop: false, jobs: true, warehouse: true, tasks: true, other: true, urgentOnly: false };
const categoryOf = row => row.meta?.job_id ? 'jobs' : row.meta?.task_id ? 'tasks' : /inventory|stock|warehouse/i.test(String(row.meta?.type || row.meta?.category || '')) ? 'warehouse' : 'other';
const urgent = row => row.meta?.urgent === true || ['urgent', 'high', 'critical'].includes(row.meta?.priority) || row.meta?.severity === 'critical';
const dateKey = value => { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : 'Date not recorded'; };
const message = (err, fallback) => typeof err.response?.data?.detail === 'string' ? err.response.data.detail : fallback;
function readPrefs(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return Object.fromEntries(Object.entries(DEFAULT_PREFS).map(([name, fallback]) => [name, typeof value?.[name] === 'boolean' ? value[name] : fallback])); } catch { return DEFAULT_PREFS; }
}

export default function NotificationCenter({ user, open, onClose, onCount }) {
  const navigate = useNavigate();
  const preferenceKey = `baangs-notifications:${user.user_id}`;
  const [prefs, setPrefs] = useState(() => readPrefs(preferenceKey));
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const dialog = useRef(null);
  const requested = useRef(50);
  const requestId = useRef(0);
  const busyRef = useRef(false);
  const preferencesRef = useRef(prefs);
  const frontier = useRef(null);
  const seen = useRef(new Set());
  const invalidate = useCallback(() => { requestId.current++; }, []);
  useEffect(() => { preferencesRef.current = prefs; }, [prefs]);
  useEffect(() => { onCount(count); }, [count, onCount]);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const load = useCallback(async () => {
    if (busyRef.current) return;
    const id = ++requestId.current; setLoading(true); setError('');
    try {
      const all = [];
      while (all.length < requested.current) {
        const limit = Math.min(200, requested.current - all.length);
        const { data } = await notificationsApi.list(limit, all.length);
        if (id !== requestId.current) return;
        const page = Array.isArray(data) ? data : [];
        if (page.some(row => all.some(old => old.notification_id === row.notification_id))) throw new Error('pagination');
        all.push(...page);
        if (page.length < limit) break;
      }
      const { data } = await notificationsApi.unreadCount();
      if (id !== requestId.current) return;
      setRows(all); setCount(Number(data?.count) || 0); setHasMore(all.length === requested.current);
      const prefs = preferencesRef.current;
      const latest = all[0]?.created_at || '';
      if (frontier.current !== null && prefs.desktop && 'Notification' in window && Notification.permission === 'granted') {
        for (const row of all) {
          if (row.is_read || seen.current.has(row.notification_id) || row.created_at < frontier.current || !prefs[categoryOf(row)] || prefs.urgentOnly && !urgent(row)) continue;
          try {
            const alert = new Notification(row.title || 'BAANGS', { body: row.message || '', tag: row.notification_id });
            alert.onclick = () => { window.focus(); if (row.meta?.job_id) navigate(`/jobs/${encodeURIComponent(row.meta.job_id)}`); else if (row.meta?.task_id && user.role !== 'technician') navigate('/tasks'); alert.close(); };
          } catch { /* Desktop delivery can be unavailable even with permission. */ }
        }
      }
      frontier.current = latest;
      seen.current = new Set(all.map(row => row.notification_id));
    } catch (err) { if (id === requestId.current) setError(message(err, err.message === 'pagination' ? 'Restart the backend to enable notification pagination.' : 'Unable to refresh notifications. Please retry.')); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [navigate, user.role]);
  useEffect(() => {
    load(); const timer = setInterval(load, 15000);
    return () => { clearInterval(timer); invalidate(); };
  }, [load, invalidate]);
  const filtered = rows.filter(row => (filter === 'all' || filter === 'unread' && !row.is_read || filter === 'urgent' && urgent(row) || categoryOf(row) === filter) && [row.title, row.message, row.meta?.job_id, row.meta?.task_id, row.meta?.staff_name, row.meta?.technician_name, row.meta?.customer_name].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const groups = [...filtered.reduce((map, row) => { const key = dateKey(row.created_at); if (!map.has(key)) map.set(key, []); map.get(key).push(row); return map; }, new Map())];
  const perform = async (operation, apply) => {
    if (busyRef.current) return false;
    busyRef.current = true; requestId.current++; setBusy(true); setNotice('');
    try { await operation(); apply(); setNotice('Updated successfully.'); busyRef.current = false; await load(); return true; }
    catch (err) { setNotice(message(err, 'Unable to update notifications. No local changes were applied.')); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const mark = (row, read) => perform(() => read ? notificationsApi.markRead(row.notification_id) : notificationsApi.markUnread(row.notification_id), () => { setRows(old => old.map(item => item.notification_id === row.notification_id ? { ...item, is_read: read } : item)); setCount(old => Math.max(0, old + (row.is_read === read ? 0 : read ? -1 : 1))); });
  const openTarget = async row => {
    if (!row.is_read && !await mark(row, true)) return;
    onClose(); if (row.meta?.job_id) navigate(`/jobs/${encodeURIComponent(row.meta.job_id)}`); else if (row.meta?.task_id) navigate('/tasks');
  };
  const clearFiltered = async () => {
    const ids = filtered.slice(0, 200).map(row => row.notification_id);
    if (!ids.length || !window.confirm(`Delete these ${ids.length} displayed notifications? Older or unloaded alerts will not be deleted.`)) return;
    await perform(() => notificationsApi.clearSelected(ids), () => { const removedUnread = rows.filter(row => ids.includes(row.notification_id) && !row.is_read).length; setRows(old => old.filter(row => !ids.includes(row.notification_id))); setCount(old => Math.max(0, old - removedUnread)); });
  };
  const updatePreference = async (key, value) => {
    setNotice('');
    if (key === 'desktop' && value) {
      if (!('Notification' in window)) { setNotice('Desktop notifications are not supported by this browser.'); return; }
      try { if (await Notification.requestPermission() !== 'granted') { setNotice('Desktop permission was not granted. Enable notifications in your browser settings.'); return; } }
      catch { setNotice('Unable to request desktop notification permission.'); return; }
    }
    const next = { ...prefs, [key]: value }; setPrefs(next);
    try { localStorage.setItem(preferenceKey, JSON.stringify(next)); setNotice('Browser preferences saved.'); }
    catch { setNotice('Preferences apply for this session only because browser storage is unavailable.'); }
  };
  return <dialog ref={dialog} className="alerts-drawer" aria-label="Activity & Notifications" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <header className="alerts-header"><span className="alerts-bell"><Bell size={23} /></span><div><h2>Activity & Notifications</h2><p><strong>{count} unread alerts</strong></p></div><button className="btn-icon" aria-label="Close notifications" disabled={busy} onClick={onClose}><X size={19} /></button></header>
    {notice && <p className="alerts-notice" role="status">{notice}</p>}
    {preferencesOpen ? <section className="alerts-preferences"><div><h3>Browser Notification Preferences</h3><button className="btn btn-secondary" onClick={() => setPreferencesOpen(false)}>Back to Alerts</button></div><p>These settings apply to desktop alerts on this browser. Mobile push settings are unchanged.</p>{[['desktop', 'Enable desktop notifications'], ['jobs', 'Jobs & Field desktop alerts'], ['warehouse', 'Warehouse desktop alerts'], ['tasks', 'Task desktop alerts'], ['other', 'Other desktop alerts'], ['urgentOnly', 'Only urgent desktop alerts']].map(([key, label]) => <label key={key}><input type="checkbox" checked={prefs[key]} onChange={event => updatePreference(key, event.target.checked)} />{label}</label>)}<p>Browser permission: {'Notification' in window ? Notification.permission : 'Unavailable'}</p></section> : <>
      <div className="alerts-controls"><label className="alerts-search"><Search size={18} /><input aria-label="Search notifications" placeholder="Search alerts by job, task or customer" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="btn-icon" aria-label="Clear alert search" onClick={() => setSearch('')}><X size={15} /></button>}</label><div className="alerts-filters" aria-label="Notification filters">{[['all', 'All'], ['unread', `Unread (${count})`], ['jobs', 'Jobs & Field'], ['warehouse', 'Warehouse'], ['tasks', 'Tasks'], ['urgent', 'Urgent']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><div className="alerts-loaded"><span>{filtered.length} matching of {rows.length} loaded alerts</span><button className="btn-icon" aria-label="Refresh notifications" title="Refresh notifications" disabled={loading || busy} onClick={load}><RefreshCw size={16} /></button></div></div>
      {error && <div className="alerts-error" role="alert">{error}<button className="btn btn-secondary" disabled={busy} onClick={load}>Retry notifications</button></div>}
      <div className="alerts-feed">{loading && !rows.length ? <p role="status">Loading notifications...</p> : !filtered.length ? <div className="alerts-empty"><Bell size={34} /><h3>No matching notifications</h3></div> : groups.map(([date, entries]) => <section className="alerts-date-group" key={date}><header><h3>{date === dateKey(new Date()) ? 'Today' : date} {date === dateKey(new Date()) ? `- ${date}` : ''}</h3><span>{entries.length} events</span></header>{entries.map(row => {
        const meta = row.meta || {}; const category = categoryOf(row); const phone = String(meta.technician_phone || '').replace(/\D/g, '');
        return <article key={row.notification_id} className={`alerts-card ${row.is_read ? 'is-read' : 'is-unread'} ${urgent(row) ? 'is-urgent' : ''}`}><div className="alerts-card-heading"><span className="alerts-event-icon">{urgent(row) ? <TriangleAlert size={18} /> : category === 'jobs' ? <Briefcase size={18} /> : category === 'warehouse' ? <Boxes size={18} /> : category === 'tasks' ? <CheckSquare size={18} /> : <Bell size={18} />}</span><h4>{row.title || 'Notification'}</h4>{!row.is_read && <span className="alerts-unread-dot" aria-label="Unread notification" />}<button className="btn-icon" aria-label={`${row.is_read ? 'Mark unread' : 'Mark read'} ${row.notification_id}`} title={row.is_read ? 'Mark unread' : 'Mark read'} disabled={busy} onClick={() => mark(row, !row.is_read)}>{row.is_read ? <Mail size={16} /> : <MailOpen size={16} />}</button></div><small>{formatDateTime(row.created_at)}</small>{(meta.job_id || meta.task_id || meta.technician_name || meta.staff_name || meta.status) && <dl>{(meta.technician_name || meta.staff_name) && <div><dt>Logged by</dt><dd>{meta.technician_name || meta.staff_name}</dd></div>}{(meta.job_id || meta.task_id) && <div><dt>{meta.job_id ? 'Job Code' : 'Task'}</dt><dd>{meta.job_id || meta.task_id}</dd></div>}{meta.status && <div><dt>Status</dt><dd>{meta.status}</dd></div>}</dl>}<p>{row.message || 'No additional message'}</p><div className="alerts-card-actions">{meta.job_id && user.role !== 'sales' && <button className="btn btn-primary" disabled={busy} onClick={() => openTarget(row)}>Open Job Sheet<ArrowRight size={15} /></button>}{meta.task_id && user.role !== 'technician' && <button className="btn btn-primary" disabled={busy} onClick={() => openTarget(row)}>Open Tasks<ArrowRight size={15} /></button>}{phone && <a className="btn btn-secondary" href={`tel:+${phone.length === 10 ? `91${phone}` : phone}`}><Phone size={14} />Call Tech</a>}{urgent(row) && <span className="alerts-urgent-label">Urgent</span>}</div></article>;
      })}</section>)}{hasMore && <button className="btn btn-secondary alerts-load-more" disabled={loading || busy} onClick={() => { requested.current += 50; load(); }}><ChevronDown size={16} />{loading ? 'Loading...' : 'Load Older Notifications'}</button>}</div>
    </>}
    <footer className="alerts-footer">{!preferencesOpen && <div><button className="btn btn-secondary" disabled={busy || !count || loading} onClick={() => perform(() => notificationsApi.markAllRead(), () => { setRows(old => old.map(row => ({ ...row, is_read: true }))); setCount(0); })}><CheckCheck size={17} />Mark All as Read</button><button className="btn btn-secondary" disabled={busy || !filtered.length || loading} onClick={clearFiltered}><Trash2 size={16} />Clear Filtered ({Math.min(filtered.length, 200)})</button></div>}<button className="alerts-preferences-link" onClick={() => setPreferencesOpen(value => !value)}><Settings size={15} />{preferencesOpen ? 'Back to Notifications' : 'Notification Preferences'}</button></footer>
  </dialog>;
}
