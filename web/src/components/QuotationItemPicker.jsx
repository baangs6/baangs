import { useEffect, useState } from 'react';
import { inventoryApi } from '../api';
import { formatDate } from '../utils/dateFormat';

const price = n => n == null ? 'Unavailable' : `Rs ${Number(n).toLocaleString('en-IN', { maximumFractionDigits:2 })}`;
export default function QuotationItemPicker({ item, inventory, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const selected = inventory.find(i => item.inventory_barcode ? i.barcode === item.inventory_barcode : i.item_name === item.name && (i.model_number || '') === (item.model || ''));
  const barcode = selected?.barcode;
  useEffect(() => {
    let active = true;
    if (!barcode) return;
    inventoryApi.priceHistory(barcode).then(({data}) => { if (active) { setHistory(data); setError(''); } })
      .catch(() => { if (active) setError('Unable to load price history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [barcode]);
  const matches = inventory.filter(i => `${i.item_name} ${i.model_number} ${i.barcode}`.toLowerCase().includes(item.name.toLowerCase()));
  const choose = match => {
    setHistory(null); setError(''); setLoading(true); setExpanded(false);
    onChange({ name:match.item_name, inventory_barcode:match.barcode, model:match.model_number || '', unit:match.unit_type || 'Nos', unit_price:match.selling_price || 0 });
    if (match.barcode === barcode) setLoading(false);
  };
  return <div className="quote-wide">
    <label className="form-group">Item / service<input required maxLength={200} className="form-input" value={item.name} onFocus={() => setExpanded(true)} onChange={e => {
      setExpanded(true); setHistory(null); setError(''); onChange({name:e.target.value, inventory_barcode:null});
    }} onKeyDown={e => { if (e.key === 'Escape') setExpanded(false); }} /></label>
    {expanded && <div className="table-wrapper" style={{maxHeight:240,overflow:'auto', marginTop:8}}><table className="table"><thead><tr><th>Item / Model</th><th>Selling price</th><th>Purchase price</th></tr></thead><tbody>
      {matches.map(match => <tr key={match.barcode}><td><button type="button" className="quote-link" onClick={() => choose(match)}>{match.item_name} ({match.model_number || match.barcode})</button></td><td>{price(match.selling_price)}</td><td>{price(match.purchase_price)}</td></tr>)}
    </tbody></table>{!matches.length && <p>No matching inventory items. You can enter a manual item.</p>}
      <button type="button" className="btn btn-secondary" onClick={() => setExpanded(false)}>Close</button>
    </div>}
    {barcode && <div style={{ marginTop:12 }}>
      <strong>Current prices: Selling {price(selected.selling_price)} | Purchase {price(selected.purchase_price)}</strong>
      {loading ? <p role="status">Loading price history...</p> : error ? <p role="alert">{error}</p> : history?.barcode === barcode && <div className="quote-fields" style={{marginTop:8}}>
        {[['selling','Last 3 selling prices'],['purchase','Last 3 recorded purchase prices']].map(([key,label]) => <div key={key}><strong>{label}</strong>
          {history[key].length ? <table className="table"><thead><tr><th>Date</th><th>Unit price</th><th>Reference</th></tr></thead><tbody>{history[key].map((entry,i) => <tr key={i}><td>{formatDate(entry.date)}</td><td>{price(entry.price)}</td><td>{entry.reference}</td></tr>)}</tbody></table> : <p>No recorded prices available.</p>}
        </div>)}
      </div>}
    </div>}
  </div>;
}
