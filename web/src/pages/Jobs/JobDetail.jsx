import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jobsApi, updatesApi, billingApi, staffApi, lookupsApi } from '../../api';
import { MdArrowBack, MdEdit, MdAttachMoney, MdVerified } from 'react-icons/md';

const STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

const EMPTY_VERIFY_FORM = {
  serial_or_barcode: '',
  item_name: '',
  model_number: '',
  purchase_price: '',
  selling_price: '',
  quantity: '',
};

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [billing, setBilling] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [staff, setStaff] = useState([]);
  const [lookups, setLookups] = useState({});
  const [editForm, setEditForm] = useState({});

  const [updateForm, setUpdateForm] = useState({
    status: 'in_progress',
    visit_notes: '',
    expense: 0,
    collected_amount: 0,
    invoice_amount: 0,
  });
  const [billingForm, setBillingForm] = useState({
    invoice_amount: 0,
    expense: 0,
    material_amount: 0,
    collected_amount: 0,
    payment_mode: 'cash',
    payment_id: '',
  });
  const [verifyForm, setVerifyForm] = useState(EMPTY_VERIFY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [jobRes, updatesRes] = await Promise.all([
      jobsApi.get(jobId),
      updatesApi.getJobUpdates(jobId),
    ]);
    setJob(jobRes.data);
    setUpdates(updatesRes.data);
    const latestUpdate = updatesRes.data?.[0];
    setUpdateForm({
      status: latestUpdate?.status || jobRes.data.status || 'pending',
      visit_notes: latestUpdate?.visit_notes || '',
      expense: Number(latestUpdate?.expense || 0),
      collected_amount: Number(latestUpdate?.collected_amount || 0),
      invoice_amount: Number(latestUpdate?.service_bill || 0),
    });

    try {
      const bRes = await billingApi.list({ job_id: jobId });
      const found = bRes.data.find((b) => b.job_id === jobId);
      setBilling(found || null);
    } catch {
      setBilling(null);
    }
  }, [jobId]);

  useEffect(() => {
    load().catch(console.error);
    staffApi.list().then(r => setStaff(r.data)).catch(console.error);
    lookupsApi.all().then(r => setLookups(r.data)).catch(console.error);
  }, [load]);

  const submitUpdate = async () => {
    setSaving(true);
    try {
      await updatesApi.create({ job_id: jobId, ...updateForm });
      await load();
      setShowUpdateModal(false);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to save update');
    } finally {
      setSaving(false);
    }
  };

  const submitBilling = async () => {
    setSaving(true);
    try {
      const res = await billingApi.create({ job_id: jobId, ...billingForm });
      setBilling(res.data);
      setJob((current) => ({ ...current, status: 'complete' }));
      setShowBillingModal(false);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to create billing');
    } finally {
      setSaving(false);
    }
  };

  const openVerifyModal = (updateId, item) => {
    setVerifyTarget({ updateId, manualItemId: item.manual_item_id });
    setVerifyForm({
      serial_or_barcode: item.serial_number || item.barcode || '',
      item_name: item.item_name || '',
      model_number: item.model_number || '',
      purchase_price: '',
      selling_price: '',
      quantity: item.quantity_used || '',
    });
    setShowVerifyModal(true);
  };

  const submitManualVerify = async () => {
    if (!verifyTarget) return;
    setSaving(true);
    try {
      await updatesApi.verifyManualInventory(
        verifyTarget.updateId,
        verifyTarget.manualItemId,
        {
          ...verifyForm,
          barcode: verifyForm.serial_or_barcode,
          serial_number: verifyForm.serial_or_barcode,
          quantity_used: Number(verifyForm.quantity) || 0,
          purchase_price: Number(verifyForm.purchase_price) || 0,
          selling_price: Number(verifyForm.selling_price) || 0,
          opening_quantity: Number(verifyForm.quantity) || 0,
        }
      );
      await load();
      setShowVerifyModal(false);
      setVerifyTarget(null);
      setVerifyForm(EMPTY_VERIFY_FORM);
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to verify manual inventory');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = () => {
    setEditForm({
      location: job.location || '',
      map_location: job.map_location || '',
      site_type: job.site_type || '',
      work_type: job.work_type,
      priority: job.priority,
      assigned_staff_id: job.assigned_staff_id || '',
      scheduled_date: job.scheduled_date || '',
      preferred_time: job.preferred_time || '',
      complaint: job.complaint || ''
    });
    setShowEditModal(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await jobsApi.update(jobId, editForm);
      await load();
      setShowEditModal(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update job');
    } finally {
      setSaving(false);
    }
  };

  if (!job) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="animate-fade" style={{ maxWidth: 980 }}>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/jobs')} style={{ marginBottom: 16 }}>
        <MdArrowBack /> Back to Jobs
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h2 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', fontWeight: 700 }}>{job.job_id}</h2>
            <span className={`badge badge-${job.status}`}>{STATUS_LABELS[job.status] || job.status}</span>
            <span className={`badge badge-${job.priority}`}>{job.priority}</span>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            {job.customer_name} | {job.phone_number}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={openEditModal}>
            <MdEdit /> Edit Job
          </button>
          <button className="btn btn-secondary" onClick={() => setShowUpdateModal(true)}>
            <MdEdit /> Update Status
          </button>
          {!billing && (
            <button className="btn btn-success" onClick={() => {
              const totalExpense = updates.reduce((acc, u) => acc + (u.expense || 0), 0);
              const totalCollected = updates.reduce((acc, u) => acc + (u.collected_amount || 0), 0);
              setBillingForm(prev => ({ ...prev, expense: totalExpense, collected_amount: totalCollected }));
              setShowBillingModal(true);
            }}>
              <MdAttachMoney /> {job.status === 'complete' ? 'Create Billing Record' : 'Mark Complete and Bill'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>Customer</h3>
          <div className="detail-grid">
            <div className="detail-item"><span className="detail-label">Name</span><span className="detail-value">{job.customer_name}</span></div>
            <div className="detail-item"><span className="detail-label">Phone</span><span className="detail-value">{job.phone_number}</span></div>
            <div className="detail-item"><span className="detail-label">Location</span><span className="detail-value">{job.location || '-'}</span></div>
            <div className="detail-item"><span className="detail-label">Map Location</span><span className="detail-value">{getMapHref(job.map_location, job.location) ? <a href={getMapHref(job.map_location, job.location)} target="_blank" rel="noreferrer" style={{color: 'var(--color-primary)', textDecoration: 'underline'}}>View Map</a> : '-'}</span></div>
            <div className="detail-item"><span className="detail-label">Site Type</span><span className="detail-value">{job.site_type || '-'}</span></div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 16 }}>Work Tracking</h3>
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="detail-item"><span className="detail-label">Started At</span><span className="detail-value">{formatDateTime(job.work_started_at)}</span></div>
            <div className="detail-item"><span className="detail-label">Start Location</span><span className="detail-value">{formatLocation(job.work_start_location)}</span></div>
            <div className="detail-item"><span className="detail-label">Ended At</span><span className="detail-value">{formatDateTime(job.work_ended_at)}</span></div>
            <div className="detail-item"><span className="detail-label">End Location</span><span className="detail-value">{formatLocation(job.work_end_location)}</span></div>
            <div className="detail-item"><span className="detail-label">Time Spent</span><span className="detail-value" style={{fontWeight: 600, color: 'var(--color-success)'}}>{formatDuration(job.work_started_at, job.work_ended_at)}</span></div>
            <div className="detail-item"><span className="detail-label">Technician</span><span className="detail-value">{job.work_started_by || job.work_ended_by || '-'}</span></div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="card-title" style={{ marginBottom: 16 }}>Job Info</h3>
        <div className="detail-grid">
          <div className="detail-item"><span className="detail-label">Work Type</span><span className="detail-value">{job.work_type}</span></div>
          <div className="detail-item"><span className="detail-label">Assigned To</span><span className="detail-value">{job.assigned_staff_name || 'Unassigned'}</span></div>
          <div className="detail-item"><span className="detail-label">Scheduled</span><span className="detail-value">{job.scheduled_date || '-'}</span></div>
          <div className="detail-item"><span className="detail-label">Requested</span><span className="detail-value">{job.service_request_date?.slice(0, 10)}</span></div>
        </div>
        {job.complaint ? (
          <p style={{ marginTop: 12, fontSize: '0.875rem', color: 'var(--color-text-secondary)', padding: '8px', background: 'var(--color-surface-2)', borderRadius: 6 }}>
            {job.complaint}
          </p>
        ) : null}
      </div>

      {billing && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(16,185,129,0.3)' }}>
          <h3 className="card-title" style={{ marginBottom: 16, color: 'var(--color-success)' }}>Billing</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              ['Invoice', `Rs ${billing.invoice_amount}`],
              ['Expense', `Rs ${billing.expense}`],
              ['Material', `Rs ${billing.material_amount}`],
              ['Profit', `Rs ${billing.profit} (${billing.profit_percentage?.toFixed(1)}%)`],
            ].map(([label, value]) => (
              <div key={label} className="detail-item" style={{ textAlign: 'center', padding: 12, background: 'var(--color-surface-2)', borderRadius: 8 }}>
                <div className="detail-label">{label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Payment: {billing.payment_mode} {billing.payment_id ? `| ${billing.payment_id}` : ''} | Collected: Rs {billing.collected_amount || 0}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 16 }}>Update History</h3>
        {updates.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><p>No updates yet</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {updates.map((update) => (
              <div key={update.update_id} style={{ padding: 12, background: 'var(--color-surface-2)', borderRadius: 8, borderLeft: '3px solid var(--color-accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{update.staff_name}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`badge badge-${update.status}`}>{STATUS_LABELS[update.status] || update.status}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{formatDateTime(update.update_time)}</span>
                  </div>
                </div>

                {update.work_event ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: 3 }}>
                    Event: {update.work_event}
                    {update.location ? ` | Location: ${formatLocation(update.location)}` : ''}
                  </p>
                ) : null}
                {update.visit_notes ? <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{update.visit_notes}</p> : null}
                {Number(update.expense || 0) > 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-amber)', marginTop: 4 }}>Expense: Rs {update.expense}</p>
                ) : null}
                {Number(update.collected_amount || 0) > 0 ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: 2 }}>Collected: Rs {update.collected_amount}</p>
                ) : null}

                {update.inventory_used?.length > 0 && (
                  <div style={{ marginTop: 8, borderLeft: '2px solid var(--color-success)', paddingLeft: 8 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Hardware Used</div>
                    {update.inventory_used.map((item) => (
                      <div key={`${update.update_id}-${item.barcode}`} style={{ fontSize: '0.82rem', color: 'var(--color-text)' }}>
                        {item.quantity_used} x {item.item_name || item.barcode}
                      </div>
                    ))}
                  </div>
                )}

                {update.manual_inventory_items?.length > 0 && (
                  <div style={{ marginTop: 8, borderLeft: '2px solid var(--color-warning)', paddingLeft: 8 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Manual Inventory (Admin Verification)</div>
                    {update.manual_inventory_items.map((item) => (
                      <div key={item.manual_item_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ fontSize: '0.82rem', color: 'var(--color-text)' }}>
                          {item.quantity_used} x {item.item_name} ({item.verification_status || 'pending'})
                        </div>
                        {item.verification_status !== 'verified' ? (
                          <button className="btn btn-sm btn-success" onClick={() => openVerifyModal(update.update_id, item)}>
                            <MdVerified /> Verify
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Update Job Status</h3>
              <button className="btn-icon" onClick={() => setShowUpdateModal(false)}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={updateForm.status} onChange={(event) => setUpdateForm((prev) => ({ ...prev, status: event.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Visit Notes</label>
                  <textarea className="form-textarea" value={updateForm.visit_notes} onChange={(event) => setUpdateForm((prev) => ({ ...prev, visit_notes: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Invoice Amount (Rs)</label>
                  <input className="form-input" type="number" value={updateForm.invoice_amount} onChange={(event) => setUpdateForm((prev) => ({ ...prev, invoice_amount: Number(event.target.value) || 0 }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount Collected (Rs)</label>
                  <input className="form-input" type="number" value={updateForm.collected_amount} onChange={(event) => setUpdateForm((prev) => ({ ...prev, collected_amount: Number(event.target.value) || 0 }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Expense (Rs)</label>
                  <input className="form-input" type="number" value={updateForm.expense} onChange={(event) => setUpdateForm((prev) => ({ ...prev, expense: Number(event.target.value) || 0 }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUpdateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitUpdate} disabled={saving}>
                {saving ? 'Saving...' : 'Save Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBillingModal && (
        <div className="modal-overlay" onClick={() => setShowBillingModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Billing Record</h3>
              <button className="btn-icon" onClick={() => setShowBillingModal(false)}>x</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                {[
                  ['Invoice Amount (Rs)', 'invoice_amount'],
                  ['Expense (Rs)', 'expense'],
                  ['Material Cost (Rs)', 'material_amount'],
                  ['Collected Amount (Rs)', 'collected_amount'],
                ].map(([label, key]) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{label}</label>
                    <input className="form-input" type="number" value={billingForm[key]} onChange={(event) => setBillingForm((prev) => ({ ...prev, [key]: Number(event.target.value) || 0 }))} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select className="form-select" value={billingForm.payment_mode} onChange={(event) => setBillingForm((prev) => ({ ...prev, payment_mode: event.target.value }))}>
                    {['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'other'].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Payment ID / Reference</label>
                  <input className="form-input" value={billingForm.payment_id} onChange={(event) => setBillingForm((prev) => ({ ...prev, payment_id: event.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBillingModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitBilling} disabled={saving}>
                {saving ? 'Saving...' : 'Complete and Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerifyModal && (
        <div className="modal-overlay" onClick={() => setShowVerifyModal(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Verify Manual Inventory</h3>
              <button className="btn-icon" onClick={() => setShowVerifyModal(false)}>x</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Item Name</label>
                  <input className="form-input" value={verifyForm.item_name} onChange={(event) => setVerifyForm((prev) => ({ ...prev, item_name: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Serial / Barcode</label>
                  <input className="form-input" value={verifyForm.serial_or_barcode} onChange={(event) => setVerifyForm((prev) => ({ ...prev, serial_or_barcode: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input className="form-input" type="number" value={verifyForm.quantity} onChange={(event) => setVerifyForm((prev) => ({ ...prev, quantity: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Model Number</label>
                  <input className="form-input" value={verifyForm.model_number} onChange={(event) => setVerifyForm((prev) => ({ ...prev, model_number: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Price</label>
                  <input className="form-input" type="number" value={verifyForm.purchase_price} onChange={(event) => setVerifyForm((prev) => ({ ...prev, purchase_price: event.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price</label>
                  <input className="form-input" type="number" value={verifyForm.selling_price} onChange={(event) => setVerifyForm((prev) => ({ ...prev, selling_price: event.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowVerifyModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={submitManualVerify} disabled={saving}>
                {saving ? 'Saving...' : 'Verify and Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Job</h3>
              <button className="btn-icon" onClick={() => setShowEditModal(false)}>x</button>
            </div>
            <form onSubmit={submitEdit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Work Type *</label>
                    <select className="form-select" value={editForm.work_type} onChange={e => setEditForm(f => ({ ...f, work_type: e.target.value }))} required>
                      <option value="">Select work type</option>
                      {(lookups.service_types || []).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assign Technician *</label>
                    <select className="form-select" value={editForm.assigned_staff_id} onChange={e => setEditForm(f => ({ ...f, assigned_staff_id: e.target.value }))} required>
                      <option value="">Select Technician</option>
                      {staff.filter(s => s.is_active).map(s => <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.skill || 'General'})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location / Address</label>
                    <input className="form-input" value={editForm.location || ''} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Map Location</label>
                    <input className="form-input" value={editForm.map_location || ''} onChange={e => setEditForm(f => ({ ...f, map_location: e.target.value }))} placeholder="Google Maps URL or coordinates" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Site Type</label>
                    <select className="form-select" value={editForm.site_type || ''} onChange={e => setEditForm(f => ({ ...f, site_type: e.target.value }))}>
                      <option value="">Select site type</option>
                      <option value="Home">Home</option>
                      <option value="Office">Office</option>
                      <option value="Shop">Shop</option>
                      <option value="Land">Land</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-select" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}>
                      {(lookups.priority_levels || []).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Scheduled Date</label>
                    <input className="form-input" type="date" value={editForm.scheduled_date} onChange={e => setEditForm(f => ({ ...f, scheduled_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Preferred Time</label>
                    <input className="form-input" type="time" value={editForm.preferred_time} onChange={e => setEditForm(f => ({ ...f, preferred_time: e.target.value }))} />
                  </div>
                  <div className="form-group form-full">
                    <label className="form-label">Complaint / Description</label>
                    <textarea className="form-textarea" value={editForm.complaint} onChange={e => setEditForm(f => ({ ...f, complaint: e.target.value }))} rows={3} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" type="button" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return '-';
  return value.slice(0, 16).replace('T', ' ');
}

function formatLocation(location) {
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return '-';
  }
  const lat = Number(location.latitude).toFixed(5);
  const lon = Number(location.longitude).toFixed(5);
  const acc = location.accuracy ? ` (+-${Math.round(location.accuracy)}m)` : '';
  return `${lat}, ${lon}${acc}`;
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

function formatDuration(startStr, endStr) {
  if (!startStr || !endStr) return '-';
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end - start;
  if (diffMs < 0) return '-';
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours > 0) return `${hours} hr ${mins} min`;
  return `${mins} min`;
}
