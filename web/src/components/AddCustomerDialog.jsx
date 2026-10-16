import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, House, Building2, Factory, Building, LocateFixed, Clipboard, UserRound } from 'lucide-react';
import './AddCustomerDialog.css';

export default function AddCustomerDialog({ data, onChange, onSubmit, onClose, saving, error }) {
  const dialog = useRef(null);
  const [mapError, setMapError] = useState('');
  const [locating, setLocating] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const set = (key, value) => onChange(previous => ({ ...previous, [key]: value }));
  const locate = () => {
    setMapError('');
    if (!navigator.geolocation) { setMapError('Location is unavailable. Enter a map link instead.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      set('map_location', `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`);
      setLocating(false);
    }, () => { setMapError('Location access failed. Enter a map link instead.'); setLocating(false); }, { timeout: 10000 });
  };
  const paste = async () => {
    try { set('map_location', await navigator.clipboard.readText()); setMapError(''); }
    catch { setMapError('Clipboard access failed. Paste the map link into the field.'); }
  };
  return <dialog ref={dialog} className="customer-create-dialog" aria-labelledby="customer-create-title" onCancel={event => { if (saving) event.preventDefault(); else onClose(); }}>
    <form onSubmit={onSubmit}>
      <header className="customer-create-header"><div><span className="customer-create-eyebrow">Customer Directory</span><h3 id="customer-create-title">Add New Customer</h3></div><button type="button" className="btn btn-secondary btn-icon" aria-label="Close add customer" title="Close" disabled={saving} onClick={onClose}><X size={18} /></button></header>
      <div className="customer-create-layout">
        <fieldset className="customer-create-fields" disabled={saving}>
          {error && <p role="alert" className="customer-create-error">{error}</p>}
          <section><h4>Client Identity & Internal Alias <span>01 / 03</span></h4><div className="customer-create-grid">
            <label>Customer Name *<input className="form-input" required maxLength={200} autoFocus value={data.customer_name} onChange={event => set('customer_name', event.target.value)} autoComplete="name" /></label>
            <label>Nickname (internal)<input className="form-input" maxLength={80} value={data.nickname} onChange={event => set('nickname', event.target.value)} /></label>
          </div></section>
          <section><h4>Communication & Contact Records <span>02 / 03</span></h4><div className="customer-create-grid">
            <label>Phone Number *<input className="form-input" type="tel" required pattern="[+]?[0-9 ]{7,20}" title="Enter 7 to 20 digits, with an optional country code and spaces" value={data.phone_number} onChange={event => set('phone_number', event.target.value)} autoComplete="tel" /></label>
            <label>Alternative Phone Number<input className="form-input" type="tel" pattern="[+]?[0-9 ]{7,20}" value={data.alternative_phone_number} onChange={event => set('alternative_phone_number', event.target.value)} /></label>
          </div></section>
          <section><h4>Site Type & Geographic Coordinates <span>03 / 03</span></h4>
            <fieldset className="customer-create-site"><legend>Installation Facility Type</legend>
              <label><input type="radio" name="site_type" value="Residential" checked={data.site_type === 'Residential'} onChange={event => set('site_type', event.target.value)} /><House size={18} /> Residential / Home</label>
              <label><input type="radio" name="site_type" value="Commercial" checked={data.site_type === 'Commercial'} onChange={event => set('site_type', event.target.value)} /><Building2 size={18} /> Commercial Office</label>
              <label><input type="radio" name="site_type" value="Industrial" checked={data.site_type === 'Industrial'} onChange={event => set('site_type', event.target.value)} /><Factory size={18} /> Industrial / Plant</label>
              <label><input type="radio" name="site_type" value="Apartment" checked={data.site_type === 'Apartment'} onChange={event => set('site_type', event.target.value)} /><Building size={18} /> Apartment / Villa</label>
            </fieldset>
            <label>Location / Landmark<input className="form-input" value={data.location} onChange={event => set('location', event.target.value)} autoComplete="street-address" /></label>
            <div className="customer-create-map-heading"><label htmlFor="customer-create-map">Map Location (URL)</label><button type="button" className="btn btn-secondary btn-sm" onClick={locate} disabled={locating}><LocateFixed size={15} /> {locating ? 'Locating...' : 'Detect Current GPS'}</button></div>
            <div className="customer-create-map"><input id="customer-create-map" className="form-input" placeholder="Google Maps link or coordinates" value={data.map_location} onChange={event => set('map_location', event.target.value)} /><button type="button" className="btn btn-secondary" onClick={paste}><Clipboard size={15} /> Paste Link</button></div>
            {mapError && <p role="status" className="customer-create-error">{mapError}</p>}
          </section>
        </fieldset>
        <aside className="customer-create-preview" aria-label="Customer summary"><h4>Customer Summary</h4><div className="customer-create-preview-identity"><span aria-hidden="true"><UserRound size={25} /></span><div><strong>{data.customer_name || 'New Customer'}</strong><small>{data.nickname || 'No internal nickname'}</small></div></div>
          <dl>{[['Site Type', data.site_type], ['Primary Contact', data.phone_number], ['Alternative Contact', data.alternative_phone_number], ['Location', data.location], ['Map Location', data.map_location]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '-'}</dd></div>)}</dl>
          <div className="customer-create-actions"><button className="btn btn-primary" type="submit" disabled={saving}><CheckCircle2 size={18} />{saving ? 'Saving...' : 'Create Customer'}</button><button className="btn btn-secondary" type="button" disabled={saving} onClick={onClose}>Cancel</button></div>
        </aside>
      </div>
    </form>
  </dialog>;
}
