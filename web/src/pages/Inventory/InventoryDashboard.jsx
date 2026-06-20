import React, { useEffect, useState } from 'react';
import { inventoryApi, staffApi, customersApi } from '../../api';
import { MdAdd, MdHistory, MdInventory, MdTrendingUp, MdSummarize, MdSell, MdEdit, MdSearch, MdCloudUpload, MdFileDownload, MdFilterList } from 'react-icons/md';
import './InventoryDashboard.css';

export default function InventoryDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  // Data States
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [summaryFilters, setSummaryFilters] = useState({
    model_number: '',
    item_name: '',
    initial_quantity: '',
    total_transactions: '',
    current_stock: '',
    low_stock: ''
  });
  const [showSummaryFilters, setShowSummaryFilters] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editSerials, setEditSerials] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [stockSummary, setStockSummary] = useState([]);
  const [soldDetails, setSoldDetails] = useState([]);
  const [staff, setStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);

  // Form States
  const [logForm, setLogForm] = useState({
    model_number: '',
    barcode: '',
    quantity_changed: 0,
    transaction_type: 'STOCK_IN',
    staff_id: '',
    customer_details: '',
    amount_paid: 0,
    remarks: ''
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const defaultForm = {
    barcode: '', item_name: '', model_number: '',
    category: 'General', unit_type: 'Pcs', purchase_price: 0,
    selling_price: 0, tax_percentage: 18, opening_quantity: 1,
    minimum_stock_level: 5
  };
  const [createForm, setCreateForm] = useState(defaultForm);
  const [serialNumbers, setSerialNumbers] = useState(['']);

  const handleQtyChange = (val) => {
    const qty = parseFloat(val) || 1;
    setCreateForm(f => ({ ...f, opening_quantity: qty }));
    // Resize serial number list to match quantity
    setSerialNumbers(prev => {
      const newList = [...prev];
      while (newList.length < qty) newList.push('');
      return newList.slice(0, qty);
    });
  };

  const addSerial = () => {
    if (serialNumbers.length >= createForm.opening_quantity) {
      return alert(`You already have ${createForm.opening_quantity} serial number(s). Increase Initial Quantity to add more.`);
    }
    setSerialNumbers(prev => [...prev, '']);
  };

  const removeSerial = (idx) => {
    if (serialNumbers.length <= 1) return;
    setSerialNumbers(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSerial = (idx, val) => {
    setSerialNumbers(prev => prev.map((s, i) => i === idx ? val : s));
  };

  const handleCreateItem = async () => {
    if (!createForm.item_name || !createForm.model_number) return alert('Fill required fields (Item Name and Model Number)');
    // Validate serial count matches quantity
    const filledSerials = serialNumbers.filter(s => s.trim() !== '');
    if (filledSerials.length !== createForm.opening_quantity) {
      return alert(`Serial number count (${filledSerials.length}) must match Initial Quantity (${createForm.opening_quantity}). Please scan or type all serial numbers.`);
    }
    setSaving(true);
    try {
      const payload = { ...createForm, serial_numbers: filledSerials, serial_number: filledSerials.join(', ') };
      await inventoryApi.create(payload);
      setShowCreateModal(false);
      setCreateForm(defaultForm);
      setSerialNumbers(['']);
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : JSON.stringify(detail);
      alert(message || 'Failed to create item');
    }
    setSaving(false);
  };

  const handleEditClick = (item) => {
    setEditForm({ ...item });
    setEditSerials(item.serial_numbers || (item.serial_number ? item.serial_number.split(', ') : []));
    setShowEditModal(true);
  };

  const handleUpdateItem = async () => {
    if (!editForm.item_name || !editForm.model_number) return alert('Fill required fields');
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        serial_numbers: editSerials.filter(s => s.trim() !== ''),
        serial_number: editSerials.filter(s => s.trim() !== '').join(', ')
      };
      await inventoryApi.update(editForm.barcode, payload);
      setShowEditModal(false);
      await loadData();
    } catch {
      alert('Failed to update item');
    }
    setSaving(false);
  };

  const handleExport = () => {
    const headers = ['Item Name', 'Model Number', 'Serial Numbers', 'Purchase Price', 'Selling Price', 'Tax %', 'Min Stock'];
    const rows = items.map(i => [
      i.item_name,
      i.model_number,
      (i.serial_numbers || []).join('|'),
      i.purchase_price,
      i.selling_price,
      i.tax_percentage,
      i.minimum_stock_level
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `inventory_master_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTemplate = () => {
    const headers = ['item_name', 'model_number', 'serial_numbers', 'purchase_price', 'selling_price', 'tax_percentage', 'opening_quantity', 'minimum_stock_level'];
    const sample = ['Sample Item', 'MODEL-123', 'SN123|SN124|SN125', '1000', '1500', '18', '5', '2'];
    const csvContent = [headers, sample].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim() !== '');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj = {};
          headers.forEach((h, i) => {
            if (h === 'serial_numbers') {
              obj[h] = values[i] ? values[i].split('|') : [];
            } else if (['purchase_price', 'selling_price', 'tax_percentage', 'opening_quantity', 'minimum_stock_level'].includes(h)) {
              obj[h] = parseFloat(values[i]) || 0;
            } else {
              obj[h] = values[i];
            }
          });
          // Add default barcode if missing
          if (!obj.barcode) obj.barcode = `BULK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          return obj;
        });

        setSaving(true);
        await inventoryApi.bulkUpload(data);
        alert('Bulk upload successful!');
        await loadData();
      } catch (err) {
        console.error(err);
        alert('Error parsing or uploading file. Ensure format matches template.');
      }
      setSaving(false);
    };
    reader.readAsText(file);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, sumRes, staffRes, custRes] = await Promise.allSettled([
        inventoryApi.list(),
        inventoryApi.summary(),
        staffApi.list(),
        customersApi.list()
      ]);

      setItems(itemsRes.status === 'fulfilled' ? (itemsRes.value.data || []) : []);
      setSummary(sumRes.status === 'fulfilled' ? sumRes.value.data : null);
      setStaff(staffRes.status === 'fulfilled' ? (staffRes.value.data || []) : []);
      setCustomers(custRes.status === 'fulfilled' ? (custRes.value.data?.customers || custRes.value.data || []) : []);

      if (activeTab === 'log') {
        const txRes = await inventoryApi.transactions(200);
        setTransactions(txRes.data);
      } else if (activeTab === 'summary') {
        const ssRes = await inventoryApi.stockSummary();
        setStockSummary(ssRes.data);
      } else if (activeTab === 'sold') {
        const sdRes = await inventoryApi.soldDetails();
        setSoldDetails(sdRes.data);
      }
    } catch (e) {
      console.error('Failed to load inventory data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    if (!logForm.model_number || !logForm.quantity_changed) return alert('Select an Item and enter Quantity');

    // Resolve barcode
    const matchedItem = items.find(i => i.model_number === logForm.model_number || i.item_name === logForm.model_number || i.barcode === logForm.model_number);
    if (!matchedItem) return alert('No item found matching that search term');

    try {
      const payload = {
        ...logForm,
        barcode: matchedItem.barcode,
        quantity_changed: logForm.transaction_type === 'STOCK_OUT' ? -Math.abs(logForm.quantity_changed) : Math.abs(logForm.quantity_changed)
      };
      await inventoryApi.adjust(matchedItem.barcode, payload);
      alert('Transaction logged successfully');
      setLogForm({ model_number: '', barcode: '', quantity_changed: 0, transaction_type: 'STOCK_IN', staff_id: '', customer_details: '', amount_paid: 0, remarks: '' });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to log transaction');
    }
  };

  const formatCurrency = (val) => `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

  if (loading && !summary) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="inventory-container animate-fade">
      <div className="inventory-tabs">
        <div className={`inventory-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><MdInventory /> Dashboard</div>
        <div className={`inventory-tab ${activeTab === 'master' ? 'active' : ''}`} onClick={() => setActiveTab('master')}><MdAdd /> Items Master</div>
        <div className={`inventory-tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}><MdHistory /> Transactions Log</div>
        <div className={`inventory-tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}><MdSummarize /> Stock Summary</div>
        <div className={`inventory-tab ${activeTab === 'sold' ? 'active' : ''}`} onClick={() => setActiveTab('sold')}><MdSell /> Item Sold Details</div>
      </div>

      {activeTab === 'dashboard' && (() => {
        const groupedItems = Object.values(
          items.reduce((acc, item) => {
            const key = item.model_number || item.barcode;
            if (!acc[key]) {
              acc[key] = { ...item, current_quantity: 0 };
            }
            acc[key].current_quantity += item.current_quantity;
            return acc;
          }, {})
        );
        const lowStockItems = groupedItems.filter(i => i.current_quantity <= (i.minimum_stock_level || 0));

        return (
          <div className="tab-content">
            <div className="inv-stat-grid">
              <div className="inv-stat-card">
                <div className="inv-stat-label">Total Purchase Stock Value</div>
                <div className="inv-stat-value cell-highlight">{formatCurrency(summary?.total_purchase_value)}</div>
              </div>
              <div className="inv-stat-card">
                <div className="inv-stat-label">Total Selling Stock Value</div>
                <div className="inv-stat-value cell-highlight">{formatCurrency(summary?.total_selling_value)}</div>
              </div>
              <div className="inv-stat-card">
                <div className="inv-stat-label" style={{ color: lowStockItems.length > 0 ? '#ef4444' : 'inherit' }}>
                  Low Stock Items
                </div>
                <div className="inv-stat-value" style={{ color: lowStockItems.length > 0 ? '#ef4444' : 'inherit' }}>
                  {lowStockItems.length}
                </div>
              </div>
              <div className="inv-stat-card">
                <div className="inv-stat-label">Total Quantity in Stock</div>
                <div className="inv-stat-value cell-highlight">{summary?.total_quantity}</div>
              </div>
            </div>

            {lowStockItems.length > 0 ? (
              <div style={{ marginBottom: 32 }}>
                <h3 style={{ color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 2s infinite' }}></span>
                  Low Stock Alerts
                </h3>
                <div className="excel-table-container" style={{ border: '2px solid #fee2e2' }}>
                  <table className="excel-table">
                    <thead style={{ backgroundColor: '#fee2e2' }}>
                      <tr>
                        <th style={{ backgroundColor: '#ef4444' }}>Model Number</th>
                        <th style={{ backgroundColor: '#ef4444' }}>Item Name</th>
                        <th style={{ backgroundColor: '#ef4444' }}>Current Stock</th>
                        <th style={{ backgroundColor: '#ef4444' }}>Min Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems.map(item => (
                        <tr key={item.model_number || item.barcode} style={{ backgroundColor: '#fef2f2' }}>
                          <td className="cell-bold">{item.model_number || '-'}</td>
                          <td>{item.item_name}</td>
                          <td className="cell-negative">({item.current_quantity})</td>
                          <td style={{ fontWeight: 600 }}>{item.minimum_stock_level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="inv-form-card" style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
                <h3 style={{ color: '#166534' }}>Stock is Healthy</h3>
                <p style={{ color: '#15803d' }}>All items are currently above their minimum stock levels.</p>
              </div>
            )}
          </div>
        );
      })()}

      {activeTab === 'master' && (
        <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
              <button className="btn btn-secondary" onClick={handleExport} title="Export to CSV">
                <MdFileDownload /> Export
              </button>
              <div style={{ position: 'relative' }}>
                <button className="btn btn-secondary" onClick={() => document.getElementById('bulk-input').click()} title="Bulk Upload CSV">
                  <MdCloudUpload /> Bulk Upload
                </button>
                <input id="bulk-input" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleBulkUpload} />
                <button
                  onClick={downloadTemplate}
                  style={{ position: 'absolute', top: '100%', right: 0, background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.7rem', cursor: 'pointer', padding: '4px 0' }}
                >
                  Download Template
                </button>
              </div>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <MdAdd /> Create New Item
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: '400px' }}>
            {/* Left Sidebar - Item List */}
            <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
              <div className="search-box-container" style={{ position: 'relative' }}>
                <MdSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search items, models or serials..."
                  style={{ paddingLeft: 40 }}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', maxHeight: '500px' }}>
                {items
                  .filter(item =>
                    (item.item_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.model_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.barcode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.serial_number || '').toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(item => (
                    <div
                      key={item.barcode}
                      onClick={() => setSelectedItem(item)}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #e2e8f0',
                        background: selectedItem?.barcode === item.barcode ? '#e0f2fe' : 'transparent',
                        borderLeft: selectedItem?.barcode === item.barcode ? '4px solid #0284c7' : '4px solid transparent',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.item_name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Model: {item.model_number}</div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Right Side - Details Table */}
            <div style={{ flex: 1, overflowX: 'auto' }}>
              {selectedItem ? (
                <div className="excel-table-container">
                  <h3 style={{ marginBottom: '16px', color: '#334155' }}>Details for {selectedItem.item_name}</h3>
                  <table className="excel-table">
                    <thead>
                      <tr>
                        <th>Date of Purchase</th>
                        <th>Serial Number</th>
                        <th>Purchase Price</th>
                        <th>Selling Price</th>
                        <th>Profit</th>
                        <th>Tax Value</th>
                        <th>Initial Qty</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const profit = selectedItem.selling_price - selectedItem.purchase_price;
                        const taxPct = selectedItem.tax_percentage || 18;
                        const taxVal = selectedItem.selling_price * (taxPct / 100);
                        return (
                          <tr>
                            <td style={{ fontSize: '0.85rem' }}>{formatDate(selectedItem.created_at)}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {selectedItem.serial_numbers && selectedItem.serial_numbers.length > 0
                                ? selectedItem.serial_numbers.map((sn, i) => (
                                    <span key={i} style={{ display: 'inline-block', background: '#f1f5f9', color: '#475569', borderRadius: 4, padding: '2px 6px', margin: '2px', border: '1px solid #cbd5e1' }}>{sn}</span>
                                  ))
                                : selectedItem.serial_number || '-'
                              }
                            </td>
                            <td style={{ fontWeight: 500 }}>{formatCurrency(selectedItem.purchase_price)}</td>
                            <td style={{ fontWeight: 500 }}>{formatCurrency(selectedItem.selling_price)}</td>
                            <td style={{ fontWeight: 600, color: profit >= 0 ? '#16a34a' : '#dc2626' }}>{formatCurrency(profit)}</td>
                            <td>{formatCurrency(taxVal)}</td>
                            <td className="cell-bold">{selectedItem.opening_quantity}</td>
                            <td>
                              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => handleEditClick(selectedItem)}>
                                <MdEdit style={{ marginRight: '4px' }} /> Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                  <p style={{ marginTop: 12, fontSize: '0.8rem', fontStyle: 'italic', color: '#64748b' }}>
                    * Item ID ({selectedItem.barcode}) is generated automatically. Tax % is user input; Profit and Tax Value calculate automatically.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', backgroundColor: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
                  <div style={{ textAlign: 'center' }}>
                    <MdInventory style={{ fontSize: '3rem', color: '#94a3b8', marginBottom: '8px' }} />
                    <p>Select an item from the left to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Create New Item</h3>
              <button className="btn-icon" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Item ID (Auto-generated)</label>
                  <input className="form-input" value={`BTLC${(items.length + 1).toString().padStart(2, '0')}`} disabled style={{ background: '#f1f5f9' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Item Name</label>
                  <input
                    className="form-input"
                    list="existing-item-names"
                    value={createForm.item_name}
                    onChange={e => {
                      const val = e.target.value;
                      const existingItem = items.find(i => i.item_name === val);
                      setCreateForm({
                        ...createForm,
                        item_name: val,
                        model_number: existingItem ? existingItem.model_number : createForm.model_number
                      });
                    }}
                    placeholder="e.g. 2MP Camera"
                  />
                  <datalist id="existing-item-names">
                    {[...new Set(items.map(i => i.item_name).filter(Boolean))].map((name, idx) => (
                      <option key={idx} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Model Number <span style={{ color: 'red' }}>*</span></label>
                  <input className="form-input" value={createForm.model_number} onChange={e => setCreateForm({...createForm, model_number: e.target.value})} placeholder="e.g. DS-2CE..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Price</label>
                  <input type="number" className="form-input" value={createForm.purchase_price} onChange={e => setCreateForm({...createForm, purchase_price: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price</label>
                  <input type="number" className="form-input" value={createForm.selling_price} onChange={e => setCreateForm({...createForm, selling_price: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax %</label>
                  <input type="number" className="form-input" value={createForm.tax_percentage} onChange={e => setCreateForm({...createForm, tax_percentage: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Initial Quantity</label>
                  <input type="number" min="1" className="form-input" value={createForm.opening_quantity} onChange={e => handleQtyChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Stock Level (Alert Quantity)</label>
                  <input type="number" className="form-input" value={createForm.minimum_stock_level} onChange={e => setCreateForm({...createForm, minimum_stock_level: parseFloat(e.target.value) || 0})} />
                </div>
              </div>

              {/* Serial Number Multi-Entry */}
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Serial Numbers
                    <span style={{ marginLeft: 8, fontSize: '0.8rem', fontWeight: 500,
                      color: serialNumbers.filter(s => s.trim()).length === createForm.opening_quantity ? 'green' : 'orange' }}>
                      ({serialNumbers.filter(s => s.trim()).length} / {createForm.opening_quantity} entered)
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '4px 12px', fontSize: '0.85rem' }}
                    onClick={addSerial}
                    disabled={serialNumbers.length >= createForm.opening_quantity}
                  >
                    + Add
                  </button>
                </div>
                {serialNumbers.map((sn, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <span style={{ minWidth: 24, color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>#{idx + 1}</span>
                    <input
                      className="form-input"
                      style={{ flex: 1 }}
                      value={sn}
                      onChange={e => updateSerial(idx, e.target.value)}
                      placeholder={`Scan or type serial #${idx + 1}...`}
                      autoFocus={idx === serialNumbers.length - 1 && idx > 0}
                    />
                    {serialNumbers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSerial(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }}
                      >✕</button>
                    )}
                  </div>
                ))}
                {serialNumbers.filter(s => s.trim()).length !== createForm.opening_quantity && (
                  <p style={{ color: '#f59e0b', fontSize: '0.8rem', margin: '4px 0 0' }}>
                    ⚠ Serial number count must match Initial Quantity ({createForm.opening_quantity}) before saving.
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowCreateModal(false); setSerialNumbers(['']); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateItem} disabled={saving}>
                {saving ? 'Creating...' : 'Create Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editForm && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Item: {editForm.barcode}</h3>
              <button className="btn-icon" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Item Name</label>
                  <input className="form-input" value={editForm.item_name} onChange={e => setEditForm({...editForm, item_name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Model Number</label>
                  <input className="form-input" value={editForm.model_number} onChange={e => setEditForm({...editForm, model_number: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Price</label>
                  <input type="number" className="form-input" value={editForm.purchase_price} onChange={e => setEditForm({...editForm, purchase_price: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price</label>
                  <input type="number" className="form-input" value={editForm.selling_price} onChange={e => setEditForm({...editForm, selling_price: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax %</label>
                  <input type="number" className="form-input" value={editForm.tax_percentage} onChange={e => setEditForm({...editForm, tax_percentage: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Stock Level</label>
                  <input type="number" className="form-input" value={editForm.minimum_stock_level} onChange={e => setEditForm({...editForm, minimum_stock_level: parseFloat(e.target.value) || 0})} />
                </div>
              </div>

              {/* Edit Serial Numbers */}
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <label className="form-label">Serial Numbers</label>
                {editSerials.map((sn, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <span style={{ minWidth: 24, color: '#64748b', fontSize: '0.85rem' }}>#{idx + 1}</span>
                    <input
                      className="form-input"
                      style={{ flex: 1 }}
                      value={sn}
                      onChange={e => {
                        const newSerials = [...editSerials];
                        newSerials[idx] = e.target.value;
                        setEditSerials(newSerials);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpdateItem} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'log' && (
        <div className="tab-content">
          <div className="inv-form-card">
            <h3 style={{ marginBottom: 16 }}>Log New Transaction</h3>
            <form onSubmit={handleLogSubmit} className="inv-input-group">
              <div className="form-group">
                <label className="form-label">Search Item</label>
                <input
                  className="form-input"
                  list="log-item-search"
                  value={logForm.model_number}
                  onChange={e => setLogForm({...logForm, model_number: e.target.value})}
                  placeholder="Search by model, name or barcode..."
                />
                <datalist id="log-item-search">
                  {items.map(i => (
                    <option key={i.barcode} value={i.model_number}>{i.item_name} ({i.barcode})</option>
                  ))}
                  {items.map(i => (
                    <option key={i.barcode + '_name'} value={i.item_name}>{i.model_number}</option>
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={logForm.transaction_type} onChange={e => setLogForm({...logForm, transaction_type: e.target.value})}>
                  <option value="STOCK_IN">STOCK IN</option>
                  <option value="STOCK_OUT">STOCK OUT</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input type="number" className="form-input" value={logForm.quantity_changed} onChange={e => setLogForm({...logForm, quantity_changed: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Staff</label>
                <select className="form-input" value={logForm.staff_id} onChange={e => setLogForm({...logForm, staff_id: e.target.value})}>
                  <option value="">Select Staff</option>
                  {staff.map(s => <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.staff_id})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Customer Name</label>
                <select className="form-input" value={logForm.customer_details} onChange={e => setLogForm({...logForm, customer_details: e.target.value})}>
                  <option value="">Select Customer</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_name}>{c.customer_name} — {c.phone_number}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Amount Paid</label>
                <input type="number" className="form-input" value={logForm.amount_paid} onChange={e => setLogForm({...logForm, amount_paid: e.target.value})} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Submit Entry</button>
              </div>
            </form>
          </div>

          <div className="excel-table-container">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Model Number</th>
                  <th>Serial Number</th>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>In / Out</th>
                  <th>Staff</th>
                  <th>Current Stock</th>
                  <th>Customer</th>
                  <th>Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => {
                  const itm = items.find(i => i.barcode === t.barcode);
                  const isIn = t.transaction_type === 'STOCK_IN' || t.quantity_changed > 0;
                  return (
                    <tr key={t._id}>
                      <td style={{ fontSize: '0.8rem' }}>{formatDate(t.transaction_datetime)}</td>
                      <td className="cell-bold">{itm?.model_number || t.barcode}</td>
                      <td>{t.serial_number || itm?.serial_number || '-'}</td>
                      <td>{itm?.item_name || '-'}</td>
                      <td>{Math.abs(t.quantity_changed)}</td>
                      <td style={{ color: isIn ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                        {isIn ? 'IN' : 'OUT'}
                      </td>
                      <td>{t.linked_technician_id || t.done_by_user_id}</td>
                      <td>{t.balance_after_transaction}</td>
                      <td>{t.customer_details || '-'}</td>
                      <td>{formatCurrency(t.amount_paid)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="tab-content">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className={`btn ${showSummaryFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowSummaryFilters(!showSummaryFilters)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <MdFilterList /> {showSummaryFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
          <div className="excel-table-container">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Model Number</th>
                  <th>Item Name</th>
                  <th>Initial Qty</th>
                  <th>Transactions</th>
                  <th>Current Stock</th>
                  <th>Low Stock</th>
                </tr>
                {showSummaryFilters && (
                  <tr className="filter-row">
                    <th><input className="filter-input" placeholder="Filter..." value={summaryFilters.model_number} onChange={e => setSummaryFilters({...summaryFilters, model_number: e.target.value})} /></th>
                    <th><input className="filter-input" placeholder="Filter..." value={summaryFilters.item_name} onChange={e => setSummaryFilters({...summaryFilters, item_name: e.target.value})} /></th>
                    <th><input className="filter-input" placeholder="Filter..." value={summaryFilters.initial_quantity} onChange={e => setSummaryFilters({...summaryFilters, initial_quantity: e.target.value})} /></th>
                    <th><input className="filter-input" placeholder="Filter..." value={summaryFilters.total_transactions} onChange={e => setSummaryFilters({...summaryFilters, total_transactions: e.target.value})} /></th>
                    <th><input className="filter-input" placeholder="Filter..." value={summaryFilters.current_stock} onChange={e => setSummaryFilters({...summaryFilters, current_stock: e.target.value})} /></th>
                    <th>
                      <select className="filter-input" value={summaryFilters.low_stock} onChange={e => setSummaryFilters({...summaryFilters, low_stock: e.target.value})}>
                        <option value="">All</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </th>
                  </tr>
                )}
              </thead>
              <tbody>
                {stockSummary
                  .filter(s =>
                    s.model_number.toLowerCase().includes(summaryFilters.model_number.toLowerCase()) &&
                    s.item_name.toLowerCase().includes(summaryFilters.item_name.toLowerCase()) &&
                    s.initial_quantity.toString().includes(summaryFilters.initial_quantity) &&
                    s.total_transactions.toString().includes(summaryFilters.total_transactions) &&
                    s.current_stock.toString().includes(summaryFilters.current_stock) &&
                    (summaryFilters.low_stock === '' || s.low_stock === summaryFilters.low_stock)
                  )
                  .map(s => (
                    <tr key={s.model_number}>
                      <td className="cell-bold">{s.model_number}</td>
                      <td>{s.item_name}</td>
                      <td>{s.initial_quantity}</td>
                      <td style={{ color: s.total_transactions < 0 ? 'red' : 'inherit' }}>
                        {s.total_transactions < 0 ? `(${Math.abs(s.total_transactions)})` : s.total_transactions}
                      </td>
                      <td className="cell-bold">{s.current_stock}</td>
                      <td style={{ fontWeight: 700, color: s.low_stock === 'YES' ? 'red' : 'green' }}>
                        {s.low_stock}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'sold' && (
        <div className="tab-content">
          <div className="excel-table-container">
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Customer Name & Details</th>
                  <th>Staff ID</th>
                  <th>Amount Paid</th>
                  <th>Profit</th>
                  <th>Item Details</th>
                </tr>
              </thead>
              <tbody>
                {soldDetails.map(t => {
                  const qty = Math.abs(t.quantity_changed);
                  const revenue = t.amount_paid || (qty * t.selling_price);
                  const cost = qty * t.purchase_price;
                  const profit = revenue - cost;
                  return (
                    <tr key={t._id}>
                      <td style={{ fontSize: '0.8rem' }}>{formatDate(t.transaction_datetime)}</td>
                      <td>{t.customer_details || '-'}</td>
                      <td>{t.linked_technician_id || t.done_by_user_id}</td>
                      <td>{formatCurrency(t.amount_paid)}</td>
                      <td style={{ color: profit < 0 ? 'red' : 'green', fontWeight: 700 }}>
                        {profit < 0 ? `(${Math.abs(profit).toLocaleString()})` : formatCurrency(profit)}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{t.item_name} ({t.barcode}) x {qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
