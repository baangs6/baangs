import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicApi } from '../api';
import { MdSearch, MdCheckCircle, MdSchedule, MdBuild, MdPerson, MdLocationOn, MdHome } from 'react-icons/md';

export default function PublicTrackPage() {
  const { job_id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(job_id || '');
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchJobStatus = async (idToSearch) => {
    const q = (idToSearch || query).trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setJob(null);
    try {
      const res = await publicApi.track(q);
      setJob(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || `No service ticket found for '${q}'`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (job_id) {
      fetchJobStatus(job_id);
    }
  }, [job_id]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      fetchJobStatus(query.trim());
    }
  };

  const getStageStep = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed') return 4;
    if (s === 'in_progress') return 3;
    if (s === 'assigned') return 2;
    return 1; // pending
  };

  const currentStep = job ? getStageStep(job.status) : 1;

  return (
    <div className="auth-page" style={{ minHeight: '100vh', padding: '32px 16px', background: 'var(--bg-primary)' }}>
      <div className="auth-bg-glow auth-bg-glow-1" />
      <div className="auth-bg-glow auth-bg-glow-2" />

      <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            🔍 Service Ticket Tracker
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Check the live progress of your service request or complaint.
          </p>
        </div>

        {/* Search Bar */}
        <div className="card" style={{ padding: 20, marginBottom: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12 }}>
            <input
              className="form-input"
              placeholder="Enter Ticket ID (e.g. JOB-20260725-001) or Phone Number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ px: 20 }}>
              <MdSearch /> {loading ? 'Searching...' : 'Track'}
            </button>
          </form>
        </div>

        {error && (
          <div className="toast toast-error" style={{ marginBottom: 24, textAlign: 'center' }}>
            ⚠️ {error}
          </div>
        )}

        {job && (
          <div className="card" style={{ padding: 28, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span className="badge badge-primary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  {job.work_type ? job.work_type.toUpperCase() : 'COMPLAINT'}
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 6, color: 'var(--text-primary)' }}>
                  {job.job_id}
                </h2>
              </div>
              <div
                className={`badge ${
                  job.status === 'completed'
                    ? 'badge-success'
                    : job.status === 'in_progress'
                    ? 'badge-warning'
                    : 'badge-secondary'
                }`}
                style={{ fontSize: '0.95rem', padding: '6px 14px', borderRadius: 20, fontWeight: 700 }}
              >
                {job.status ? job.status.replace('_', ' ').toUpperCase() : 'PENDING'}
              </div>
            </div>

            {/* Stepper / Timeline */}
            <div style={{ margin: '28px 0', background: 'var(--bg-secondary)', padding: 20, borderRadius: 12 }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
                Service Progress Timeline
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                {[
                  { step: 1, label: 'Received' },
                  { step: 2, label: 'Assigned' },
                  { step: 3, label: 'In Progress' },
                  { step: 4, label: 'Completed' },
                ].map((item) => {
                  const isPassed = currentStep >= item.step;
                  const isCurrent = currentStep === item.step;
                  return (
                    <div key={item.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          background: isCurrent
                            ? 'var(--color-primary)'
                            : isPassed
                            ? 'var(--color-success)'
                            : 'var(--bg-tertiary)',
                          color: isPassed || isCurrent ? '#fff' : 'var(--text-muted)',
                          marginBottom: 8,
                          transition: 'all 0.3s ease',
                        }}
                      >
                        {isPassed ? <MdCheckCircle /> : item.step}
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? 'var(--color-primary)' : 'var(--text-secondary)' }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ticket Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MdPerson style={{ color: 'var(--color-primary)', fontSize: '1.2rem' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Customer Name</div>
                  <div style={{ fontWeight: 600 }}>{job.customer_name}</div>
                </div>
              </div>

              {job.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MdLocationOn style={{ color: 'var(--color-primary)', fontSize: '1.2rem' }} />
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Service Location</div>
                    <div style={{ fontWeight: 600 }}>{job.location}</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MdBuild style={{ color: 'var(--color-primary)', fontSize: '1.2rem' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Assigned Technician</div>
                  <div style={{ fontWeight: 600 }}>{job.assigned_staff_name}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MdSchedule style={{ color: 'var(--color-primary)', fontSize: '1.2rem' }} />
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Request Created At</div>
                  <div style={{ fontWeight: 600 }}>{job.created_at}</div>
                </div>
              </div>

              {job.complaint && (
                <div style={{ marginTop: 8, background: 'var(--bg-primary)', padding: 14, borderRadius: 8 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Issue Description:</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {job.complaint}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/complaint')}>
            ➕ Submit New Complaint
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/login')}>
            <MdHome /> Staff Login
          </button>
        </div>
      </div>
    </div>
  );
}
