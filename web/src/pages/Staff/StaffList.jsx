import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffApi, usersApi } from '../../api';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';

export default function StaffList() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = async () => {
    try {
      const [sRes, uRes] = await Promise.all([staffApi.list(), usersApi.list()]);
      setStaff(sRes.data);
      setUsers(uRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchStaff(); }, []);

  const deleteStaff = async (id) => {
    if (!confirm('Delete this staff member permanently? Linked login will also be deleted.')) return;
    await staffApi.delete(id);
    await fetchStaff();
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user permanently?')) return;
    await usersApi.delete(id);
    await fetchStaff();
  };

  const getWhatsAppLink = (phone) => {
    if (!phone) return null;
    const clean = String(phone).replace(/\D/g, '');
    if (!clean) return null;
    return `https://wa.me/${clean}`;
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Staff / Technicians & Users</h2>
          <p>{staff.filter(s => s.is_active).length} active technicians</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/staff/new')}><MdAdd /> Add Staff</button>
      </div>

      {loading ? <div className="loading-center"><div className="spinner" /></div> : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Phone</th><th>Skill / Role</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {[
                ...staff.map(s => ({ ...s, is_user: false })),
                ...users
                  .filter(u => ['admin', 'sales'].includes(u.role) && !staff.some(s => s.staff_id === u.staff_id))
                  .map(u => ({
                    staff_id: u.user_id,
                    user_id: u.user_id,
                    name: u.full_name || u.username,
                    phone_number: u.phone,
                    skill: u.role.toUpperCase(),
                    is_active: u.status === 'active',
                    is_user: true
                  }))
              ].map(s => (
                <tr key={s.staff_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-accent)' }}>{s.staff_id}</td>
                  <td style={{ fontWeight: 600 }}>{s.name} {s.is_user && <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 4 }}>(User)</span>}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span>{s.phone_number || '—'}</span>
                      {getWhatsAppLink(s.phone_number) && (
                        <a
                          href={getWhatsAppLink(s.phone_number)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 8px' }}
                          aria-label="Open WhatsApp"
                          title="WhatsApp"
                        >
                          <FaWhatsapp />
                        </a>
                      )}
                    </span>
                  </td>
                  <td>{s.skill || '—'}</td>
                  <td><span className={`badge badge-${s.is_active ? 'active' : 'inactive'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    {s.is_user ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/users')}>Manage User</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteUser(s.user_id)}><MdDelete /> Delete</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/staff/${s.staff_id}`)}><MdEdit /> Edit</button>
                        {s.is_active && <button className="btn btn-danger btn-sm" onClick={() => deleteStaff(s.staff_id)}><MdDelete /> Delete</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
