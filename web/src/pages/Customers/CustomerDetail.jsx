import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Phone, MapPin, Plus, FileText, ShieldCheck, History, Package, Briefcase } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { customersApi } from '../../api';
import { MdArrowBack, MdWork } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import { formatDate } from '../../utils/dateFormat';
import AmcPanel from '../../components/AmcPanel';
import CustomerQuotations from '../../components/CustomerQuotations';
import './CustomerDetail.css';

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('jobs');
  const [loadError, setLoadError] = useState('');
  const [jobsError, setJobsError] = useState('');
  const [jobsLoading, setJobsLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [customer, setCustomer] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  const [warrantyLoading, setWarrantyLoading] = useState(true);
  const [warrantyError, setWarrantyError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setCustomer(null);
      setLoadError('');
      setJobs([]);
      setProducts([]);
      setJobsLoading(true);
      setWarrantyLoading(true);
      setJobsError('');
      setWarrantyError('');
      setActiveTab('jobs');
      const [profile, history, warranty] = await Promise.allSettled([customersApi.get(customerId), customersApi.getJobs(customerId), customersApi.getWarranty(customerId)]);
      if (!active) return;
      if (profile.status === 'fulfilled') setCustomer(profile.value.data);
      else setLoadError('Unable to load customer profile.');
      if (history.status === 'fulfilled') setJobs(history.value.data);
      else setJobsError('Unable to load job history.');
      if (warranty.status === 'fulfilled') setProducts(warranty.value.data);
      else setWarrantyError('Unable to load product warranties.');
      setJobsLoading(false);
      setWarrantyLoading(false);
    }
    load();
    return () => { active = false; };
  }, [customerId, retry]);

  if (loadError) return <div className="profile-load-error" role="alert"><p>{loadError}</p><button className="btn btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry</button><Link className="btn btn-secondary" to="/customers">Back to Customers</Link></div>;

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
    return `https://wa.me/${clean.length === 10 ? `91${clean}` : clean}`;
  };

  return (
    <div className="animate-fade customer-profile">
      <button className="btn btn-secondary btn-sm profile-back" onClick={() => navigate('/customers')}>
        <MdArrowBack /> Back to Customers
      </button>
      <div className="page-header">
        <span className="profile-avatar" aria-hidden="true">{(customer.customer_name || 'C').slice(0, 1).toUpperCase()}</span>
        <div className="page-header-left">
          <h2>{customer.customer_name}</h2>
          {customer.nickname && <span className="profile-nickname">{customer.nickname}</span>}
          <p><span><Phone size={14} /> {customer.phone_number || '-'}</span><span><MapPin size={14} /> {customer.location || '-'}</span>{customer.site_type && <span className="profile-site">{customer.site_type}</span>}</p>
        </div>
        <div className="profile-actions">
          {getWhatsAppLink(customer.phone_number) && <a className="btn btn-secondary profile-whatsapp" href={getWhatsAppLink(customer.phone_number)} target="_blank" rel="noreferrer"><FaWhatsapp /> WhatsApp</a>}
          {customer.phone_number && <a className="btn btn-secondary" href={`tel:${String(customer.phone_number).replace(/[^\d+]/g, '')}`}><Phone size={15} /> Call</a>}
          {['admin', 'manager'].includes(user?.role) && <button className="btn btn-secondary" onClick={() => navigate('/quotations', { state: { customer } })}><FileText size={15} /> Add Quotation</button>}
          {['admin', 'manager'].includes(user?.role) && <button className="btn btn-primary" onClick={() => navigate('/jobs/create', { state: { customer } })}><Plus size={15} /> New Job</button>}
        </div>
      </div>

      <div className="profile-overview">
        <section className="profile-contact">
          <h3 className="card-title"><Phone size={18} /> Contact & Site</h3>
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
        </section>
        <section className="profile-engagement">
          <h3 className="card-title"><History size={18} /> Engagement</h3>
          <div className="profile-job-total"><strong>{customer.total_jobs ?? jobs.length}</strong><span>Total Jobs</span></div>
          <div className="detail-grid">
            {[
              ['First Request', formatDate(customer.first_request_date)],
              ['Latest Request', formatDate(customer.latest_request_date)]
            ].map(([label, value]) => (
              <div className="detail-item" key={label}>
                <span className="detail-label">{label}</span>
                <span className="detail-value">{value}</span>
              </div>
            ))}
          </div>
        </section>
        <div className="profile-amc"><div className="profile-amc-label"><ShieldCheck size={18} /> AMC Coverage</div><AmcPanel key={customerId} customer={customer} /></div>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="Customer records" onKeyDown={event => {
        const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
        const index = tabs.indexOf(document.activeElement);
        let target;
        if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = tabs.length - 1;
        if (target !== undefined) { event.preventDefault(); tabs[target].focus(); tabs[target].click(); }
      }}>
        <button id="profile-tab-jobs" role="tab" tabIndex={activeTab === 'jobs' ? 0 : -1} aria-selected={activeTab === 'jobs'} aria-controls="profile-panel-jobs" onClick={() => setActiveTab('jobs')}><Briefcase size={16} /> Job History ({jobs.length})</button>
        <button id="profile-tab-products" role="tab" tabIndex={activeTab === 'products' ? 0 : -1} aria-selected={activeTab === 'products'} aria-controls="profile-panel-products" onClick={() => setActiveTab('products')}><Package size={16} /> Products & Warranty ({products.length})</button>
        <button id="profile-tab-quotes" role="tab" tabIndex={activeTab === 'quotes' ? 0 : -1} aria-selected={activeTab === 'quotes'} aria-controls="profile-panel-quotes" onClick={() => setActiveTab('quotes')}><FileText size={16} /> Quotations Given</button>
      </div>
      <div id="profile-panel-quotes" role="tabpanel" aria-labelledby="profile-tab-quotes" hidden={activeTab !== 'quotes'}><CustomerQuotations key={`quotes-${customerId}`} customerId={customerId} /></div>
      <section id="profile-panel-products" role="tabpanel" aria-labelledby="profile-tab-products" hidden={activeTab !== 'products'}>
        <h3 className="card-title" style={{ marginBottom: 12 }}>Products & Warranty</h3>
        {warrantyLoading ? <p>Loading warranties...</p> : warrantyError ? <p role="alert">{warrantyError}</p> : products.length === 0 ? <p>No recorded products used.</p> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Product / Model</th><th>Serial Number</th><th>Quantity</th><th>Installed On</th><th>Days Completed</th><th>Warranty</th><th>Expires On</th><th>Status</th><th>Job</th></tr></thead>
              <tbody>{products.map(product => (
                <tr key={product.usage_id}>
                  <td>{product.item_name || '-'}<br /><small>{product.model_number || '-'}</small></td>
                  <td>{product.serial_number || '-'}</td><td>{product.quantity_used}</td>
                  <td>{formatDate(product.installation_date)}</td><td>{product.days_completed ?? '-'}</td>
                  <td>{product.warranty_years == null ? 'Not recorded' : product.warranty_years === 0 ? 'None' : `${product.warranty_years} years`}</td>
                  <td>{formatDate(product.warranty_expiry)}</td>
                  <td><span className={`badge badge-${product.warranty_status === 'under_warranty' ? 'complete' : product.warranty_status === 'expired' ? 'cancelled' : 'pending'}`}>{({ under_warranty: 'Under warranty', expired: 'Expired', no_warranty: 'No warranty', not_recorded: 'Not recorded', awaiting_installation: 'Awaiting completion' })[product.warranty_status]}</span>{product.warranty_status === 'under_warranty' && <div><small>{product.days_remaining} days remaining</small></div>}</td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => navigate(`/jobs/${product.job_id}`)}>{product.job_id}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section id="profile-panel-jobs" role="tabpanel" aria-labelledby="profile-tab-jobs" hidden={activeTab !== 'jobs'}>
        <div className="card-header">
          <h3 className="card-title"><MdWork style={{ marginRight: 8 }} />Job History ({jobs.length})</h3>
        </div>
        {jobsLoading ? <p>Loading job history...</p> : jobsError ? <p role="alert">{jobsError}</p> : jobs.length === 0 ? (
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
                    <td><Link className="profile-job-link" to={`/jobs/${j.job_id}`}>{j.job_id}</Link></td>
                    <td>{j.work_type}</td>
                    <td><span className={`badge badge-${j.priority}`}>{j.priority}</span></td>
                    <td><span className={`badge badge-${j.status}`}>{STATUS_LABELS[j.status]}</span></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{formatDate(j.service_request_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
