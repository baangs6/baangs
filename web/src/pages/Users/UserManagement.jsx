import { useEffect, useState } from 'react';
import { usersApi, staffApi } from '../../api';
import { MdAdd, MdPersonOff, MdPerson, MdKey, MdDelete } from 'react-icons/md';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ username: '', password: '', full_name: '', phone: '', role: 'technician', staff_id: '' });

  const fetchUsers = async () => {
    const [uRes, sRes] = await Promise.all([usersApi.list(), staffApi.list()]);
    setUsers(uRes.data);
    setStaff(sRes.data);
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;

    const loadUsers = async () => {
      const [uRes, sRes] = await Promise.all([usersApi.list(), staffApi.list()]);
      if (ignore) return;
      setUsers(uRes.data);
      setStaff(sRes.data);
      setLoading(false);
    };

    loadUsers().catch((error) => {
      if (!ignore) {
        setError(error.response?.data?.detail || 'Error loading users');
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  const createUser = async () => {
    setSaving(true); setError('');
    try {
      await usersApi.create(form);
      await fetchUsers();
      setShowModal(false);
      setForm({ username: '', password: '', full_name: '', phone: '', role: 'technician', staff_id: '' });
    } catch (e) { setError(e.response?.data?.detail || 'Error creating user'); }
    setSaving(false);
  };

  const toggleStatus = async (user) => {
    if (user.status === 'active') await usersApi.deactivate(user.user_id);
    else await usersApi.activate(user.user_id);
    await fetchUsers();
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true);
    try {
      await usersApi.resetPassword(showResetModal.user_id, newPassword);
      setShowResetModal(null); setNewPassword('');
    } catch (e) { setError(e.response?.data?.detail || 'Error'); }
    setSaving(false);
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    try {
      await usersApi.delete(deleteTarget.user_id);
      await fetchUsers();
      setDeleteTarget(null);
    } catch (e) {
      setError(e.response?.data?.detail || 'Error deleting user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>User Management</h2>
          <p>Manage who has access to the system</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><MdAdd /> Add User</button>
      </div>

      {loading ? <div className="loading-center"><div className="spinner" /></div> : (
        <div className="table-wrapper">
          {error && <div className="toast toast-error" style={{ margin: 12 }}>⚠️ {error}</div>}
          <table className="table">
            <thead>
              <tr><th>Username</th><th>Full Name</th><th>Role</th><th>Linked Staff</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const linkedStaff = staff.find(s => s.staff_id === u.staff_id);
                return (
                  <tr key={u.user_id}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.full_name || '—'}</td>
                    <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{linkedStaff?.name || '—'}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{u.phone || '—'}</td>
                    <td><span className={`badge badge-${u.status}`}>{u.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className={`btn btn-sm ${u.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => toggleStatus(u)} title={u.status === 'active' ? 'Deactivate' : 'Activate'}>
                          {u.status === 'active' ? <MdPersonOff /> : <MdPerson />}
                          {u.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowResetModal(u); setNewPassword(''); setError(''); }}>
                          <MdKey /> Reset PW
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => { setDeleteTarget(u); setError(''); }} disabled={saving}>
                          <MdDelete /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Delete User</h3>
              <button className="btn-icon" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
              <p style={{ margin: 0 }}>
                Delete user <strong>{deleteTarget.username}</strong> permanently?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={deleteUser} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add New User</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[['Full Name', 'full_name', 'text', 'John Doe'], ['Username', 'username', 'text', 'john.doe'],
                  ['Phone', 'phone', 'text', '+91 98765 43210'], ['Password', 'password', 'password', 'Min 6 chars']].map(([label, key, type, ph]) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{label}</label>
                    <input className="form-input" type={type} placeholder={ph} value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="admin">Admin / Dispatcher</option>
                    <option value="technician">Technician</option>
                    <option value="manager">Manager / Viewer</option>
                  </select>
                </div>
                {form.role === 'technician' && (
                  <div className="form-group">
                    <label className="form-label">Link to Staff Record (optional)</label>
                    <select className="form-select" value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                      <option value="">None</option>
                      {staff.filter(s => s.is_active).map(s => <option key={s.staff_id} value={s.staff_id}>{s.name} — {s.skill}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createUser} disabled={saving}>
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={() => setShowResetModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reset Password — {showResetModal.username}</h3>
              <button className="btn-icon" onClick={() => setShowResetModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" placeholder="Min 6 characters" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowResetModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={resetPassword} disabled={saving}>
                {saving ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
