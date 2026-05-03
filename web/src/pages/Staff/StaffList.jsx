import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffApi } from '../../api';
import { MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';

export default function StaffList() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = () => staffApi.list().then(r => { setStaff(r.data); setLoading(false); });
  useEffect(() => { fetchStaff(); }, []);

  const deleteStaff = async (id) => {
    if (!confirm('Delete this staff member?')) return;
    await staffApi.delete(id);
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
          <h2>Staff / Technicians</h2>
          <p>{staff.filter(s => s.is_active).length} active technicians</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/staff/new')}><MdAdd /> Add Staff</button>
      </div>

      {loading ? <div className="loading-center"><div className="spinner" /></div> : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Staff ID</th><th>Name</th><th>Phone</th><th>Skill</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.staff_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-accent)' }}>{s.staff_id}</td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span>{s.phone_number}</span>
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/staff/${s.staff_id}`)}><MdEdit /> Edit</button>
                      {s.is_active && <button className="btn btn-danger btn-sm" onClick={() => deleteStaff(s.staff_id)}><MdDelete /> Delete</button>}
                    </div>
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
