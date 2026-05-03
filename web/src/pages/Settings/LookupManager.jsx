import { useEffect, useState } from 'react';
import { lookupsApi } from '../../api';
import { MdAdd } from 'react-icons/md';

const LIST_TYPES = [
  { key: 'service_types', label: '🔧 Service Types' },
  { key: 'priority_levels', label: '🚨 Priority Levels' },
  { key: 'status_options', label: '📊 Status Options' },
  { key: 'payment_modes', label: '💳 Payment Modes' },
];

export default function LookupManager() {
  const [lookups, setLookups] = useState({});
  const [activeTab, setActiveTab] = useState('service_types');
  const [newItem, setNewItem] = useState({ value: '', label: '' });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const all = {};
    for (const { key } of LIST_TYPES) {
      const res = await lookupsApi.get(`${key}/all`).catch(async () => lookupsApi.get(key));
      all[key] = res.data.items || [];
    }
    setLookups(all);
  };

  const addItem = async () => {
    if (!newItem.value || !newItem.label) return;
    setSaving(true);
    try {
      await lookupsApi.add(activeTab, newItem);
      await load();
      setNewItem({ value: '', label: '' });
      setAdding(false);
    } finally { setSaving(false); }
  };

  const toggleItem = async (value, isActive) => {
    await lookupsApi.toggle(activeTab, value, !isActive);
    await load();
  };

  const currentItems = lookups[activeTab] || [];

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Lookup Settings</h2>
          <p>Manage dropdown values used throughout the app</p>
        </div>
      </div>

      <div className="tabs">
        {LIST_TYPES.map(({ key, label }) => (
          <button key={key} className={`tab-btn ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{LIST_TYPES.find(t => t.key === activeTab)?.label}</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><MdAdd /> Add Item</button>
        </div>

        {adding && (
          <div style={{ background: 'var(--color-surface-2)', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Value (code)</label>
              <input className="form-input" placeholder="e.g. fiber_optic" value={newItem.value}
                onChange={e => setNewItem(n => ({ ...n, value: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Display Label</label>
              <input className="form-input" placeholder="e.g. Fiber Optic Installation" value={newItem.label}
                onChange={e => setNewItem(n => ({ ...n, label: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={addItem} disabled={saving}>{saving ? 'Adding...' : 'Add'}</button>
            <button className="btn btn-secondary" onClick={() => { setAdding(false); setNewItem({ value: '', label: '' }); }}>Cancel</button>
          </div>
        )}

        <div className="table-wrapper" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr><th>Value</th><th>Display Label</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {currentItems.map(item => (
                <tr key={item.value}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--color-accent)' }}>{item.value}</td>
                  <td style={{ fontWeight: 500 }}>{item.label}</td>
                  <td><span className={`badge badge-${item.is_active ? 'active' : 'inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <button className={`btn btn-sm ${item.is_active ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => toggleItem(item.value, item.is_active)}>
                      {item.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {currentItems.length === 0 && <div className="empty-state" style={{ padding: 24 }}><p>No items in this list</p></div>}
        </div>
      </div>
    </div>
  );
}
