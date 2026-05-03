import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { customersApi } from '../../api';
import { MdSearch, MdPeople, MdAdd, MdEdit, MdDelete } from 'react-icons/md';

export default function CustomerList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '',
    phone_number: '',
    alternative_phone_number: '',
    location: '',
    map_location: '',
    site_type: ''
  });

  const fetchCustomers = async (q = '') => {
    setLoading(true);
    try {
      const res = await customersApi.list(q ? { search: q } : {});
      setCustomers(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.phone_number) {
      alert('Name and Phone are required');
      return;
    }
    setSaving(true);
    try {
      await customersApi.create(formData);
      setShowModal(false);
      setFormData({
        customer_name: '',
        phone_number: '',
        alternative_phone_number: '',
        location: '',
        map_location: '',
        site_type: ''
      });
      await fetchCustomers(search);
    } catch {
      alert('Failed to add customer');
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
      await fetchCustomers(search);
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
        phone_number: showEditModal.phone_number,
        alternative_phone_number: showEditModal.alternative_phone_number || '',
        location: showEditModal.location || '',
        map_location: showEditModal.map_location || '',
        site_type: showEditModal.site_type || ''
      });
      setShowEditModal(null);
      await fetchCustomers(search);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Customers</h2>
          <p>{customers.length} customers in database</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <MdAdd /> Add Customer
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrapper">
          <MdSearch className="search-icon" />
          <input
            className="form-input search-input"
            placeholder="Search by name, phone, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
        </div>
      ) : customers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <MdPeople />
          </div>
          <h3>No customers yet</h3>
          <p>Customers are automatically created when you add jobs</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Alt Phone</th>
                <th>Location</th>
                <th>Site Type</th>
                <th>Total Jobs</th>
                <th>Last Request</th>
                <th>First Request</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customer_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/customers/${c.customer_id}`)}>
                  <td>
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '0.8rem' }}>
                      {c.customer_id}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.customer_name}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.phone_number}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{c.alternative_phone_number || '-'}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{c.location || '-'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{c.site_type || '-'}</td>
                  <td>
                    <span className="badge badge-complete" style={{ fontSize: '0.8rem' }}>
                      {c.total_jobs}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{c.latest_request_date || '-'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{c.first_request_date || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowEditModal({
                            customer_id: c.customer_id,
                            customer_name: c.customer_name || '',
                            phone_number: c.phone_number || '',
                            alternative_phone_number: c.alternative_phone_number || '',
                            location: c.location || '',
                            map_location: c.map_location || '',
                            site_type: c.site_type || ''
                          });
                        }}
                        style={{ padding: '6px 10px' }}
                      >
                        <MdEdit /> Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomer(c);
                        }}
                        style={{ padding: '6px 10px' }}
                      >
                        <MdDelete /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Customer</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                x
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Customer Name*</label>
                <input
                  className="form-input"
                  required
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number*</label>
                <input
                  className="form-input"
                  required
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Alternative Phone Number</label>
                <input
                  className="form-input"
                  value={formData.alternative_phone_number}
                  onChange={(e) => setFormData({ ...formData, alternative_phone_number: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  className="form-input"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Map Location (URL)</label>
                <input
                  className="form-input"
                  placeholder="Google Maps link"
                  value={formData.map_location}
                  onChange={(e) => setFormData({ ...formData, map_location: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Site Type</label>
                <select
                  className="form-input"
                  value={formData.site_type}
                  onChange={(e) => setFormData({ ...formData, site_type: e.target.value })}
                >
                  <option value="">Select Type</option>
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Industrial">Industrial</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAddCustomer} disabled={saving}>
                {saving ? 'Saving...' : 'Create Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
