import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsApi, staffApi, lookupsApi, customersApi } from '../../api';
import { MdArrowBack, MdUpload, MdClose, MdExpandMore } from 'react-icons/md';

// ── Multi-select technician picker ──────────────────────────────────────────
function TechnicianPicker({ staff, primaryId, additionalIds, onChangePrimary, onChangeAdditional }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeStaff = staff.filter(s => s.is_active);
  const allSelected = [primaryId, ...additionalIds].filter(Boolean);

  const toggleAdditional = (id) => {
    if (id === primaryId) return; // can't add primary as additional
    if (additionalIds.includes(id)) {
      onChangeAdditional(additionalIds.filter(x => x !== id));
    } else {
      onChangeAdditional([...additionalIds, id]);
    }
  };

  const getLabel = (id) => {
    const s = activeStaff.find(x => x.staff_id === id);
    return s ? `${s.name} (${s.skill || 'General'})` : id;
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Primary technician */}
      <div style={{ marginBottom: 8 }}>
        <label className="form-label" style={{ marginBottom: 4 }}>Primary Technician *</label>
        <select
          className="form-select"
          value={primaryId}
          onChange={e => {
            const newPrimary = e.target.value;
            onChangePrimary(newPrimary);
            // remove new primary from additional if it was there
            onChangeAdditional(additionalIds.filter(x => x !== newPrimary));
          }}
          required
        >
          <option value="">Select Technician</option>
          {activeStaff.map(s => (
            <option key={s.staff_id} value={s.staff_id}>
              {s.name} ({s.skill || 'General'})
            </option>
          ))}
        </select>
      </div>

      {/* Additional technicians */}
      <div>
        <label className="form-label" style={{ marginBottom: 4 }}>
          Additional Technicians
          {additionalIds.length > 0 && (
            <span style={{ marginLeft: 8, background: '#2563eb', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: '0.75rem' }}>
              +{additionalIds.length}
            </span>
          )}
        </label>

        {/* Selected additional tags */}
        {additionalIds.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {additionalIds.map(id => (
              <span key={id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)',
                borderRadius: 20, padding: '3px 10px', fontSize: '0.8rem', color: '#1d4ed8'
              }}>
                {getLabel(id)}
                <MdClose
                  style={{ cursor: 'pointer', fontSize: '0.9rem' }}
                  onClick={() => onChangeAdditional(additionalIds.filter(x => x !== id))}
                />
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8,
            background: 'var(--color-surface)', cursor: 'pointer', fontSize: '0.875rem',
            color: 'var(--color-text-muted)'
          }}
        >
          <span>{additionalIds.length === 0 ? 'Add more technicians...' : `${additionalIds.length} additional selected`}</span>
          <MdExpandMore style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', zIndex: 200, left: 0, right: 0,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            maxHeight: 220, overflowY: 'auto', marginTop: 4
          }}>
            {activeStaff.filter(s => s.staff_id !== primaryId).map(s => {
              const checked = additionalIds.includes(s.staff_id);
              return (
                <label key={s.staff_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', cursor: 'pointer',
                  background: checked ? 'rgba(37,99,235,0.06)' : 'transparent',
                  borderBottom: '1px solid var(--color-border)',
                  transition: 'background 0.15s'
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAdditional(s.staff_id)}
                    style={{ accentColor: '#2563eb', width: 16, height: 16 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.skill || 'General'}</div>
                  </div>
                </label>
              );
            })}
            {activeStaff.filter(s => s.staff_id !== primaryId).length === 0 && (
              <div style={{ padding: 14, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No other active technicians</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function JobCreate() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [lookups, setLookups] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(null);
  const [form, setForm] = useState({
    customer_name: '', phone_number: '', location: '', map_location: '', site_type: '',
    work_type: '', complaint: '', priority: 'medium',
    scheduled_date: '', preferred_time: '', assigned_staff_id: '',
    additional_staff_ids: [],
    next_schedule_date: '',
  });

  useEffect(() => {
    staffApi.list().then(r => setStaff(r.data)).catch(console.error);
    lookupsApi.all().then(r => setLookups(r.data)).catch(console.error);
    customersApi.list().then(r => setCustomers(r.data)).catch(console.error);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCustomerChange = (val) => {
    set('customer_name', val);
    const existing = customers.find(c => c.customer_name.toLowerCase() === val.toLowerCase());
    if (existing) {
      setForm(f => ({
        ...f,
        customer_name: existing.customer_name,
        phone_number: existing.phone_number || f.phone_number,
        location: existing.location || f.location,
        map_location: existing.map_location || f.map_location,
        site_type: existing.site_type || f.site_type,
      }));
    }
  };

  const handlePhoneChange = (val) => {
    set('phone_number', val);
    const existing = customers.find(c => c.phone_number === val);
    if (existing) {
      setForm(f => ({
        ...f,
        customer_name: existing.customer_name || f.customer_name,
        phone_number: existing.phone_number,
        location: existing.location || f.location,
        map_location: existing.map_location || f.map_location,
        site_type: existing.site_type || f.site_type,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await jobsApi.create(form);
      const jobId = res.data.job_id;
      if (photo) {
        await jobsApi.uploadPhoto(jobId, photo);
      }
      navigate(`/jobs/${jobId}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade" style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/jobs')} style={{ marginBottom: 8 }}>
            <MdArrowBack /> Back
          </button>
          <h2>Create New Job</h2>
          <p>Fill in the service request details</p>
        </div>
      </div>

      {error && <div className="toast toast-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Customer Section */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3 className="card-title">👤 Customer Details</h3></div>
          <div className="form-grid">
            <datalist id="customer-names">
              {customers.map(c => <option key={c.customer_id} value={c.customer_name} />)}
            </datalist>
            <datalist id="customer-phones">
              {customers.map(c => <option key={c.customer_id} value={c.phone_number} />)}
            </datalist>
            <div className="form-group">
              <label className="form-label">Customer Name *</label>
              <input className="form-input" list="customer-names" value={form.customer_name} onChange={e => handleCustomerChange(e.target.value)} required placeholder="Full name" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input className="form-input" list="customer-phones" value={form.phone_number} onChange={e => handlePhoneChange(e.target.value)} required placeholder="+91 98765 43210" />
            </div>
            <div className="form-group">
              <label className="form-label">Location / Address</label>
              <input className="form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Site address" />
            </div>
            <div className="form-group">
              <label className="form-label">Map Location</label>
              <input className="form-input" value={form.map_location} onChange={e => set('map_location', e.target.value)} placeholder="Google Maps URL or coordinates" />
            </div>
            <div className="form-group">
              <label className="form-label">Site Type</label>
              <select className="form-select" value={form.site_type} onChange={e => set('site_type', e.target.value)}>
                <option value="">Select site type</option>
                <option value="Home">Home</option>
                <option value="Office">Office</option>
                <option value="Shop">Shop</option>
                <option value="Land">Land</option>
              </select>
            </div>
          </div>
        </div>

        {/* Job Section */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3 className="card-title">🔧 Job Details</h3></div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Work Type *</label>
              <select className="form-select" value={form.work_type} onChange={e => set('work_type', e.target.value)} required>
                <option value="">Select work type</option>
                {(lookups.service_types || []).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {(lookups.priority_levels || []).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Scheduled Date</label>
              <input className="form-input" type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Preferred Time</label>
              <input className="form-input" type="time" value={form.preferred_time} onChange={e => set('preferred_time', e.target.value)} />
            </div>
            <div className="form-group form-full">
              <TechnicianPicker
                staff={staff}
                primaryId={form.assigned_staff_id}
                additionalIds={form.additional_staff_ids}
                onChangePrimary={v => set('assigned_staff_id', v)}
                onChangeAdditional={v => set('additional_staff_ids', v)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Next Schedule Date</label>
              <input className="form-input" type="date" value={form.next_schedule_date} onChange={e => set('next_schedule_date', e.target.value)} />
            </div>
            <div className="form-group form-full">
              <label className="form-label">Complaint / Description</label>
              <textarea className="form-textarea" value={form.complaint} onChange={e => set('complaint', e.target.value)} placeholder="Describe the issue or service required..." rows={3} />
            </div>
          </div>
        </div>

        {/* Photo */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">📷 Job Photo (optional)</h3></div>
          <div className="form-group">
            <input type="file" accept="image/*" className="form-input" onChange={e => setPhoto(e.target.files[0])} />
            {photo && <p style={{ fontSize: '0.8rem', color: 'var(--color-success)' }}>✓ {photo.name}</p>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/jobs')}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <><div className="spinner" style={{ width: 16, height: 16 }} />Creating...</> : '✅ Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
}
