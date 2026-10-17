import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usersApi, staffApi } from '../../api';
import { AuthContext } from '../../context/auth-context';
import { formatDateTime } from '../../utils/dateFormat';
import { UserPlus, Search, ShieldCheck, Link2, Phone, MessageCircle, ChevronRight, ChevronLeft, Save, KeyRound, LogOut, UserRoundX, Trash2, History, X, RefreshCw, Check, Lock } from 'lucide-react';
import './UserManagement.css';

const roles = [['admin', 'Admin'], ['technician', 'Technician'], ['manager', 'Manager'], ['sales', 'Sales']];
const blank = { username: '', password: '', full_name: '', phone: '', role: 'technician', staff_id: '' };
const initials = name => String(name || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const message = (error, fallback) => typeof error.response?.data?.detail === 'string' ? error.response.data.detail : fallback;
const editable = user => ({ full_name: user.full_name || '', phone: user.phone || '', role: user.role, staff_id: user.staff_id || '' });

export default function UserManagement() {
  const auth = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name');
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [modalError, setModalError] = useState('');
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const dialog = useRef(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current; setLoading(true); setError('');
    try {
      const [u, s] = await Promise.all([usersApi.list(), staffApi.list()]);
      if (id === request.current) { setUsers(Array.isArray(u.data) ? u.data : []); setStaff(Array.isArray(s.data) ? s.data : []); }
    } catch (err) { if (id === request.current) setError(message(err, 'Unable to load accounts.')); }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  const invalidate = useCallback(() => { request.current++; }, []);
  useEffect(() => { load(); return invalidate; }, [load, invalidate]);
  useEffect(() => { if (modal) dialog.current?.showModal(); }, [modal]);
  const linked = user => staff.find(person => person.staff_id === user.staff_id);
  const filtered = users.filter(user => (role === 'all' || user.role === role) && (status === 'all' || user.status === status) && [user.username, user.full_name, user.phone, user.role, linked(user)?.name, user.staff_id].join(' ').toLowerCase().includes(search.toLowerCase().trim())).sort((a, b) => sort === 'linked' ? Number(!!b.staff_id) - Number(!!a.staff_id) || a.username.localeCompare(b.username) : a.username.localeCompare(b.username));
  const key = JSON.stringify([role, status, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const page = Math.min(pagination.key === key ? pagination.page : 1, pages);
  const visible = filtered.slice((page - 1) * 8, page * 8);
  const selected = visible.find(user => user.user_id === selectedId) || visible[0];
  const values = selected && draft?.id === selected.user_id ? draft.values : selected ? editable(selected) : null;
  const dirty = selected && JSON.stringify(values) !== JSON.stringify(editable(selected));
  const person = selected && linked(selected);
  const own = selected?.user_id === auth?.user?.user_id;
  const phone = String(selected?.phone || person?.phone_number || person?.phone || '').replace(/\D/g, '');
  const change = (field, value) => setDraft({ id: selected.user_id, values: { ...values, [field]: value } });
  const select = user => { if (saving || (dirty && !window.confirm('Discard unsaved account changes?'))) return; setSelectedId(user.user_id); setDraft(null); setNotice(''); };
  const open = type => { setModalError(''); setPassword(''); setConfirmPassword(''); setForm(blank); setModal(type); };
  const close = () => { if (!saving) { setModal(null); setPassword(''); setConfirmPassword(''); setForm(blank); } };
  const signOutIfOwn = id => {
    if (id === auth?.user?.user_id) { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.assign('/login'); }
  };
  const save = async event => {
    event.preventDefault(); if (saving || !selected) return;
    if (!window.confirm(`Save changes for ${selected.username}? Existing sessions will be signed out.`)) return;
    setSaving(true); setNotice('');
    try {
      const { data } = await usersApi.update(selected.user_id, { ...values, staff_id: values.staff_id || null });
      setUsers(old => old.map(user => user.user_id === selected.user_id ? data : user)); setDraft(null); setNotice('Account saved. Existing sessions revoked.'); signOutIfOwn(selected.user_id);
    } catch (err) { setNotice(message(err, 'Unable to save account. Your changes have been kept.')); }
    finally { setSaving(false); }
  };
  const submit = async event => {
    event.preventDefault(); if (saving) return;
    setModalError('');
    if (modal === 'reset' && password !== confirmPassword) { setModalError('Passwords do not match.'); return; }
    const secret = modal === 'create' ? form.password : password;
    if (['create', 'reset'].includes(modal) && (secret.length < 12 || new TextEncoder().encode(secret).length > 72)) { setModalError('Password must have at least 12 characters and at most 72 UTF-8 bytes.'); return; }
    setSaving(true);
    try {
      if (modal === 'create') {
        const { data } = await usersApi.create({ ...form, staff_id: form.staff_id || null });
        setUsers(old => [...old, data]); setSelectedId(data.user_id); setDraft(null); setSearch(data.username); setRole('all'); setStatus('all'); setNotice('User created.');
      } else if (modal === 'reset') { await usersApi.resetPassword(selected.user_id, password); setNotice('Password reset. Existing sessions revoked.'); signOutIfOwn(selected.user_id); }
      else if (modal === 'revoke') { await usersApi.revokeSessions(selected.user_id); setNotice('All existing sessions revoked.'); signOutIfOwn(selected.user_id); }
      else if (modal === 'delete') { await usersApi.delete(selected.user_id); setUsers(old => old.filter(user => user.user_id !== selected.user_id)); setSelectedId(null); setDraft(null); setNotice('User deleted.'); }
      else if (modal === 'status') {
        const nextStatus = selected.status === 'active' ? 'inactive' : 'active';
        await (nextStatus === 'active' ? usersApi.activate(selected.user_id) : usersApi.deactivate(selected.user_id));
        setUsers(old => old.map(user => user.user_id === selected.user_id ? { ...user, status: nextStatus } : user)); setNotice(`Account ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`);
      }
      setModal(null); setPassword(''); setConfirmPassword(''); setForm(blank);
    } catch (err) { setModalError(message(err, 'The action could not be completed. Refresh accounts before retrying.')); }
    finally { setSaving(false); }
  };
  const loadAudit = async () => {
    setAuditLoading(true); setModalError('');
    try { const { data } = await usersApi.auditLogs(); setAudit(Array.isArray(data) ? data : []); }
    catch (err) { setModalError(message(err, 'Unable to load audit history.')); }
    finally { setAuditLoading(false); }
  };
  const staffOptions = <><option value="">None</option>{staff.map(item => <option key={item.staff_id} value={item.staff_id}>{item.name || item.full_name || item.staff_id}{item.is_active === false ? ' (inactive)' : ''}</option>)}</>;
  const permissions = [ ['Manage users', values?.role === 'admin'], ['Create / edit customers', values?.role === 'admin'], ['View quotations and billing', ['admin', 'manager'].includes(values?.role)], ['Approve allowance payments', ['admin', 'manager'].includes(values?.role)] ];

  return <div className="users-console"><header className="users-header"><div><small>IDENTITY & ACCESS CONTROL</small><h1>User Management & Role Permissions</h1><p>Accounts, staff linking and role-based access</p></div><div><button className="btn btn-secondary" disabled={saving} onClick={() => { open('audit'); loadAudit(); }}><History size={17} />Audit Logs</button><button className="btn btn-primary" disabled={saving} onClick={() => open('create')}><UserPlus size={17} />Add User</button></div></header>
    {notice && <p className="users-notice" role="status">{notice}</p>}{error && <div className="users-error" role="alert">{error}<button className="btn btn-secondary" onClick={load}>Retry accounts</button></div>}
    {loading ? <div className="loading-center" role="status">Loading accounts...</div> : !error && <div className="users-workspace"><section className="users-list"><div className="users-filters"><label className="users-search"><Search size={18} /><input aria-label="Search users" placeholder="Search name, role, phone or username" value={search} onChange={event => setSearch(event.target.value)} /></label><span className="users-count">{users.filter(user => user.status === 'active').length} Accounts Active</span><div className="users-roles">{[['all', 'All'], ...roles].map(([value, label]) => <button key={value} aria-pressed={role === value} onClick={() => setRole(value)}>{label} ({value === 'all' ? users.length : users.filter(user => user.role === value).length})</button>)}</div><select className="form-select" aria-label="Account status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select className="form-select" aria-label="Sort users" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Username A-Z</option><option value="linked">Linked Staff First</option></select><button className="btn-icon" aria-label="Refresh accounts" title="Refresh accounts" disabled={saving} onClick={load}><RefreshCw size={16} /></button></div>
      {users.length >= 500 && <p>Showing up to 500 accounts.</p>}{!filtered.length ? <div className="users-empty">No users match these filters</div> : visible.map(user => <article className={`users-row ${selected?.user_id === user.user_id ? 'is-selected' : ''}`} key={user.user_id}><button aria-label={`Inspect user ${user.username}`} aria-pressed={selected?.user_id === user.user_id} disabled={saving} onClick={() => select(user)}><span className="users-avatar">{initials(user.full_name || user.username)}</span><div><div className="users-row-title"><strong>{user.username}</strong><span>({user.full_name || 'No name'})</span><span className="users-role-badge">{user.role}</span></div><div className="users-row-meta"><span><Link2 size={13} />Linked: {linked(user)?.name || linked(user)?.full_name || user.staff_id || 'None'}</span>{user.phone && <span><Phone size={13} />{user.phone}</span>}<span className={`users-status is-${user.status}`}>{user.status}</span></div></div><ChevronRight size={18} /></button></article>)}<div className="users-pagination"><span>{filtered.length ? `${(page - 1) * 8 + 1}-${Math.min(page * 8, filtered.length)}` : '0'} of {filtered.length} accounts</span><div><button className="btn-icon" aria-label="Previous users page" disabled={page === 1} onClick={() => setPagination({ key, page: page - 1 })}><ChevronLeft size={16} /></button><label>Page<select aria-label="Users page" value={page} onChange={event => setPagination({ key, page: Number(event.target.value) })}>{Array.from({ length: pages }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select>of {pages}</label><button className="btn-icon" aria-label="Next users page" disabled={page === pages} onClick={() => setPagination({ key, page: page + 1 })}><ChevronRight size={16} /></button></div></div></section>
      {selected && <aside className="users-inspector" aria-label="Account inspector"><header><span className="users-avatar">{initials(selected.full_name || selected.username)}</span><div><h2>{selected.full_name || selected.username}</h2><span>@{selected.username}</span><span className={`users-status is-${selected.status}`}>{selected.status}</span><small><Link2 size={14} />{person?.name || person?.full_name || selected.staff_id || 'No linked staff'}</small></div></header><form onSubmit={save}><fieldset disabled={saving}><legend>Contact & Account Details</legend><label>Full Name<input className="form-input" maxLength={150} value={values.full_name} onChange={event => change('full_name', event.target.value)} /></label><label>Phone<input className="form-input" type="tel" maxLength={30} value={values.phone} onChange={event => change('phone', event.target.value)} /></label><div className="users-contact-actions">{phone && <><a href={`tel:+${phone.length === 10 ? `91${phone}` : phone}`} className="btn btn-secondary"><Phone size={14} />Call</a><a href={`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}`} className="btn btn-secondary" target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a></>}</div><dl className="users-details"><dt>Account Created</dt><dd>{formatDateTime(selected.created_at)}</dd><dt>Account ID</dt><dd>{selected.user_id}</dd></dl><label>Role<select className="form-select" aria-label="Account role" disabled={own} value={values.role} onChange={event => change('role', event.target.value)}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Linked Staff<select className="form-select" value={values.staff_id} onChange={event => change('staff_id', event.target.value)}>{staffOptions}</select></label></fieldset><section className="users-permissions"><h3><ShieldCheck size={18} />Role Permissions{dirty && <small>Unsaved role preview</small>}</h3>{permissions.map(([label, allowed]) => <div key={label}><span>{label}</span><span className={allowed ? 'allowed' : 'restricted'}>{allowed ? <Check size={14} /> : <Lock size={14} />}{allowed ? 'Allowed' : 'Restricted'}</span></div>)}</section><div className="users-security"><KeyRound size={18} /><div><strong>Security & Sessions</strong><p>Account changes and password resets invalidate existing sessions.</p></div></div><div className="users-save"><button className="btn btn-primary" disabled={!dirty || saving}><Save size={16} />{saving ? 'Saving...' : 'Save Changes'}</button><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => open('reset')}><KeyRound size={16} />Reset Password</button></div></form><div className="users-danger"><button className="btn btn-secondary" disabled={saving} onClick={() => open('revoke')}><LogOut size={15} />Revoke Sessions</button><button className="btn btn-secondary" disabled={saving || own} onClick={() => open('status')}><UserRoundX size={15} />{selected.status === 'active' ? 'Deactivate Account' : 'Activate Account'}</button><button className="btn btn-secondary" disabled={saving || own} onClick={() => open('delete')}><Trash2 size={15} />Delete User</button></div></aside>}
    </div>}
    {modal && <dialog ref={dialog} className="users-dialog" aria-label={modal === 'audit' ? 'User audit logs' : modal === 'create' ? 'Add user' : 'Confirm account action'} onCancel={event => { if (saving) event.preventDefault(); else close(); }}><header><h2>{({ create: 'Add User', reset: 'Reset Password', revoke: 'Revoke Sessions', status: selected?.status === 'active' ? 'Deactivate Account' : 'Activate Account', delete: 'Delete User', audit: 'User Audit Logs' })[modal]}</h2><button className="btn-icon" aria-label="Close account dialog" disabled={saving} onClick={close}><X size={18} /></button></header>{modalError && <p role="alert" className="users-error">{modalError}</p>}{modal === 'audit' ? <><p>Latest 100 user-management events. History starts when this feature is enabled.</p>{auditLoading ? <p role="status">Loading audit history...</p> : audit.length ? <ol className="users-audit">{audit.map((entry, index) => <li key={index}><strong>{entry.action}</strong><span>{entry.actor || 'Unknown'} → {entry.target_id}</span><small>{formatDateTime(entry.created_at)}{entry.fields?.length ? ` | ${entry.fields.join(', ')}` : ''}</small></li>)}</ol> : !modalError && <p>No user-management events recorded yet</p>}<button className="btn btn-secondary" disabled={auditLoading} onClick={loadAudit}>Refresh audit logs</button></> : <form onSubmit={submit}><fieldset disabled={saving}>{modal === 'create' ? <>{[['Full Name', 'full_name', 'text'], ['Username', 'username', 'text'], ['Phone', 'phone', 'tel'], ['Password', 'password', 'password']].map(([label, field, type]) => <label key={field}>{label}<input className="form-input" type={type} required={['username', 'password'].includes(field)} minLength={field === 'password' ? 12 : field === 'username' ? 3 : undefined} maxLength={field === 'password' ? 72 : field === 'username' ? 50 : 150} autoComplete={field === 'password' ? 'new-password' : undefined} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} /></label>)}<label>Role<select className="form-select" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Link to Staff<select className="form-select" value={form.staff_id} onChange={event => setForm({ ...form, staff_id: event.target.value })}>{staffOptions}</select></label><small>Password: at least 12 characters, up to 72 UTF-8 bytes.</small></> : modal === 'reset' ? <><p>Reset the password for <strong>{selected?.username}</strong>? All existing sessions will be revoked.</p><label>New Password<input className="form-input" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /></label><label>Confirm Password<input className="form-input" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label></> : <p>{modal === 'delete' ? 'Permanently delete' : modal === 'revoke' ? 'Sign out all existing sessions for' : selected?.status === 'active' ? 'Deactivate and sign out' : 'Activate'} <strong>{selected?.username}</strong>?{own && ' You will need to sign in again.'}</p>}</fieldset><footer><button type="button" className="btn btn-secondary" disabled={saving} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : modal === 'create' ? 'Create User' : modal === 'reset' ? 'Reset Password' : 'Confirm'}</button></footer></form>}</dialog>}
  </div>;
}
