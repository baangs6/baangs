import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { staffApi } from '../../api';
import { MdArrowBack } from 'react-icons/md';

const EMPTY_FORM = {
  name: '', phone_number: '', skill: '', dob: '', doj: '', email_id: '', address: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  salary_type: 'monthly', monthly_salary: 0, daily_wage: 0, overtime_rate_per_hour: 0, allowance: 0, deduction: 0,
  bank_account_holder: '', bank_account_number: '', bank_ifsc: '', pan_number: '', aadhaar_number: '',
  photo_url: '',
  create_login: false, username: '', password: ''
};

export default function StaffFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { staffId } = useParams();
  const isNew = !staffId || location.pathname.endsWith('/staff/new') || staffId === 'new';

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');

  const getErrMsg = (e, fallback) => {
    const detail = e?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (detail && typeof detail === 'object') {
      if (typeof detail.message === 'string') return detail.message;
      if (typeof detail.error?.message === 'string') return detail.error.message;
      return JSON.stringify(detail);
    }
    if (typeof e?.message === 'string' && e.message.trim()) return e.message;
    return fallback;
  };

  useEffect(() => {
    if (isNew) return;
    staffApi.get(staffId).then((res) => {
      const s = res.data;
      setForm({
        ...EMPTY_FORM,
        ...s,
        monthly_salary: Number(s.monthly_salary || 0),
        daily_wage: Number(s.daily_wage || 0),
        overtime_rate_per_hour: Number(s.overtime_rate_per_hour || 0),
        allowance: Number(s.allowance || 0),
        deduction: Number(s.deduction || 0),
      });
      setPhotoPreview(s.photo_url || '');
      setLoading(false);
    }).catch((e) => {
      setError(e.response?.data?.detail || 'Failed to load staff details');
      setLoading(false);
    });
  }, [isNew, staffId]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      let savedStaffId = staffId;
      if (isNew) {
        const created = await staffApi.create(form);
        savedStaffId = created.data.staff_id;
      } else {
        await staffApi.update(staffId, form);
      }
      if (photoFile && savedStaffId) {
        try {
          const up = await staffApi.uploadPhoto(savedStaffId, photoFile);
          setPhotoPreview(up.data.photo_url || '');
        } catch (photoErr) {
          setError(`Staff details saved, but photo upload failed: ${getErrMsg(photoErr, 'Photo upload failed')}`);
          setSaving(false);
          return;
        }
      }
      navigate('/staff');
    } catch (e) {
      setError(getErrMsg(e, 'Failed to save staff'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="animate-fade" style={{ maxWidth: 980 }}>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/staff')} style={{ marginBottom: 16 }}>
        <MdArrowBack /> Back to Staff
      </button>

      <div className="page-header">
        <div className="page-header-left">
          <h2>{isNew ? 'Add Staff' : 'Update Staff Details'}</h2>
          <p>Complete profile for operations and payroll calculation</p>
        </div>
      </div>

      {error && <div className="toast toast-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 12 }}>Photo</h3>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
          {photoPreview ? (
            <img src={photoPreview} alt="Staff" style={{ width: 84, height: 84, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--color-border)' }} />
          ) : (
            <div style={{ width: 84, height: 84, borderRadius: 8, border: '1px dashed var(--color-border)', display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)' }}>
              No Photo
            </div>
          )}
          <div>
            <input
              type="file"
              accept="image/*"
              className="form-input"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setPhotoFile(file);
                if (file) {
                  setPhotoPreview(URL.createObjectURL(file));
                }
              }}
            />
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 6 }}>Select a profile photo</div>
          </div>
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input className="form-input" value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Skill</label>
            <input className="form-input" value={form.skill || ''} onChange={e => setForm(f => ({ ...f, skill: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" value={form.email_id || ''} onChange={e => setForm(f => ({ ...f, email_id: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input type="date" className="form-input" value={form.dob || ''} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Joining</label>
            <input type="date" className="form-input" value={form.doj || ''} onChange={e => setForm(f => ({ ...f, doj: e.target.value }))} />
          </div>
          <div className="form-group form-full">
            <label className="form-label">Address</label>
            <textarea className="form-textarea" rows={2} value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="card-title" style={{ marginBottom: 12 }}>Emergency Contact</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Contact Name</label>
            <input className="form-input" value={form.emergency_contact_name || ''} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Phone</label>
            <input className="form-input" value={form.emergency_contact_phone || ''} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="card-title" style={{ marginBottom: 12 }}>Payroll Details</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Salary Type</label>
            <select className="form-select" value={form.salary_type || 'monthly'} onChange={e => setForm(f => ({ ...f, salary_type: e.target.value }))}>
              <option value="monthly">Monthly</option>
              <option value="daily">Daily Wage</option>
            </select>
          </div>
          {form.salary_type === 'daily' ? (
            <div className="form-group">
              <label className="form-label">Daily Wage</label>
              <input type="number" className="form-input" value={form.daily_wage || 0} onChange={e => setForm(f => ({ ...f, daily_wage: Number(e.target.value) || 0 }))} />
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Monthly Salary</label>
              <input type="number" className="form-input" value={form.monthly_salary || 0} onChange={e => setForm(f => ({ ...f, monthly_salary: Number(e.target.value) || 0 }))} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Overtime Rate / Hour</label>
            <input type="number" className="form-input" value={form.overtime_rate_per_hour || 0} onChange={e => setForm(f => ({ ...f, overtime_rate_per_hour: Number(e.target.value) || 0 }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Allowance</label>
            <input type="number" className="form-input" value={form.allowance || 0} onChange={e => setForm(f => ({ ...f, allowance: Number(e.target.value) || 0 }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Deduction</label>
            <input type="number" className="form-input" value={form.deduction || 0} onChange={e => setForm(f => ({ ...f, deduction: Number(e.target.value) || 0 }))} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 className="card-title" style={{ marginBottom: 12 }}>Bank & Compliance</h3>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Account Holder</label><input className="form-input" value={form.bank_account_holder || ''} onChange={e => setForm(f => ({ ...f, bank_account_holder: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Account Number</label><input className="form-input" value={form.bank_account_number || ''} onChange={e => setForm(f => ({ ...f, bank_account_number: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">IFSC</label><input className="form-input" value={form.bank_ifsc || ''} onChange={e => setForm(f => ({ ...f, bank_ifsc: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">PAN</label><input className="form-input" value={form.pan_number || ''} onChange={e => setForm(f => ({ ...f, pan_number: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Aadhaar</label><input className="form-input" value={form.aadhaar_number || ''} onChange={e => setForm(f => ({ ...f, aadhaar_number: e.target.value }))} /></div>
        </div>
      </div>

      {isNew && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="card-title" style={{ marginBottom: 12 }}>Mobile Login</h3>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={form.create_login || false} onChange={e => setForm(f => ({ ...f, create_login: e.target.checked }))} />
              <span>Create Mobile Login Credentials</span>
            </label>
          </div>
          {form.create_login && (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" value={form.username || ''} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" value={form.password || ''} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/staff')}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Details'}</button>
      </div>
    </div>
  );
}
