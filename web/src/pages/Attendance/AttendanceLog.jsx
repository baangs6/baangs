import { useState } from 'react';
import { Search, MapPin, Clock3, Camera, LogIn, LogOut, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, UserRound } from 'lucide-react';
import { formatDate } from '../../utils/dateFormat';

const time = value => value?.slice(11, 19) || '-';
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
function coordinates(row, prefix) {
  const lat = row[`${prefix}_latitude`], lng = row[`${prefix}_longitude`];
  if (lat == null || lng == null || lat === '' || lng === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return { label: `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`, href: `https://maps.google.com/?q=${Number(lat)},${Number(lng)}` };
}
function Location({ row, prefix }) {
  const location = coordinates(row, prefix);
  return location ? <a href={location.href} target="_blank" rel="noopener noreferrer"><MapPin size={14} />{location.label}<ExternalLink size={12} /></a> : <span className="attendance-muted">Location not recorded</span>;
}

export default function AttendanceLog({ records, loading, error, onRetry, onPhoto }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const filtered = records.filter(row => (status === 'all' || (status === 'out' ? row.is_checked_out : !row.is_checked_out)) && `${row.staff_name || ''} ${row.staff_id || ''} ${row.remarks || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const key = JSON.stringify([search, status, records.map(row => row.attendance_id)]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const page = Math.min(pagination.key === key ? pagination.page : 1, pages);
  const visible = filtered.slice((page - 1) * 10, page * 10);
  const selected = visible.find(row => row.attendance_id === selectedId) || visible[0];
  const active = filtered.filter(row => !row.is_checked_out).length;
  const photoCount = filtered.filter(row => row.checkin_photo_url).length;
  const jump = next => { setPagination({ key, page: Math.max(1, Math.min(pages, next)) }); setSelectedId(null); };
  return <>
    <div className="attendance-log-tools">
      <label className="attendance-search"><Search size={18} /><input aria-label="Search attendance" placeholder="Search staff, ID or remarks" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select className="form-select" aria-label="Attendance status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All Status</option><option value="active">Active</option><option value="out">Checked Out</option></select>
      <button className="btn-icon" title="Refresh attendance" aria-label="Refresh attendance" onClick={onRetry} disabled={loading}><RefreshCw size={18} /></button>
    </div>
    {error && <div className="attendance-error" role="alert">{error}<button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button></div>}
    {loading ? <div className="loading-center" role="status">Loading attendance...</div> : <>
      <div className="attendance-roster-summary"><span>Field Roster <strong>{filtered.length} records</strong></span><span><i /> Active: {active}<span className="attendance-muted">Checked out: {filtered.length - active}</span></span></div>
      {!filtered.length ? <div className="attendance-empty"><UserRound size={36} /><h3>No attendance records</h3><p>{search || status !== 'all' ? 'No records match these filters.' : 'No attendance recorded in the selected date range.'}</p></div> : <div className="attendance-workspace">
        <div className="attendance-roster">
          <div className="table-wrapper"><table className="table attendance-roster-table"><thead><tr><th>Staff Member</th><th>Check In / Out</th><th>Punched Location</th><th>Status</th></tr></thead><tbody>{visible.map(row => <tr key={row.attendance_id} className={selected?.attendance_id === row.attendance_id ? 'is-selected' : ''}>
            <td><button className="attendance-person" aria-label={`Inspect ${row.staff_name || row.staff_id} on ${formatDate(row.date)}`} aria-pressed={selected?.attendance_id === row.attendance_id} onClick={() => setSelectedId(row.attendance_id)}><span className="attendance-avatar">{initials(row.staff_name || row.staff_id)}</span><span><strong>{row.staff_name || row.staff_id}</strong><small>{row.staff_id}</small><small>{formatDate(row.date)}</small></span></button></td>
            <td><span className="attendance-punch"><LogIn size={14} />{time(row.checkin_time)}</span><small>{row.checkout_time ? `Out: ${time(row.checkout_time)}` : 'Out: Not recorded'}</small></td>
            <td><Location row={row} prefix="checkin" /></td>
            <td><span className={`attendance-status ${row.is_checked_out ? 'is-out' : ''}`}>{row.is_checked_out ? 'Checked Out' : 'Active'}</span><small><Camera size={12} />{row.checkin_photo_url ? 'Photo recorded' : 'No photo'}</small></td>
          </tr>)}</tbody></table></div>
          <div className="attendance-pagination"><span>{(page - 1) * 10 + 1}-{Math.min(page * 10, filtered.length)} of {filtered.length}</span><div><button className="btn-icon" aria-label="Previous attendance page" disabled={page === 1} onClick={() => jump(page - 1)}><ChevronLeft size={18} /></button><label>Page <select aria-label="Attendance page" value={page} onChange={event => jump(Number(event.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select> of {pages}</label><button className="btn-icon" aria-label="Next attendance page" disabled={page === pages} onClick={() => jump(page + 1)}><ChevronRight size={18} /></button></div></div>
        </div>
        {selected && <aside className="attendance-inspector" aria-label="Punch inspector">
          <div className="attendance-inspector-heading"><span>PUNCH INSPECTOR</span><span className={`attendance-status ${selected.is_checked_out ? 'is-out' : ''}`}>{selected.is_checked_out ? 'Checked Out' : 'Active'}</span></div>
          <div className="attendance-profile"><span className="attendance-avatar">{initials(selected.staff_name || selected.staff_id)}</span><div><h3>{selected.staff_name || selected.staff_id}</h3><p>{selected.staff_id}</p><small>{formatDate(selected.date)}</small></div></div>
          <div className="attendance-times"><div><span><LogIn size={15} />Punch In</span><strong>{time(selected.checkin_time)}</strong><small>IST</small></div><div><span><LogOut size={15} />Punch Out</span><strong>{time(selected.checkout_time)}</strong><small>{selected.checkout_time ? 'IST' : 'Not recorded'}</small></div></div>
          <section><h4><MapPin size={16} />Punch Locations</h4><div className="attendance-location"><small>CHECK IN</small><Location row={selected} prefix="checkin" /><small>CHECK OUT</small><Location row={selected} prefix="checkout" /></div></section>
          <section><h4><Camera size={16} />Attendance Photos</h4><div className="attendance-photos">{[['checkin_photo_url', 'Check-in photo'], ['checkout_photo_url', 'Check-out photo']].map(([field, label]) => <div key={field}>{selected[field] ? <button aria-label={`Open ${label.toLowerCase()}`} title={`Open ${label.toLowerCase()}`} onClick={() => onPhoto(selected[field])}><img src={selected[field]} alt={label} /><span>{label}<ExternalLink size={13} /></span></button> : <div className="attendance-no-photo"><Camera size={24} /><span>{label}</span><small>Not recorded</small></div>}</div>)}</div></section>
          <section><h4><Clock3 size={16} />Remarks</h4><dl className="attendance-remarks"><dt>Check in</dt><dd>{selected.remarks || 'No remarks'}</dd><dt>Check out</dt><dd>{selected.checkout_remarks || 'No remarks'}</dd></dl></section>
          <small className="attendance-record-id">Record: {selected.attendance_id}</small>
        </aside>}
      </div>}
      <footer className="attendance-bottom-summary"><div><LogIn size={22} /><span><strong>{active} Active</strong><small>In the filtered records</small></span></div><div><LogOut size={22} /><span><strong>{filtered.length - active} Checked Out</strong><small>Recorded checkout</small></span></div><div><Camera size={22} /><span><strong>{photoCount} With Photos</strong><small>Check-in photos available</small></span></div></footer>
    </>}
  </>;
}
