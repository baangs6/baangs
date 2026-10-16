import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, House, Building2, MapPin, Download, RefreshCw, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { customersApi } from '../../api';
import { MdSearch, MdPeople, MdAdd, MdEdit, MdDelete } from 'react-icons/md';
import { formatDate } from '../../utils/dateFormat';
import './CustomerList.css';
import AddCustomerDialog from '../../components/AddCustomerDialog';

function siteGroup(customer) {
  const site = (customer.site_type || '').toLowerCase();
  if (['residential', 'home', 'villa', 'house'].includes(site)) return 'home';
  if (['commercial', 'office', 'shop'].includes(site)) return 'office';
  return 'other';
}

export default function CustomerList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');
  const [siteType, setSiteType] = useState('');
  const [area, setArea] = useState('');
  const [volume, setVolume] = useState('');
  const [segment, setSegment] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showModal, setShowModal] = useState(false);
  const [addError, setAddError] = useState('');
  const [showEditModal, setShowEditModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '',
    nickname: '',
    phone_number: '',
    alternative_phone_number: '',
    location: '',
    map_location: '',
    site_type: ''
  });

  const fetchCustomers = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await customersApi.listAll();
      setCustomers(res.data);
    } catch {
      setLoadError('Unable to load customers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = customers.filter(customer => {
    const query = search.trim().toLowerCase();
    const matchesSearch = [customer.customer_id, customer.customer_name, customer.nickname, customer.phone_number, customer.alternative_phone_number, customer.location].some(value => String(value || '').toLowerCase().includes(query));
    const jobs = Number(customer.total_jobs || 0);
    return matchesSearch && (!siteType || customer.site_type === siteType) && (!area || customer.location === area) && (!segment || siteGroup(customer) === segment)
      && (!volume || (volume === 'high' ? jobs > 5 : volume === 'regular' ? jobs >= 2 && jobs <= 5 : volume === 'single' ? jobs === 1 : jobs === 0));
  }).sort((a, b) => sort === 'name' ? (a.customer_name || '').localeCompare(b.customer_name || '') : sort === 'jobs' ? Number(b.total_jobs || 0) - Number(a.total_jobs || 0) : (b.latest_request_date || '').localeCompare(a.latest_request_date || ''));
  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageNumbers = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b);
  const updateFilter = (setter, value) => { setter(value); setPage(1); };
  const exportCustomers = () => {
    const cell = value => `"${String(value ?? '').replace(/^\s*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [['Customer ID', 'Name', 'Nickname', 'Phone', 'Alternative Phone', 'Location', 'Site Type', 'Total Jobs', 'Last Request', 'First Request'], ...filteredCustomers.map(c => [c.customer_id, c.customer_name, c.nickname, c.phone_number, c.alternative_phone_number, c.location, c.site_type, c.total_jobs, c.latest_request_date, c.first_request_date])];
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customers.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!formData.customer_name.trim() || !formData.phone_number.trim()) {
      setAddError('Name and Phone are required');
      return;
    }
    setSaving(true);
    setAddError('');
    try {
      await customersApi.create(formData);
      setShowModal(false);
      setFormData({
        customer_name: '',
        nickname: '',
        phone_number: '',
        alternative_phone_number: '',
        location: '',
        map_location: '',
        site_type: ''
      });
      await fetchCustomers();
    } catch (error) {
      setAddError(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Failed to add customer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (customer) => {
    if (!confirm(`Delete customer "${customer.customer_name}"?`)) {
      return;
    }
    try {
      await customersApi.delete(customer.customer_id);
      await fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete customer');
    }
  };

  const handleUpdateCustomer = async () => {
    if (!showEditModal) return;
    if (!showEditModal.customer_name || !showEditModal.phone_number) {
      alert('Name and Phone are required');
      return;
    }
    setSaving(true);
    try {
      await customersApi.update(showEditModal.customer_id, {
        customer_name: showEditModal.customer_name,
        nickname: showEditModal.nickname || '',
        phone_number: showEditModal.phone_number,
        alternative_phone_number: showEditModal.alternative_phone_number || '',
        location: showEditModal.location || '',
        map_location: showEditModal.map_location || '',
        site_type: showEditModal.site_type || ''
      });
      setShowEditModal(null);
      await fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade customers-page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Customers</h2>
          <p>{customers.length} customers in database <span>Client directory & service histories</span></p>
        </div>
        <div className="customers-header-actions">
        <button className="btn btn-secondary" onClick={exportCustomers} disabled={loading || !!loadError || !filteredCustomers.length}><Download size={16} /> Export CSV</button>
        <button className="btn btn-primary" onClick={() => { setAddError(''); setShowModal(true); }}>
          <MdAdd /> Add Customer
        </button>
        </div>
      </div>

      <section className="customers-summary" aria-label="Customer database summary">
        <div><span>Total Database</span><strong>{customers.length}</strong><small>All customer locations</small><Users aria-hidden="true" /></div>
        <div><span>Residential Sites</span><strong>{customers.filter(c => siteGroup(c) === 'home').length}</strong><small>Homes and villas</small><House aria-hidden="true" /></div>
        <div><span>Commercial / Office</span><strong>{customers.filter(c => siteGroup(c) === 'office').length}</strong><small>Business locations</small><Building2 aria-hidden="true" /></div>
        <div><span>Other Sites</span><strong>{customers.filter(c => siteGroup(c) === 'other').length}</strong><small>Other or unspecified types</small><MapPin aria-hidden="true" /></div>
      </section>

      <div className="filter-bar">
        <div className="search-input-wrapper">
          <MdSearch className="search-icon" />
          <input
            className="form-input search-input"
            placeholder="Search by name, nickname, phone, location..."
            aria-label="Search customers"
            value={search}
            onChange={(e) => updateFilter(setSearch, e.target.value)}
          />
        </div>
        <select className="form-select" aria-label="Site type" value={siteType} onChange={event => updateFilter(setSiteType, event.target.value)}><option value="">All site types</option>{[...new Set(customers.map(c => c.site_type).filter(Boolean))].sort().map(type => <option key={type}>{type}</option>)}</select>
        <select className="form-select" aria-label="Location" value={area} onChange={event => updateFilter(setArea, event.target.value)}><option value="">All locations</option>{[...new Set(customers.map(c => c.location).filter(Boolean))].sort().map(location => <option key={location}>{location}</option>)}</select>
        <select className="form-select" aria-label="Job volume" value={volume} onChange={event => updateFilter(setVolume, event.target.value)}><option value="">All job volumes</option><option value="high">High (6+ jobs)</option><option value="regular">Regular (2-5 jobs)</option><option value="single">Single job</option><option value="none">No jobs</option></select>
        <button className="btn btn-secondary btn-icon" title="Refresh customers" aria-label="Refresh customers" onClick={fetchCustomers} disabled={loading}><RefreshCw size={16} /></button>
      </div>

      <div className="customers-segment-bar">
        <div className="customers-segments" aria-label="Customer categories">{[['', 'All'], ['home', 'Home'], ['office', 'Office'], ['other', 'Other Sites']].map(([value, label]) => <button className="btn btn-secondary" key={value} aria-pressed={segment === value} onClick={() => updateFilter(setSegment, value)}>{label} ({value ? customers.filter(c => siteGroup(c) === value).length : customers.length})</button>)}</div>
        <select className="form-select" aria-label="Sort customers" value={sort} onChange={event => updateFilter(setSort, event.target.value)}><option value="recent">Recent service activity</option><option value="name">Customer name</option><option value="jobs">Most jobs</option></select>
        <button className="btn btn-secondary" onClick={() => { setSearch(''); setSiteType(''); setArea(''); setVolume(''); setSegment(''); setPage(1); }}>Clear filters</button>
      </div>

      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : loadError ? <div className="customers-error" role="alert">{loadError}<button className="btn btn-secondary" onClick={fetchCustomers}>Retry</button></div> : filteredCustomers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <MdPeople />
          </div>
          <h3>No customers found</h3>
          <p>{customers.length ? 'No customers match the selected filters.' : 'Customers appear here after they are added.'}</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Nickname</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Site Type</th>
                <th>Total Jobs</th>
                <th>Last Request</th>
                <th>First Request</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.slice(pageStart, pageStart + pageSize).map((c) => (
                <tr key={c.customer_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/customers/${c.customer_id}`)}>
                  <td><Link className="customers-name" to={`/customers/${c.customer_id}`}>{c.customer_name}</Link></td>
                  <td>{c.nickname || '-'}</td>
                  <td>{c.phone_number}{c.alternative_phone_number && <small className="customers-subline">Alt: {c.alternative_phone_number}</small>}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{c.location || '-'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{c.site_type || '-'}</td>
                  <td>
                    <span className="badge badge-complete" style={{ fontSize: '0.8rem' }}>
                      {c.total_jobs}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{formatDate(c.latest_request_date)}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{formatDate(c.first_request_date)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        title="Edit customer"
                        aria-label={`Edit ${c.customer_name}`}
                        className="btn btn-secondary"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowEditModal({
                            customer_id: c.customer_id,
                            customer_name: c.customer_name || '',
                            nickname: c.nickname || '',
                            phone_number: c.phone_number || '',
                            alternative_phone_number: c.alternative_phone_number || '',
                            location: c.location || '',
                            map_location: c.map_location || '',
                            site_type: c.site_type || ''
                          });
                        }}
                        style={{ padding: '6px 10px' }}
                      >
                        <MdEdit />
                      </button>
                      <button
                        title="Delete customer"
                        aria-label={`Delete ${c.customer_name}`}
                        className="btn btn-danger"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomer(c);
                        }}
                        style={{ padding: '6px 10px' }}
                      >
                        <MdDelete />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadError && filteredCustomers.length > 0 && <nav className="customers-pagination" aria-label="Customers pagination">
        <span role="status">Showing {pageStart + 1}-{Math.min(pageStart + pageSize, filteredCustomers.length)} of {filteredCustomers.length}</span>
        <label>Rows per page <select className="form-select" value={pageSize} onChange={event => updateFilter(setPageSize, Number(event.target.value))}>{[10, 20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>
        <div className="customers-page-buttons"><button className="btn btn-secondary btn-icon" title="Previous page" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">...</span>}<button className={`btn ${number === currentPage ? 'btn-primary' : 'btn-secondary'}`} aria-label={`Page ${number}`} aria-current={number === currentPage ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button className="btn btn-secondary btn-icon" title="Next page" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div>
        <form key={`${currentPage}-${pageCount}-${pageSize}`} className="customers-page-jump" onSubmit={event => { event.preventDefault(); const target = Number(new FormData(event.currentTarget).get('page')); if (Number.isInteger(target) && target >= 1 && target <= pageCount) setPage(target); }}><label>Jump to page <input className="form-input" name="page" type="number" required min="1" max={pageCount} step="1" defaultValue={currentPage} /></label><span>of {pageCount}</span><button className="btn btn-secondary btn-icon" type="submit" title="Jump to page" aria-label="Jump to page"><ArrowRight size={16} /></button></form>
      </nav>}

      {showModal && <AddCustomerDialog data={formData} onChange={setFormData} onSubmit={handleAddCustomer} onClose={() => setShowModal(false)} saving={saving} error={addError} />}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Edit Customer" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Customer</h3>
              <button className="btn-icon" onClick={() => setShowEditModal(null)}>
                x
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Customer Name*</label>
                <input
                  className="form-input"
                  required
                  value={showEditModal.customer_name}
                  onChange={(e) => setShowEditModal({ ...showEditModal, customer_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nickname (internal)</label>
                <input className="form-input" maxLength={80} value={showEditModal.nickname || ''}
                  onChange={(e) => setShowEditModal({ ...showEditModal, nickname: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number*</label>
                <input
                  className="form-input"
                  required
                  value={showEditModal.phone_number}
                  onChange={(e) => setShowEditModal({ ...showEditModal, phone_number: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Alternative Phone Number</label>
                <input
                  className="form-input"
                  value={showEditModal.alternative_phone_number || ''}
                  onChange={(e) => setShowEditModal({ ...showEditModal, alternative_phone_number: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  className="form-input"
                  value={showEditModal.location || ''}
                  onChange={(e) => setShowEditModal({ ...showEditModal, location: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Map Location (URL)</label>
                <input
                  className="form-input"
                  placeholder="Google Maps link"
                  value={showEditModal.map_location || ''}
                  onChange={(e) => setShowEditModal({ ...showEditModal, map_location: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Site Type</label>
                <select
                  className="form-input"
                  value={showEditModal.site_type || ''}
                  onChange={(e) => setShowEditModal({ ...showEditModal, site_type: e.target.value })}
                >
                  <option value="">Select Type</option>
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Industrial">Industrial</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleUpdateCustomer} disabled={saving}>
                {saving ? 'Saving...' : 'Update Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
