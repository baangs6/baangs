import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicApi } from '../api';
import { MdPhone, MdPerson, MdLocationOn, MdBuild, MdDescription, MdCheckCircle, MdSearch, MdCloudUpload } from 'react-icons/md';

export default function PublicComplaintPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [lookupDone, setLookupDone] = useState(false);
  const [existingCustomer, setExistingCustomer] = useState(null);
  const [form, setForm] = useState({
    customer_name: '',
    location: '',
    site_type: 'Residence',
    work_type: 'complaint',
    complaint: '',
    priority: 'medium',
    photo_url: '',
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdResult, setCreatedResult] = useState(null);

  const handlePhoneLookup = async (phoneNumber) => {
    const cleanPhone = phoneNumber.trim();
    if (!cleanPhone || cleanPhone.length < 10) return;
    try {
      const res = await publicApi.lookupCustomer(cleanPhone);
      if (res.data?.found) {
        setExistingCustomer(res.data);
        setForm((prev) => ({
          ...prev,
          customer_name: res.data.customer_name || prev.customer_name,
          location: res.data.location || prev.location,
          site_type: res.data.site_type || prev.site_type,
        }));
      } else {
        setExistingCustomer(null);
      }
    } catch (err) {
      console.error('Lookup failed', err);
    } finally {
      setLookupDone(true);
    }
  };

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setPhone(val);
    setLookupDone(false);
    if (val.length === 10) {
      handlePhoneLookup(val);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setUploading(true);
    try {
      const res = await publicApi.uploadPhoto(file);
      if (res.data?.photo_url) {
        setForm((prev) => ({ ...prev, photo_url: res.data.photo_url }));
      }
    } catch (err) {
      console.error(err);
      setError('Photo upload failed. You can still submit without photo.');
    } finally {
      setUploading(false);
    }
  };

  const useCurrentLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Location is not supported on this phone/browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locationText = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        setForm((prev) => ({ ...prev, location: locationText }));
        setLocating(false);
      },
      () => {
        setError('Unable to get current location. Please allow location permission or type your address.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!phone || phone.trim().length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!form.customer_name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!form.complaint.trim()) {
      setError('Please describe your issue or service request.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        phone_number: phone.trim(),
        customer_name: form.customer_name.trim(),
        location: form.location.trim(),
        site_type: form.site_type,
        work_type: form.work_type,
        complaint: form.complaint.trim(),
        priority: form.priority,
        photo_url: form.photo_url,
      };
      const res = await publicApi.registerComplaint(payload);
      if (res.data?.success) {
        setCreatedResult(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to register complaint. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="public-complaint-page">
      <div className="public-complaint-bg-grid" />
      <div className="public-complaint-orbit public-complaint-orbit-a" />
      <div className="public-complaint-orbit public-complaint-orbit-b" />

      <div className="public-complaint-shell">
        <section className="public-complaint-hero">
          <img className="public-complaint-logo" src="/baangs-logo.png" alt="BAANGS" />
          <p className="public-complaint-kicker">CCTV Field Service</p>
          <h1>Register your service complaint</h1>
          <p>Share your issue, attach a photo, and send your exact site location. Our team will create a ticket and follow up.</p>
          <div className="public-complaint-visual" aria-hidden="true">
            <div className="public-cube"><span /><span /><span /></div>
            <div className="public-visual-card public-visual-card-one">Camera offline</div>
            <div className="public-visual-card public-visual-card-two">Technician assigned</div>
          </div>
        </section>

        {createdResult ? (
          <div className="public-complaint-card public-success-card">
            <div style={{ color: 'var(--color-success)', fontSize: '3.5rem', marginBottom: 16 }}>
              <MdCheckCircle />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Complaint Registered!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              Your service ticket has been created. Our team will contact you shortly.
            </p>

            <div style={{ background: 'var(--bg-secondary)', padding: 20, borderRadius: 12, marginBottom: 24 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Ticket ID
              </span>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: 4 }}>
                {createdResult.job_id}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                Name: <strong>{createdResult.customer_name}</strong> | Phone: <strong>{createdResult.phone_number}</strong>
              </div>
            </div>

            <div className="public-complaint-actions">
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/track/${createdResult.job_id}`)}
                style={{ padding: '10px 24px' }}
              >
                🔍 Track Live Ticket Status
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setCreatedResult(null);
                  setPhone('');
                  setForm({
                    customer_name: '',
                    location: '',
                    site_type: 'Residence',
                    work_type: 'complaint',
                    complaint: '',
                    priority: 'medium',
                    photo_url: '',
                  });
                }}
              >
                Submit Another Request
              </button>
            </div>
          </div>
        ) : (
          <div className="public-complaint-card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdBuild style={{ color: 'var(--color-primary)' }} /> Register Service Complaint
            </h2>

            {error && <div className="toast toast-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="public-form-stack">
                {/* Phone Number Input */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MdPhone style={{ color: 'var(--color-primary)' }} /> Mobile Phone Number *
                  </label>
                  <div className="public-inline-field">
                    <input
                      className="form-input"
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={handlePhoneChange}
                      required
                      maxLength={12}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handlePhoneLookup(phone)}
                    >
                      <MdSearch /> Lookup
                    </button>
                  </div>
                  {existingCustomer && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MdCheckCircle /> Existing customer found! Details auto-filled below.
                    </div>
                  )}
                </div>

                {/* Customer Name */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MdPerson style={{ color: 'var(--color-primary)' }} /> Your Name *
                  </label>
                  <input
                    className="form-input"
                    placeholder="Enter your full name"
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    required
                  />
                </div>

                {/* Location / Address */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MdLocationOn style={{ color: 'var(--color-primary)' }} /> Address / Location *
                  </label>
                  <div className="public-location-row">
                    <input
                      className="form-input"
                      placeholder="e.g. MG Road, Kochi or GPS coordinates"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      required
                    />
                    <button type="button" className="btn btn-secondary" onClick={useCurrentLocation} disabled={locating}>
                      <MdLocationOn /> {locating ? 'Getting...' : 'Use Current Location'}
                    </button>
                  </div>
                </div>

                {/* Site Type & Work Type */}
                <div className="public-form-grid">
                  <div className="form-group">
                    <label className="form-label">Site Type</label>
                    <select
                      className="form-select"
                      value={form.site_type}
                      onChange={(e) => setForm({ ...form, site_type: e.target.value })}
                    >
                      <option value="Residence">Residence</option>
                      <option value="Office">Office</option>
                      <option value="Commercial">Commercial / Shop</option>
                      <option value="Industrial">Industrial</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Service Type</label>
                    <select
                      className="form-select"
                      value={form.work_type}
                      onChange={(e) => setForm({ ...form, work_type: e.target.value })}
                    >
                      <option value="complaint">Complaint / Repair</option>
                      <option value="installation">New Installation</option>
                      <option value="maintenance">Maintenance Check</option>
                    </select>
                  </div>
                </div>

                {/* Complaint Description */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MdDescription style={{ color: 'var(--color-primary)' }} /> Complaint Details / Issue Description *
                  </label>
                  <textarea
                    className="form-input"
                    rows={4}
                    placeholder="Describe the issue (e.g. CCTV Camera 2 display flickering, no video recorded since morning)..."
                    value={form.complaint}
                    onChange={(e) => setForm({ ...form, complaint: e.target.value })}
                    required
                  />
                </div>

                {/* Optional Photo Attachment */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MdCloudUpload style={{ color: 'var(--color-primary)' }} /> Upload Photo of Issue (Optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    className="form-input"
                    onChange={handlePhotoUpload}
                  />
                  {uploading && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>Uploading photo...</div>}
                  {form.photo_url && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', marginTop: 4 }}>
                      ✅ Photo attached successfully
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ width: '100%', padding: 12, marginTop: 8, fontSize: '1rem', fontWeight: 600 }}
                >
                  {submitting ? 'Submitting Complaint...' : '⚡ Submit Service Complaint'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="public-login-link">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/login')}
          >
            Staff / Admin Login
          </button>
        </div>
      </div>
    </div>
  );
}

