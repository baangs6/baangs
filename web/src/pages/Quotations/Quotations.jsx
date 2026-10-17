import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { TrendingUp, ClipboardClock, BadgeCheck, Banknote, Download, Printer, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { MdAdd, MdArrowBack, MdDeleteOutline, MdDownload, MdEdit, MdSave, MdContentCopy, MdMoreVert } from 'react-icons/md';
import { FaWhatsapp } from 'react-icons/fa';
import { quotationsApi, customersApi, inventoryApi } from '../../api';
import { useAuth } from '../../context/useAuth';
import { formatDate } from '../../utils/dateFormat';
import './quotations.css';
import './QuotationDashboard.css';
import './QuotationEstimate.css';
import QuotationItemPicker from '../../components/QuotationItemPicker';
import DateRangePicker from '../../components/DateRangePicker';
import QuotationCustomerPicker from '../../components/QuotationCustomerPicker';
import QuotationCustomerFollowup from '../../components/QuotationCustomerFollowup';

const TERMS = 'Payment: 50% advance before work commences; remaining 50% on completion.\nInstallation: Cable laying will be measured and billed as actuals in the final invoice.\nWarranty: As specified against each item, from the date of purchase.\nWarranty excludes damage from lightning, power surges, floods, physical damage, glass breakage and unauthorized tampering.';
const newItem = () => ({ name: '', description: '', hsn: '', serial_number: '', model: '', warranty: '', unit: 'Nos', quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 0 });
const newQuote = () => ({ customer_id: null, customer_name: '', billing_name: '', phone_number: '', address: '', gstin: '', state_of_supply: '', quote_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), validity_days: 10, status: 'draft', items: [newItem()], terms: TERMS, notes: '', round_off: false });
const rupees = n => `Rs ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function errorText(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join('; ') : 'Unable to complete the request. Please try again.';
}
function totals(items, roundOff) {
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const result = items.reduce((acc, item) => {
    const gross = round(Number(item.quantity || 0) * Number(item.unit_price || 0));
    const discount = round(gross * Number(item.discount_percent || 0) / 100);
    const tax = round((gross - discount) * Number(item.tax_percent || 0) / 100);
    return { subtotal: round(acc.subtotal + gross), discount: round(acc.discount + discount), tax: round(acc.tax + tax) };
  }, { subtotal: 0, discount: 0, tax: 0 });
  const raw = round(result.subtotal - result.discount + result.tax);
  return { ...result, total: roundOff ? Math.round(raw) : raw, adjustment: roundOff ? round(Math.round(raw) - raw) : 0 };
}

export default function Quotations() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [params] = useSearchParams();
  const quoteParam = params.get('quote');
  const { user } = useAuth();
  const allowed = ['admin', 'manager'].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [form, setForm] = useState(() => allowed && state?.customer ? { ...newQuote(), customer_id: state.customer.customer_id, customer_name: state.customer.customer_name || '', billing_name: state.customer.customer_name || '', phone_number: state.customer.phone_number || '', address: state.customer.location || '' } : null);
  const [saved, setSaved] = useState(null);
  const [dirty, setDirty] = useState(() => !!(allowed && state?.customer));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('all');
  const [dateRange, setDateRange] = useState({ start:'', end:'' });
  const [preparedBy, setPreparedBy] = useState('');
  const [view, setView] = useState('quotations');
  const [customerType, setCustomerType] = useState('all');
  const [pageSize, setPageSize] = useState(10);
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const [selectedCustomerKey, setSelectedCustomerKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pdfShare, setPdfShare] = useState(null);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    quotationsApi.list().then(({ data }) => { if (active) {
      setRows(data);
      const selected = data.find(row => row.quote_id === quoteParam);
      if (selected) { setSaved(selected); setForm(structuredClone(selected)); setDirty(false); }
    } }).catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    customersApi.listAll().then(({ data }) => { if (active) setCustomers(data); }).catch(() => { if (active) setNotice('Customer lookup unavailable. Customer details can be entered manually.'); });
    inventoryApi.list().then(({ data }) => { if (active) setInventory(data); }).catch(() => { if (active) setNotice('Inventory lookup unavailable. Items can be entered manually.'); });
    return () => { active = false; };
  }, [allowed, quoteParam]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); setDirty(true); setNotice(''); };
  const updateItem = (index, values) => change('items', form.items.map((item, i) => i === index ? { ...item, ...values } : item));
  const open = row => { setSaved(row); setForm(row ? structuredClone(row) : newQuote()); setDirty(!row); setError(''); setNotice(''); };
  const close = () => { if (!dirty || window.confirm('Discard unsaved quotation changes?')) { setForm(null); setDirty(false); setSaved(null); } };
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { data } = saved ? await quotationsApi.update(saved.quote_id, form, saved.revision) : await quotationsApi.create(form);
      setRows(prev => [data, ...prev.filter(r => r.quote_id !== data.quote_id)]);
      setSelectedCustomerKey(keyFor(data));
      setView('customers');
      setSearch(''); setStatus(''); setPreparedBy('');
      setPeriod('all'); setDateRange({ start: '', end: '' });
      setSaved(null); setForm(null); setDirty(false); setNotice('Quotation saved.');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function updateStatus(row, nextStatus) {
    if (busy || nextStatus === row.status) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await quotationsApi.update(row.quote_id, { ...row, status: nextStatus }, row.revision);
      setRows(prev => prev.map(quote => quote.quote_id === data.quote_id ? data : quote));
      setNotice(`Quotation ${data.estimation_no || data.quote_id} status updated to ${data.status}. Previously shared PDF links must be shared again.`);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function download(row) {
    setBusy(true); setError('');
    try {
      const { data } = await quotationsApi.pdf(row.quote_id);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = `${row.quote_id}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      if (e.response?.data instanceof Blob) {
        try { setError(errorText({ response: { data: JSON.parse(await e.response.data.text()) } })); }
        catch { setError('Unable to download quotation PDF.'); }
      } else setError(errorText(e));
    } finally { setBusy(false); }
  }
  async function share(row, copy = false) {
    const digits = row.phone_number.replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    if (!copy && (phone.length < 10 || phone.length > 15)) { setError('Enter a valid customer phone number, including country code.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (copy) {
        const { data } = await quotationsApi.share(row.quote_id);
        await navigator.clipboard.writeText(data.url); setNotice('PDF link copied. Valid for 7 days; editing the quote replaces the link.');
      }
      else {
        const { data } = await quotationsApi.pdf(row.quote_id);
        const name = `${(row.estimation_no || row.quote_id).replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
        const file = new File([data], name, { type: 'application/pdf' });
        const text = `Hello ${row.customer_name}, please find your Baangs quotation ${row.estimation_no || row.quote_id} for Rs ${Math.round(Number(row.total)).toLocaleString('en-IN')}. Quotation valid until ${formatDate(row.valid_until)}.`;
        setPdfShare({ file, text, phone });
      }
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function sendPreparedPdf() {
    if (!pdfShare) return;
    if (navigator.canShare?.({ files: [pdfShare.file] })) {
      try {
        await navigator.share({ files: [pdfShare.file], title: 'Baangs quotation', text: pdfShare.text });
        setPdfShare(null); setNotice('PDF shared.');
      } catch (error) { if (error.name !== 'AbortError') setError('File sharing failed. Use Download PDF & Open WhatsApp instead.'); }
    } else downloadPreparedPdf();
  }
  function downloadPreparedPdf() {
    const url = URL.createObjectURL(pdfShare.file);
    const a = document.createElement('a'); a.href = url; a.download = pdfShare.file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    window.open(`https://wa.me/${pdfShare.phone}?text=${encodeURIComponent(pdfShare.text)}`, '_blank', 'noopener,noreferrer');
    setPdfShare(null); setNotice('PDF downloaded. Attach the downloaded PDF in WhatsApp before sending.');
  }
  function chooseCustomer(customer) {
    setForm(prev => ({ ...prev, customer_id: customer.customer_id || null, customer_name: customer.customer_name, billing_name: customer.billing_name || customer.customer_name, phone_number: customer.phone_number, address: customer.address || '', gstin: customer.gstin || '', state_of_supply: customer.state_of_supply || '' })); setDirty(true);
  }
  async function moveCustomer(row) {
    if (!window.confirm('Move this quotation customer to Customers and open job creation? A job is created only after you submit the job form.')) return;
    setBusy(true); setError('');
    try {
      const { data } = await quotationsApi.moveToCustomer(row.quote_id);
      navigate('/jobs/create', { state: { customer: { ...data.customer, location: data.location } } });
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const keyFor = row => row.customer_id || `${row.customer_name.trim().toLowerCase()}|${row.phone_number.trim().replace(/[ -]/g,'')}`;
  const customerGroups = Array.from(rows.reduce((map,row) => {
    const key = keyFor(row);
    if (!map.has(key)) map.set(key, { key, row, quotes: [] });
    map.get(key).quotes.push(row);
    return map;
  }, new Map()).values());
  const selectedGroup = customerGroups.find(g => g.key === selectedCustomerKey);
  if (!allowed) return <p role="alert">Quotations are available to admins and managers.</p>;
  const filtered = rows.filter(row => (!selectedGroup || keyFor(row) === selectedGroup.key) && (!status || row.status === status)
    && (!preparedBy || row.prepared_by === preparedBy)
    && (!dateRange.start || row.quote_date >= dateRange.start) && (!dateRange.end || row.quote_date <= dateRange.end)
    && `${row.estimation_no || ''} ${row.quote_id} ${row.customer_name} ${row.phone_number} ${row.address || ''}`.toLowerCase().includes(search.toLowerCase()));
  const filteredIds = new Set(filtered.map(row => row.quote_id));
  const accountGroups = customerGroups.map(group => ({ ...group, quotes: group.quotes.filter(row => filteredIds.has(row.quote_id)).sort((a,b) => (b.quote_date || '').localeCompare(a.quote_date || '')) })).filter(group => group.quotes.length);
  const visibleAccounts = accountGroups.filter(group => customerType === 'all' || (customerType === 'saved' ? !!group.row.customer_id : !group.row.customer_id));
  const isCustomerList = view === 'customers' && !selectedGroup;
  const accountQuotes = visibleAccounts.flatMap(group => group.quotes);
  const savedAccounts = accountGroups.filter(group => group.row.customer_id).length;
  const totalQuoted = filtered.reduce((sum,row) => sum + Number(row.total || 0),0);
  const acceptedQuoted = filtered.filter(row => row.status === 'accepted').reduce((sum,row) => sum + Number(row.total || 0),0);
  const openQuoted = filtered.filter(row => ['draft','sent'].includes(row.status)).reduce((sum,row) => sum + Number(row.total || 0),0);
  const openCount = filtered.filter(row => ['draft', 'sent'].includes(row.status)).length;
  const acceptedCount = filtered.filter(row => row.status === 'accepted').length;
  const recordCount = isCustomerList ? visibleAccounts.length : filtered.length;
  const paginationKey = JSON.stringify([search, status, preparedBy, dateRange, view, selectedCustomerKey, pageSize, customerType]);
  const pageCount = Math.max(1, Math.ceil(recordCount / pageSize));
  const page = pageState.key === paginationKey ? Math.min(pageState.page, pageCount) : 1;
  const pageStart = (page - 1) * pageSize;
  const goPage = number => setPageState({ key: paginationKey, page: number });
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, pageCount])].filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b);
  const exportCsv = () => {
    const cell = value => `"${String(value ?? '').replace(/^\s*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const data = isCustomerList ? [['Customer', 'Phone', 'Location', 'Quotations Given', 'Customer Type', 'Total Quoted'], ...visibleAccounts.map(group => [group.row.customer_name, group.row.phone_number, group.row.address, group.quotes.length, group.row.customer_id ? 'Saved customer' : 'Quotation only', group.quotes.reduce((sum,row) => sum + Number(row.total || 0), 0)])] : [['Date', 'Reference No.', 'Customer', 'Phone', 'Amount', 'Valid Until', 'Status'], ...filtered.map(row => [row.quote_date, row.estimation_no || row.quote_id, row.customer_name, row.phone_number, row.total, row.valid_until, row.status])];
    const url = URL.createObjectURL(new Blob(['\uFEFF', data.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = isCustomerList ? 'quotation-customers.csv' : 'quotations.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const printSummary = () => {
    const printRows = isCustomerList ? accountQuotes : filtered;
    const popup = window.open('', '_blank');
    if (!popup) { setNotice('Allow pop-ups to print the quotation summary.'); return; }
    popup.opener = null;
    popup.document.title = 'Baangs Quotation Summary';
    const append = (parent, tag, value) => { const element = popup.document.createElement(tag); element.textContent = value; parent.appendChild(element); return element; };
    append(popup.document.head, 'style', 'body{font:13px Arial;padding:24px;color:#243a36}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}h1{font-size:23px}');
    append(popup.document.body, 'h1', 'BAANGS - Quotation Summary');
    append(popup.document.body, 'p', `${printRows.length} quotations | Total: ${rupees(printRows.reduce((sum,row) => sum + Number(row.total || 0), 0))}`);
    const table = append(popup.document.body, 'table', '');
    const header = append(table, 'tr', '');
    ['Date', 'Reference', 'Customer', 'Amount', 'Valid Until', 'Status'].forEach(value => append(header, 'th', value));
    printRows.forEach(row => { const tr = append(table, 'tr', ''); [formatDate(row.quote_date), row.estimation_no || row.quote_id, row.customer_name, rupees(row.total), formatDate(row.valid_until), row.status].forEach(value => append(tr, 'td', value)); });
    popup.focus(); popup.print();
  };
  const choosePeriod = value => {
    setPeriod(value);
    const today = new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'});
    if (value === 'all' || value === 'custom') setDateRange({start:'',end:''});
    else if (value === 'today') setDateRange({start:today,end:today});
    else setDateRange({start:`${today.slice(0,7)}-01`,end:today});
  };
  const calculation = form ? totals(form.items, form.round_off) : null;
  return <div className={`quotations-page${!form ? ' quote-finance-dashboard' : ''}`}>
    <header className={`page-header ${!form ? 'quote-dashboard-header' : 'quote-estimate-header'}`}><div><h2>{form ? saved ? 'Edit Estimate' : 'Add Estimate' : 'Quotations & Estimates'}</h2>{form ? <p>{saved?.estimation_no || saved?.quote_id || 'New quotation'}</p> : <p>Commercial proposals and customer estimates</p>}</div>
      {form ? <button className="btn btn-secondary" onClick={close} disabled={busy}><MdArrowBack /> Back</button> : <div className="quote-header-actions"><button className="btn btn-secondary" onClick={exportCsv} disabled={loading || !filtered.length}><Download size={16} /> Export CSV</button><button className="btn btn-secondary" onClick={printSummary} disabled={loading || !filtered.length}><Printer size={16} /> Print Summary</button><button className="btn btn-primary quote-add-estimate" onClick={() => open(null)}><MdAdd /> Add Estimate</button></div>}
    </header>
    {error && <div role="alert" className="quote-message error">{error}</div>}
    {notice && <div role="status" className="quote-message">{notice}</div>}
    {pdfShare && <section className="quote-message" aria-label="Share quotation PDF">
      <strong>{pdfShare.file.name}</strong><p>{navigator.canShare?.({ files: [pdfShare.file] }) ? 'Choose WhatsApp and the customer in the share menu.' : 'Your browser cannot attach files directly to WhatsApp. Download the PDF, then attach it in the customer chat.'}</p>
      <div className="quote-actions">
        <button type="button" className="btn btn-primary" onClick={sendPreparedPdf}><FaWhatsapp /> {navigator.canShare?.({ files: [pdfShare.file] }) ? 'Share PDF' : 'Download PDF & Open WhatsApp'}</button>
        {navigator.canShare?.({ files: [pdfShare.file] }) && <button type="button" className="btn btn-secondary" onClick={downloadPreparedPdf}><MdDownload /> Download PDF & Open WhatsApp</button>}
        <button type="button" className="btn btn-secondary" onClick={() => setPdfShare(null)}>Cancel</button>
      </div>
    </section>}
    {!form ? <>
      <div className="quote-actions" style={{ marginBottom:16 }} role="group" aria-label="Quotation views">
        <button className={`btn ${view === 'quotations' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={view === 'quotations'} onClick={() => { setView('quotations'); setSelectedCustomerKey(null); setSearch(''); setStatus(''); }}>Quotations</button>
        <button className={`btn ${view === 'customers' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={view === 'customers'} onClick={() => { setView('customers'); setSelectedCustomerKey(null); setSearch(''); setStatus(''); }}>Customers</button>
      </div>
      {selectedGroup && <section className="quote-section">
        <button className="btn btn-secondary" onClick={() => { setSelectedCustomerKey(null); setSearch(''); setStatus(''); }}><MdArrowBack /> Customer List</button>
        <div className="quote-profile-header"><div><h3>{selectedGroup.row.customer_name}</h3>
        <a href={`tel:${selectedGroup.row.phone_number.replace(/[^+\d]/g,'')}`}>{selectedGroup.row.phone_number}</a>
        <p>{selectedGroup.row.address || 'No address saved'}</p></div>
        <div className="quote-profile-metrics"><div><span>Quotations</span><strong>{selectedGroup.quotes.length}</strong></div><div><span>Total quoted</span><strong>{rupees(selectedGroup.quotes.reduce((sum, row) => sum + Number(row.total || 0), 0))}</strong></div></div></div>
        <div className="quote-actions">
        <button type="button" className="btn btn-secondary" onClick={() => {
          const customer = selectedGroup.row;
          open(null);
          setForm({ ...newQuote(), customer_id:customer.customer_id || null, customer_name:customer.customer_name,
            billing_name:customer.billing_name || customer.customer_name, phone_number:customer.phone_number,
            address:customer.address || '', gstin:customer.gstin || '', state_of_supply:customer.state_of_supply || '' });
        }}><MdAdd /> New Quotation for Customer</button>
        {selectedGroup.row.customer_id && <button className="btn btn-secondary" onClick={() => navigate(`/customers/${selectedGroup.row.customer_id}`)}>Open Customer Details</button>}
        {user?.role === 'admin' && <button className="btn btn-primary" disabled={busy} onClick={() => moveCustomer(selectedGroup.row)}><MdAdd /> {selectedGroup.row.customer_id ? 'Create Job' : 'Move to Customers / Create Job'}</button>}
        </div>
        <QuotationCustomerFollowup key={selectedGroup.key} customer={[...selectedGroup.quotes].sort((a,b) => (b.customer_remark_updated_at || '').localeCompare(a.customer_remark_updated_at || ''))[0]} onSaved={updated => setRows(prev => prev.map(row => updated.find(item => item.quote_id === row.quote_id) || row))} />
      </section>}
      {(view === 'quotations' || selectedGroup) && <section className="quote-pipeline-metrics" aria-label="Filtered quotation metrics">
        <div><span>Total Pipeline Value</span><TrendingUp aria-hidden="true" /><strong>{rupees(totalQuoted)}</strong><small>{filtered.length} proposals</small></div>
        <div><span>Open / In Review</span><ClipboardClock aria-hidden="true" /><strong>{rupees(openQuoted)}</strong><small>{openCount} open proposals</small></div>
        <div><span>Accepted</span><BadgeCheck aria-hidden="true" /><strong>{rupees(acceptedQuoted)}</strong><small>{acceptedCount} accepted proposals</small></div>
        <div><span>Average Deal Size</span><Banknote aria-hidden="true" /><strong>{rupees(filtered.length ? totalQuoted / filtered.length : 0)}</strong><small>Across filtered quotations</small></div>
      </section>}
      {isCustomerList && <section className="quote-pipeline-metrics quote-account-metrics" aria-label="Quotation customer metrics">
        <div><span>Quoted Accounts</span><TrendingUp aria-hidden="true" /><strong>{visibleAccounts.length}</strong><small>{accountQuotes.length} quotations issued</small></div>
        <div><span>Total Quoted Value</span><Banknote aria-hidden="true" /><strong>{rupees(accountQuotes.reduce((sum,row) => sum + Number(row.total || 0), 0))}</strong><small>Across filtered customer accounts</small></div>
        <div><span>Saved / Quotation Only</span><BadgeCheck aria-hidden="true" /><strong>{visibleAccounts.filter(group => group.row.customer_id).length} / {visibleAccounts.filter(group => !group.row.customer_id).length}</strong><small>Customer database / quotation-only accounts</small></div>
        <div><span>Quotation Acceptance</span><ClipboardClock aria-hidden="true" /><strong>{accountQuotes.length ? Math.round(accountQuotes.filter(row => row.status === 'accepted').length / accountQuotes.length * 100) : 0}%</strong><small>Accepted quotations in this selection</small></div>
      </section>}
      <div className="quote-dashboard-filters">
        <span>Filter by:</span>
        <select className="form-select" aria-label="Quotation period" value={period} onChange={e => choosePeriod(e.target.value)}><option value="all">All dates</option><option value="today">Today</option><option value="month">This month</option><option value="custom">Custom</option></select>
        {period === 'custom' && <DateRangePicker start={dateRange.start} end={dateRange.end} active={!!dateRange.start} onChange={(start,end) => setDateRange({start,end})} />}
        <select className="form-select" aria-label="Prepared by" value={preparedBy} onChange={e => setPreparedBy(e.target.value)}><option value="">All users</option>{[...new Set(rows.map(row => row.prepared_by).filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}</select>
        <select aria-label="Quotation status" className="form-select" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['draft','sent','accepted','rejected'].map(s => <option key={s} value={s}>{s}</option>)}</select>
        {(period !== 'all' || status || preparedBy || search || (isCustomerList && customerType !== 'all')) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { choosePeriod('all'); setStatus(''); setPreparedBy(''); setSearch(''); setCustomerType('all'); }}>Clear</button>}
      </div>
      {(view === 'quotations' || selectedGroup) && <>
        <div className="quote-transactions-heading"><h3>Transactions <small>({filtered.length})</small></h3><input aria-label="Search quotations" className="form-input" placeholder="Search transactions" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </>}
      {isCustomerList && <div className="quote-account-toolbar"><div className="quote-account-types" aria-label="Quotation customer types">{[['all', `All (${accountGroups.length})`], ['saved', `Saved (${savedAccounts})`], ['lead', `Quotation Only (${accountGroups.length - savedAccounts})`]].map(([value,label]) => <button className="btn btn-secondary" key={value} aria-pressed={customerType === value} onClick={() => setCustomerType(value)}>{label}</button>)}</div><input aria-label="Search quotation customers" className="form-input" placeholder="Search name, phone, location or quotation reference" value={search} onChange={e => setSearch(e.target.value)} /></div>}
      {isCustomerList ? <div className="table-wrapper quote-account-table"><table className="table"><thead><tr>{['Customer','Contact Phone','Location','Quotations Given','Customer Type','Latest / Value','Status','Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {visibleAccounts.slice(pageStart, pageStart + pageSize).map(group => {
          const latest = group.quotes[0];
          const showQuotes = () => { setSelectedCustomerKey(group.key); setSearch(''); setStatus(''); };
          return <tr key={group.key}>
            <td><div className="quote-party"><span className="quote-party-avatar" aria-hidden="true">{(group.row.customer_name || 'C').slice(0,1).toUpperCase()}</span><div><button className="quote-link" onClick={showQuotes}>{group.row.customer_name}</button><small>{group.row.customer_id ? 'Saved customer' : 'Quotation account'}</small></div></div></td>
            <td><a className="quote-account-phone" href={`tel:${group.row.phone_number.replace(/[^+\d]/g,'')}`}>{group.row.phone_number}</a></td>
            <td className="quote-account-location">{group.row.address || '-'}</td>
            <td><button className="quote-account-count" onClick={showQuotes}>{group.quotes.length} quote{group.quotes.length === 1 ? '' : 's'}</button></td>
            <td><span className={`quote-account-type ${group.row.customer_id ? 'saved' : 'lead'}`}>{group.row.customer_id ? 'Saved customer' : 'Quotation only'}</span></td>
            <td><strong>{rupees(group.quotes.reduce((sum,row) => sum + Number(row.total || 0), 0))}</strong><small className="quote-account-date">{formatDate(latest.quote_date)}</small></td>
            <td><span className={`quote-account-status ${latest.status}`}>{latest.status === 'draft' ? 'Open - Draft' : latest.status === 'sent' ? 'Open - Sent' : latest.status}</span></td>
            <td><button className="btn btn-secondary btn-sm" onClick={showQuotes}>View Quotes <ArrowRight size={14} /></button></td>
          </tr>;
        })}
      </tbody></table>{!visibleAccounts.length && <div className="empty-state">{loading ? 'Loading customers...' : 'No quotation customers match the selected filters.'}</div>}</div> : loading ? <p role="status">Loading quotations...</p> : <div className="table-wrapper quote-transactions"><table className="table"><thead><tr>{['Date','Reference No.','Party Name','Amount','Valid Until','Status','Actions'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>
        {filtered.slice(pageStart, pageStart + pageSize).map(row => <tr key={row.quote_id}><td>{formatDate(row.quote_date)}</td><td><button className="quote-link" onClick={() => open(row)}>{row.estimation_no || row.quote_id}</button></td><td><div className="quote-party"><span aria-hidden="true" className="quote-party-avatar">{(row.customer_name || 'C').slice(0, 1).toUpperCase()}</span><div><button className="quote-link" onClick={() => { setView('customers'); setSelectedCustomerKey(keyFor(row)); setSearch(''); setStatus(''); }}>{row.customer_name}</button><small>{row.phone_number}</small></div></div></td><td className="quote-amount">{rupees(row.total)}</td><td>{formatDate(row.valid_until)}</td><td><select className={`form-select quote-status ${row.status}`} aria-label={`Status for ${row.estimation_no || row.quote_id}`} value={row.status} disabled={busy} onChange={event => updateStatus(row, event.target.value)}>{['draft','sent','accepted','rejected'].map(value => <option key={value} value={value}>{value === 'draft' ? 'Open - Draft' : value === 'sent' ? 'Open - Sent' : value === 'accepted' ? 'Accepted' : 'Rejected'}</option>)}</select></td><td><div className="quote-row-actions">
          {user?.role === 'admin' && <button type="button" className="quote-link" disabled={busy} onClick={() => moveCustomer(row)}>Convert to Job</button>}
          {selectedGroup && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => share(row)}><FaWhatsapp /> Send</button>}
          <details className="quote-action-menu"><summary title="Quotation actions" aria-label={`Actions for ${row.estimation_no || row.quote_id}`}><MdMoreVert /></summary><div className="quote-action-menu-content">
          <button type="button" title="Edit quotation" aria-label={`Edit ${row.quote_id}`} className="btn btn-secondary" disabled={busy} onClick={() => open(row)}><MdEdit /></button>
          <button type="button" title="Download PDF" aria-label={`Download ${row.quote_id}`} className="btn btn-secondary" disabled={busy} onClick={() => download(row)}><MdDownload /></button>
          <button type="button" title="Send on WhatsApp" aria-label={`Share ${row.quote_id} on WhatsApp`} className="btn btn-secondary" disabled={busy} onClick={() => share(row)}><FaWhatsapp /></button>
          <button type="button" title="Copy PDF link" aria-label={`Copy link for ${row.quote_id}`} className="btn btn-secondary" disabled={busy} onClick={() => share(row, true)}><MdContentCopy /></button>
        </div></details></div></td></tr>)}
      </tbody></table>{!filtered.length && <div className="empty-state">No quotations found.</div>}</div>}
      {!loading && recordCount > 0 && <nav className="quote-pagination" aria-label="Quotation pagination">
        <span role="status">Showing {pageStart + 1}-{Math.min(pageStart + pageSize, recordCount)} of {recordCount}{isCustomerList ? ' customer accounts' : ''}</span>
        <label>Rows per page<select className="form-select" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[10,20,50,100].map(size => <option key={size}>{size}</option>)}</select></label>
        <div className="quote-page-buttons"><button className="btn btn-secondary btn-icon" title="Previous page" aria-label="Previous page" disabled={page === 1} onClick={() => goPage(page - 1)}><ChevronLeft size={16} /></button>{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">...</span>}<button className={`btn ${page === number ? 'btn-primary' : 'btn-secondary'}`} aria-label={`Page ${number}`} aria-current={page === number ? 'page' : undefined} onClick={() => goPage(number)}>{number}</button></span>)}<button className="btn btn-secondary btn-icon" title="Next page" aria-label="Next page" disabled={page === pageCount} onClick={() => goPage(page + 1)}><ChevronRight size={16} /></button></div>
        <form key={`${page}-${pageCount}`} onSubmit={event => { event.preventDefault(); const target = Number(new FormData(event.currentTarget).get('page')); if (Number.isInteger(target) && target >= 1 && target <= pageCount) goPage(target); }}><label>Jump to page<input className="form-input" name="page" type="number" required min="1" max={pageCount} step="1" defaultValue={page} /></label><span>of {pageCount}</span><button className="btn btn-secondary btn-icon" title="Jump to page" aria-label="Jump to page"><ArrowRight size={16} /></button></form>
      </nav>}
    </> : <form className="quote-estimate-form" onSubmit={save}>
      <fieldset disabled={busy} className="quote-fieldset">
        <section className="quote-section quote-estimate-customer"><h3>Customer & Quotation Details</h3><div className="quote-fields">
          <QuotationCustomerPicker customers={customers} quotations={rows} value={form} onSelect={chooseCustomer} />
          {[['customer_name','Customer name',true],['billing_name','Billing name',false],['phone_number','Phone number',true],['gstin','Customer GSTIN',false],['state_of_supply','State of supply',false]].map(([key,label,required]) => <label key={key} className="form-group">{label}<input className="form-input" required={required} value={form[key]} maxLength={key === 'phone_number' ? 30 : key === 'gstin' ? 30 : 200} onChange={e => change(key,e.target.value)} /></label>)}
          <label className="form-group">Quotation date<input required type="date" className="form-input" value={form.quote_date} onChange={e => change('quote_date',e.target.value)} /></label>
          <label className="form-group">Validity (days)<input required type="number" className="form-input" min="1" max="365" step="1" value={form.validity_days} onChange={e => change('validity_days',e.target.value)} /></label>
          {saved && <label className="form-group">Status<select className="form-select" value={form.status} onChange={e => change('status',e.target.value)}>{['draft','sent','accepted','rejected'].map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
          <label className="form-group quote-wide">Address<textarea className="form-input" value={form.address} maxLength={2000} onChange={e => change('address',e.target.value)} /></label>
        </div></section>
        <section className="quote-section quote-estimate-items"><h3>Bill of Materials & Field Services</h3>
          <datalist id="quote-inventory">{inventory.map(i => <option key={i.barcode} value={i.item_name}>{i.barcode} - {i.model_number}</option>)}</datalist>
          {form.items.map((item,index) => <div className="quote-item" key={index}>
            <div className="quote-item-title"><strong>Item {index+1}</strong><span>{rupees(totals([item], false).total)}</span><button type="button" title="Remove item" aria-label={`Remove item ${index+1}`} className="btn btn-secondary" disabled={form.items.length === 1} onClick={() => change('items',form.items.filter((_,i) => i!==index))}><MdDeleteOutline /></button></div>
            <div className="quote-fields">
              <QuotationItemPicker item={item} inventory={inventory} onChange={values => updateItem(index,values)} />
              {[['hsn','HSN'],['model','Model'],['serial_number','Serial number'],['warranty','Warranty'],['unit','Unit']].map(([key,label]) => <label className="form-group" key={key}>{label}<input className="form-input" maxLength={key === 'unit' ? 20 : key === 'hsn' ? 40 : 100} value={item[key]} onChange={e => updateItem(index,{[key]:e.target.value})} /></label>)}
              {[['quantity','Quantity',.001,1000000,.001],['unit_price','Unit price (before tax)',0,100000000,.01],['discount_percent','Discount (%)',0,100,.01],['tax_percent','Tax (%)',0,100,.01]].map(([key,label,min,max,step]) => <label className="form-group" key={key}>{label}<input required type="number" className="form-input" value={item[key]} min={min} max={max} step={step} onChange={e => updateItem(index,{[key]:e.target.value})} /></label>)}
              <label className="form-group quote-wide">Description<textarea className="form-input" maxLength={1000} value={item.description} onChange={e => updateItem(index,{description:e.target.value})} /></label>
            </div>
          </div>)}
          <button type="button" className="btn btn-secondary" disabled={form.items.length >= 100} onClick={() => change('items',[...form.items,newItem()])}><MdAdd /> Add Item / Service</button>
        </section>
        <section className="quote-section quote-estimate-terms"><h3>Terms, Conditions & Notes</h3><div>
          <label className="form-group">Terms & Conditions<textarea rows={7} className="form-input" maxLength={10000} value={form.terms} onChange={e => change('terms',e.target.value)} /></label>
          <label className="form-group">Notes<textarea rows={3} className="form-input" maxLength={3000} value={form.notes} onChange={e => change('notes',e.target.value)} /></label>
        </div></section>
        <aside className="quote-estimate-summary" aria-label="Financial Summary"><h3>Financial Summary</h3><span className="quote-estimate-line-count">{form.items.length} line item{form.items.length === 1 ? '' : 's'}</span><div className="quote-totals"><dl>{[['Subtotal',calculation.subtotal],['Discount',calculation.discount],['Tax',calculation.tax],['Round off',calculation.adjustment],['Total',calculation.total]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{rupees(value)}</dd></div>)}</dl><label><input type="checkbox" checked={form.round_off} onChange={e => change('round_off',e.target.checked)} /> Round off total</label></div>
        <div className="quote-actions quote-footer"><button type="submit" className="btn btn-primary"><MdSave /> {busy ? 'Please wait...' : 'Save Quotation'}</button>
          {user?.role === 'admin' && <button type="button" className="btn btn-secondary" disabled={!saved || dirty} onClick={() => moveCustomer(saved)}><MdAdd /> Move to Customers / Create Job</button>}
          <button type="button" className="btn btn-secondary" disabled={!saved || dirty} onClick={() => download(saved)}><MdDownload /> Download PDF</button>
          <button type="button" className="btn btn-secondary" disabled={!saved || dirty} onClick={() => share(saved)}><FaWhatsapp /> WhatsApp</button>
          <button type="button" className="btn btn-secondary" disabled={!saved || dirty} onClick={() => share(saved,true)}><MdContentCopy /> Copy Link</button>
        </div>
        </aside>
      </fieldset>
    </form>}
  </div>;
}
