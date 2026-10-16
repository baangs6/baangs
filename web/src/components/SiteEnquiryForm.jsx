import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MdArrowForward, MdCheckCircle } from 'react-icons/md';
import { publicApi } from '../api';

export default function SiteEnquiryForm() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState('');
  const submit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const digits = String(form.get('phone')).replace(/\D/g, '');
    const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    const name = String(form.get('name')).trim();
    const notes = String(form.get('notes')).trim();
    if (phone.length !== 10 || !name || !notes) {
      setError('Enter your name, a 10-digit mobile number, and your location or requirements.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await publicApi.registerComplaint({
        customer_name: name, phone_number: phone, location: notes, site_type: form.get('property'),
        work_type: form.get('service') === 'CCTV repair & service' ? 'repair' : 'inspection',
        complaint: `${form.get('service')}: ${notes}`, priority: 'medium',
      });
      if (!data.success || !data.job_id) throw new Error('Request was not confirmed');
      setTicket(data.job_id);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'We could not submit your request. Please try again or call our team.');
    } finally { setSaving(false); }
  };
  return <div className="site-enquiry">
    {ticket ? <div role="status" className="site-enquiry-success"><MdCheckCircle /><h3>Request received.</h3>
      <p>Our team will contact you about your requirements.</p><strong>{ticket}</strong>
      <Link className="site-text-link" to={`/track/${encodeURIComponent(ticket)}`}>Track your request <MdArrowForward /></Link>
    </div> : <form onSubmit={submit} aria-labelledby="site-enquiry-title">
      <h3 id="site-enquiry-title">Request a Site Evaluation</h3><p>Tell us about your space. Our team will help plan the right solution.</p>
      {error && <p className="site-enquiry-error" role="alert">{error}</p>}
      <fieldset disabled={saving}><div className="site-enquiry-grid">
        <label>Full Name <span>*</span><input name="name" autoComplete="name" placeholder="e.g. Ramesh Kumar" maxLength={100} required /></label>
        <label>Phone Number <span>*</span><input name="phone" type="tel" autoComplete="tel" placeholder="+91 83300 33280" maxLength={18} required /></label>
        <label>Service Required<select name="service">{['New CCTV camera installation', 'CCTV repair & service', 'Home automation', 'Automated gates', 'Boom barriers', 'UPS & power backup'].map(service => <option key={service}>{service}</option>)}</select></label>
        <label>Property Type<select name="property"><option value="Residence">Residential Home / Villa</option><option value="Shop">Retail Store / Shop</option><option value="Office">Office / Workplace</option><option value="Industrial">Industrial / Warehouse</option></select></label>
        <label className="site-enquiry-notes">Location &amp; Notes <span>*</span><textarea name="notes" rows={3} maxLength={1500} placeholder="Your location and a little detail about your requirements" required /></label>
      </div><button className="site-button" type="submit">{saving ? 'Submitting...' : 'Submit Request'} <MdArrowForward /></button></fieldset>
    </form>}
  </div>;
}
