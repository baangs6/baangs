import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customersApi } from '../../api';
import { MdArrowBack, MdWork } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    customersApi.get(customerId).then((r) => setCustomer(r.data)).catch(console.error);
    customersApi.getJobs(customerId).then((r) => setJobs(r.data)).catch(console.error);
  }, [customerId]);

  if (!customer) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  const STATUS_LABELS = {
    pending: 'Pending',
    in_progress: 'In Progress',
    complete: 'Complete',
    cancelled: 'Cancelled'
  };

  const getWhatsAppLink = (phone) => {
    if (!phone) return null;
    const clean = String(phone).replace(/\D/g, '');
    if (!clean) return null;
    return `https://wa.me/${clean}`;
  };

  return (
    <div className="animate-fade" style={{ maxWidth: 800 }}>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/customers')} style={{ marginBottom: 16 }}>
        <MdArrowBack /> Back
      </button>
      <div className="page-header">
        <div className="page-header-left">
          <h2>{customer.customer_name}</h2>
          <p>{customer.customer_id} · {customer.phone_number}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 12 }}>Contact Details</h3>
          <div className="detail-grid">
            {[
              [
                'Phone',
                customer.phone_number ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span>{customer.phone_number}</span>
                    {getWhatsAppLink(customer.phone_number) && (
                      <a
                        href={getWhatsAppLink(customer.phone_number)}
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
                ) : (
                  '-'
                )
              ],
              [
                'Alternative Phone',
                customer.alternative_phone_number ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span>{customer.alternative_phone_number}</span>
                    {getWhatsAppLink(customer.alternative_phone_number) && (
                      <a
                        href={getWhatsAppLink(customer.alternative_phone_number)}
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
                ) : (
                  '-'
                )
              ],
              ['Location', customer.location || '-'],
              [
                'Map Location',
                getMapHref(customer.map_location, customer.location) ? (
                  <a
                    href={getMapHref(customer.map_location, customer.location)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                  >
                    View Map
                  </a>
                ) : (
                  '-'
                )
              ],
              ['Site Type', customer.site_type || '-'],
              ['Total Jobs', customer.total_jobs]
            ].map(([label, value]) => (
              <div className="detail-item" key={label}>
                <span className="detail-label">{label}</span>
                <span className="detail-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 12 }}>History</h3>
          <div className="detail-grid">
            {[
              ['First Request', customer.first_request_date || '-'],
              ['Latest Request', customer.latest_request_date || '-']
            ].map(([label, value]) => (
              <div className="detail-item" key={label}>
                <span className="detail-label">{label}</span>
                <span className="detail-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><MdWork style={{ marginRight: 8 }} />Job History ({jobs.length})</h3>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><p>No jobs yet</p></div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Work Type</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.job_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/jobs/${j.job_id}`)}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '0.8rem' }}>{j.job_id}</td>
                    <td>{j.work_type}</td>
                    <td><span className={`badge badge-${j.priority}`}>{j.priority}</span></td>
                    <td><span className={`badge badge-${j.status}`}>{STATUS_LABELS[j.status]}</span></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{j.service_request_date?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function getMapHref(mapLocation, location) {
  const value = (mapLocation || '').trim();
  if (value) {
    if (/^https?:\/\//i.test(value)) return value;
    const coordinates = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coordinates) return `https://maps.google.com/?q=${coordinates[1]},${coordinates[2]}`;
    return `https://maps.google.com/?q=${encodeURIComponent(value)}`;
  }

  const address = (location || '').trim();
  return address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : '';
}
