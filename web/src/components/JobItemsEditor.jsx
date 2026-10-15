import { useEffect, useRef, useState } from 'react';
import { MdAdd, MdClose, MdDelete, MdEdit } from 'react-icons/md';
import { inventoryApi, jobsApi } from '../api';
import { useAuth } from '../context/useAuth';
import './JobItemsEditor.css';

const money = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function JobItemsEditor({ job, onSaved }) {
  const { user } = useAuth();
  const canEdit = ['admin', 'manager'].includes(user?.role);
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [items, setItems] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [selected, setSelected] = useState('');
  const displayed = open ? items : (job.inventory_used || []);

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  const startEditing = async () => {
    setOpen(true);
    setLoading(true);
    setError('');
    setSelected('');
    try {
      const [used, stock] = await Promise.all([jobsApi.items(job.job_id), inventoryApi.list()]);
      setVersion(used.data.version);
      setCatalogue(stock.data);
      setItems(used.data.items.map(row => ({ ...row, usage_id: row._id, key: row._id,
        unit_selling_price: row.unit_selling_price ?? stock.data.find(item => item.barcode === row.barcode)?.selling_price ?? 0,
      })));
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load job items');
      setVersion('');
    } finally {
      setLoading(false);
    }
  };

  const add = () => {
    const stock = catalogue.find(item => item.barcode === selected);
    if (!stock) { setError('Select a product from Inventory'); return; }
    setItems(rows => [...rows, { key: crypto.randomUUID(), usage_id: null,
      barcode: stock.barcode, item_name: stock.item_name, model_number: stock.model_number,
      quantity_used: 1, unit_selling_price: stock.selling_price || 0,
      serial_number: '', warranty_years: stock.warranty_years ?? null,
    }]);
    setSelected('');
    setError('');
  };
  const change = (key, field, value) => setItems(rows => rows.map(row => row.key === key ? { ...row, [field]: value } : row));

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await jobsApi.editItems(job.job_id, { version, items: items.map(row => ({
        usage_id: row.usage_id, barcode: row.barcode, quantity_used: Number(row.quantity_used),
        unit_selling_price: Number(row.unit_selling_price), serial_number: row.serial_number || null,
        warranty_years: row.warranty_years === null || row.warranty_years === '' ? null : Number(row.warranty_years),
      })) });
      // Close after a successful save so a refresh failure cannot resubmit stock changes.
      setOpen(false);
      try { await onSaved(); }
      catch { setError('Items were saved, but the page could not refresh. Reload to see the updated totals'); }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Unable to save job items. Please refresh and try again');
    } finally {
      setSaving(false);
    }
  };

  const total = displayed.reduce((sum, row) => sum + Number(row.quantity_used || 0) * Number(row.unit_selling_price || 0), 0);
  return (
    <section className="job-detail-panel job-items-section">
      <div className="job-items-heading">
        <h3 className="job-detail-section-title">Products Used</h3>
        {canEdit && <button className="btn btn-secondary btn-sm" onClick={startEditing}><MdEdit /> Edit Items</button>}
      </div>
      {!open && error && <p role="alert" className="job-items-error">{error}</p>}
      <div className="table-wrapper">
        <table className="table">
          <thead><tr><th>Product</th><th>Quantity</th><th>Unit Price</th><th>Amount</th></tr></thead>
          <tbody>{(job.inventory_used || []).map(row => <tr key={row._id}>
            <td>{row.item_name || row.barcode}{row.model_number && <small className="job-item-model">{row.model_number}</small>}</td>
            <td>{row.quantity_used}</td><td>Rs {money(row.unit_selling_price)}</td>
            <td>Rs {money(row.quantity_used * row.unit_selling_price)}</td>
          </tr>)}{!job.inventory_used?.length && <tr><td colSpan={4}>No products recorded</td></tr>}</tbody>
        </table>
      </div>
      {open && <dialog ref={dialog} className="job-items-dialog" aria-labelledby="job-items-title"
        onCancel={event => { if (saving) event.preventDefault(); else setOpen(false); }}>
        <form onSubmit={save}>
          <div className="modal-header"><h3 id="job-items-title">Edit Job Items</h3>
            <button type="button" className="btn-icon" aria-label="Close item editor" disabled={saving} onClick={() => setOpen(false)}><MdClose /></button>
          </div>
          <div className="modal-body">
            {error && <p role="alert" className="job-items-error">{error}</p>}
            {loading ? <p role="status">Loading items...</p> : <fieldset disabled={saving || !version}>
              <div className="job-items-add">
                <label htmlFor="job-item-catalogue">Inventory product</label>
                <input id="job-item-catalogue" className="form-input" list="job-item-options" value={selected}
                  onChange={event => setSelected(event.target.value)} placeholder="Search by product name or barcode" />
                <datalist id="job-item-options">{catalogue.map(item => <option key={item.barcode} value={item.barcode}>
                  {item.item_name} {item.model_number} - Stock: {item.current_quantity}
                </option>)}</datalist>
                <button type="button" className="btn btn-secondary" onClick={add}><MdAdd /> Add Item</button>
              </div>
              <div className="table-wrapper"><table className="table job-items-edit-table">
                <thead><tr><th>Product</th><th>Quantity</th><th>Unit Price (Rs)</th><th>Serial Number</th><th>Warranty</th><th>Amount (Rs)</th><th aria-label="Actions" /></tr></thead>
                <tbody>{items.map((row, index) => <tr key={row.key}>
                  <td>{row.item_name || row.barcode}<small className="job-item-model">{row.model_number}</small></td>
                  <td><input aria-label={`Quantity for item ${index + 1}`} className="form-input" type="number" min="0.001" step="any" required value={row.quantity_used} onChange={event => change(row.key, 'quantity_used', event.target.value)} /></td>
                  <td><input aria-label={`Price for item ${index + 1}`} className="form-input" type="number" min="0" step="0.01" required value={row.unit_selling_price} onChange={event => change(row.key, 'unit_selling_price', event.target.value)} /></td>
                  <td><input aria-label={`Serial number for item ${index + 1}`} className="form-input" maxLength={256} value={row.serial_number || ''} onChange={event => change(row.key, 'serial_number', event.target.value)} /></td>
                  <td><select aria-label={`Warranty for item ${index + 1}`} className="form-select" value={row.warranty_years ?? ''} onChange={event => change(row.key, 'warranty_years', event.target.value)}>
                    <option value="">Not recorded</option><option value="0">No warranty</option>
                    {[1, 2, 3, 4, 5].map(year => <option key={year} value={year}>{year} year{year > 1 ? 's' : ''}</option>)}
                  </select></td>
                  <td>{money(row.quantity_used * row.unit_selling_price)}</td>
                  <td><button type="button" className="btn-icon" aria-label={`Remove item ${index + 1}`} title="Remove item" onClick={() => setItems(rows => rows.filter(item => item.key !== row.key))}><MdDelete /></button></td>
                </tr>)}{!items.length && <tr><td colSpan={7}>No products recorded</td></tr>}</tbody>
              </table></div>
              <div className="job-items-total">Material Total: Rs {money(total)}</div>
            </fieldset>}
          </div>
          <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={loading || saving || !version}>{saving ? 'Saving...' : 'Save Items'}</button></div>
        </form>
      </dialog>}
    </section>
  );
}
