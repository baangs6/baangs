import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, TrendingUp, Wallet, PieChart, Download, Search, ChevronLeft, ChevronRight, ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { billingApi, jobsApi } from '../../api';
import { formatDate } from '../../utils/dateFormat';
import { calculateBillingProfit } from '../../utils/billingMath';
import { createInvoicePdf } from '../../utils/invoicePdf';
import './BillingList.css';

const number = value => Number(value || 0);
const money = value => `Rs ${number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const outstanding = bill => Math.max(0, number(bill.invoice_amount) - number(bill.collected_amount));
function status(bill) {
  if (number(bill.invoice_amount) <= 0) return number(bill.collected_amount) > 0 ? 'Unbilled collection' : 'No invoice amount';
  if (!outstanding(bill)) return 'Collected';
  return number(bill.collected_amount) > 0 ? 'Partially collected' : 'Pending';
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BillingList() {
  const [billing, setBilling] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [pageSize, setPageSize] = useState(6);
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const [reload, setReload] = useState(0);
  const [jobResult, setJobResult] = useState(null);
  const [jobError, setJobError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try { const { data } = await billingApi.list(month ? { month } : {}); if (active) setBilling(data || []); }
      catch { if (active) setError('Unable to load billing records. Please try again.'); }
      finally { if (active) setLoading(false); }
    }
    load(); return () => { active = false; };
  }, [month, reload]);

  const searched = billing.filter(bill => `${bill.job_id} ${bill.customer_name || ''} ${bill.work_type || ''} ${bill.payment_mode || ''} ${bill.payment_id || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const collectedCount = searched.filter(bill => number(bill.collected_amount) > 0).length;
  const pendingCount = searched.filter(bill => outstanding(bill) > 0).length;
  const visible = searched.filter(bill => tab === 'all' || (tab === 'collected' ? number(bill.collected_amount) > 0 : outstanding(bill) > 0));
  const key = JSON.stringify([month, search, tab, pageSize]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = pageState.key === key ? Math.min(pageState.page, pageCount) : 1;
  const goPage = value => setPageState({ key, page: value });
  const start = (page - 1) * pageSize;
  const pageRows = visible.slice(start, start + pageSize);
  const selected = pageRows.find(bill => bill.billing_id === selectedId) || pageRows[0];
  const selectedJobId = !loading && !error ? selected?.job_id : null;
  const job = jobResult?.job_id === selectedJobId ? jobResult : null;
  useEffect(() => {
    let active = true;
    if (!selectedJobId) return;
    jobsApi.get(selectedJobId).then(({ data }) => { if (active) { setJobResult(data); setJobError(''); } })
      .catch(() => { if (active) setJobError('Job details are unavailable. Billing amounts remain visible.'); });
    return () => { active = false; };
  }, [selectedJobId, reload]);

  const billed = visible.reduce((sum,bill) => sum + number(bill.invoice_amount), 0);
  const profit = visible.reduce((sum,bill) => sum + calculateBillingProfit(bill).profit, 0);
  const collected = visible.reduce((sum,bill) => sum + number(bill.collected_amount), 0);
  const due = visible.reduce((sum,bill) => sum + outstanding(bill), 0);
  const selectedProfit = calculateBillingProfit(selected || {});
  const pageNumbers = [...new Set([1,page-1,page,page+1,pageCount])].filter(value => value >= 1 && value <= pageCount).sort((a,b) => a-b);
  const exportCsv = () => {
    const cell = value => `"${String(value ?? '').replace(/^\s*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const data = [['Job ID','Customer','Date','Work Type','Invoice','Amount Collected','Expense','Material','Profit','Margin (%)','Payment Mode','Payment Reference'], ...visible.map(bill => [bill.job_id,bill.customer_name,bill.complete_date,bill.work_type,bill.invoice_amount,bill.collected_amount,bill.expense,bill.material_amount,calculateBillingProfit(bill).profit,calculateBillingProfit(bill).percentage,bill.payment_mode,bill.payment_id])];
    download(new Blob(['\uFEFF',data.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'billing.csv');
  };
  const invoiceAction = async share => {
    setBusy(true); setActionError(''); setNotice('');
    try {
      let blob;
      try { blob = (await billingApi.invoicePdf(selected.job_id)).data; }
      catch (err) { if (err.response?.status !== 404 || !job) throw err; blob = createInvoicePdf(job, selected); }
      const file = new File([blob], `${selected.job_id}-invoice.pdf`, { type: 'application/pdf' });
      if (share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: `Invoice ${selected.job_id}`, files: [file] });
      else {
        const phone = String(job?.phone_number || '').replace(/\D/g, '');
        if (share && !phone) throw new Error('Customer phone number is unavailable. Open the job to check contact details.');
        download(file, file.name);
        if (share) { window.open(`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}?text=${encodeURIComponent(`Hello ${selected.customer_name || 'Customer'}, please find your BAANGS invoice ${selected.job_id} attached.`)}`, '_blank', 'noopener,noreferrer'); setNotice('PDF downloaded. Attach it in the customer WhatsApp chat.'); }
      }
    } catch (err) { if (err.name !== 'AbortError') setActionError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : err.message || 'Unable to prepare the invoice.'); }
    finally { setBusy(false); }
  };

  return <div className="animate-fade billing-page">
    <header className="page-header"><div><h2>Billing & Revenue</h2><p>{visible.length} invoices in this selection</p></div><div className="billing-header-actions"><label className="billing-month">Month<input className="form-input" aria-label="Billing month" type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>{month && <button className="btn btn-secondary" onClick={() => setMonth('')}>All dates</button>}<button className="btn btn-secondary" onClick={exportCsv} disabled={loading || !!error || !visible.length}><Download size={16} /> Export CSV</button><button className="btn btn-secondary btn-icon" title="Refresh billing" aria-label="Refresh billing" disabled={loading} onClick={() => setReload(value => value+1)}><RefreshCw size={16} /></button></div></header>
    <section className="billing-metrics" aria-label="Billing totals"><div><span>Total Billed</span><Banknote aria-hidden="true" /><strong>{money(billed)}</strong><small>{visible.length} invoices</small></div><div><span>Invoice Profit</span><TrendingUp aria-hidden="true" /><strong>{money(profit)}</strong><small>After material and expense deductions</small></div><div><span>Amount Collected</span><Wallet aria-hidden="true" /><strong>{money(collected)}</strong><small>{money(due)} outstanding</small></div><div><span>Profit Margin</span><PieChart aria-hidden="true" /><strong>{billed > 0 ? (profit/billed*100).toFixed(1) : '0.0'}%</strong><small>Profit as a share of billed revenue</small></div></section>
    <div className="billing-toolbar"><div className="billing-tabs" aria-label="Invoice categories">{[['all',`All Invoices (${searched.length})`],['collected',`Collected (${collectedCount})`],['pending',`Pending (${pendingCount})`]].map(([value,label]) => <button className="btn" aria-pressed={tab === value} key={value} onClick={() => setTab(value)}>{label}</button>)}</div><label className="billing-search"><Search size={16} /><input className="form-input" aria-label="Search invoices" placeholder="Search job, customer or payment" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {loading ? <div className="loading-center"><div className="spinner" /><span>Loading billing...</span></div> : error ? <div className="billing-error" role="alert">{error}<button className="btn btn-secondary" onClick={() => setReload(value => value+1)}>Retry</button></div> : !visible.length ? <div className="empty-state"><p>No billing records match this selection.</p></div> : <>
      <div className="billing-workspace"><section className="billing-invoices" aria-label="Invoices">{pageRows.map(bill => <article key={bill.billing_id} className={`billing-invoice ${selected?.billing_id === bill.billing_id ? 'selected' : ''}`}><button className="billing-invoice-select" aria-label={`Inspect ${bill.job_id}`} aria-pressed={selected?.billing_id === bill.billing_id} onClick={() => { setSelectedId(bill.billing_id); setActionError(''); setNotice(''); }}><span className="billing-invoice-meta"><span>{bill.job_id}</span><span className="billing-work-type">{bill.work_type || '-'}</span><span className="billing-payment-status">{status(bill)}</span></span><span className="billing-invoice-main"><strong>{bill.customer_name || '-'}</strong><span>Collected: <b>{money(bill.collected_amount)}</b></span></span><span className="billing-invoice-footer"><span>{bill.payment_mode || 'Not recorded'} | {formatDate(bill.complete_date)}</span><span>Invoice: {money(bill.invoice_amount)} | Profit: {money(calculateBillingProfit(bill).profit)}</span></span></button><Link className="billing-job-link" to={`/jobs/${encodeURIComponent(bill.job_id)}`} aria-label={`Open job ${bill.job_id}`}>Open Job <ExternalLink size={12} /></Link></article>)}</section>
        <aside className="billing-inspector" aria-label="Invoice details"><header><span>Invoice Inspection</span><h3>{selected.job_id}</h3><span className="billing-inspection-status">{status(selected)}</span></header><div className="billing-inspector-body"><section className="billing-customer"><span className="billing-customer-avatar" aria-hidden="true">{(selected.customer_name || 'C').slice(0,1).toUpperCase()}</span><div><strong>{selected.customer_name || '-'}</strong><small>{job?.location || 'Location not available'}</small></div></section><dl className="billing-context"><div><dt>Work Type</dt><dd>{selected.work_type || '-'}</dd></div><div><dt>Execution Date</dt><dd>{formatDate(selected.complete_date)}</dd></div><div><dt>Technician</dt><dd>{job?.assigned_staff_name || '-'}</dd></div></dl>{jobError && !job && <p role="status" className="billing-job-error">{jobError}</p>}
          <h4>Financial Breakdown</h4><dl className="billing-breakdown">{[['Invoice Amount',selected.invoice_amount],['Amount Collected',selected.collected_amount],['Outstanding',outstanding(selected)],['Collected Above Invoice',Math.max(0,number(selected.collected_amount)-number(selected.invoice_amount))],['Material Cost',selected.material_amount],['Expenses',selected.expense]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}<div className="billing-profit"><dt>Invoice Profit<small>{selectedProfit.percentage.toFixed(1)}% margin</small></dt><dd>{money(selectedProfit.profit)}</dd></div></dl>
          <dl className="billing-receipt"><div><dt>Payment Mode</dt><dd>{selected.payment_mode || '-'}</dd></div><div><dt>Payment Reference</dt><dd>{selected.payment_id || '-'}</dd></div>{selected.amc_benefits && <><div><dt>AMC Service Waiver</dt><dd>{money(selected.amc_service_waiver)}</dd></div><div><dt>AMC Product Discount</dt><dd>{money(selected.amc_product_discount)}</dd></div></>}</dl>{actionError && <p className="billing-error" role="alert">{actionError}</p>}{notice && <p role="status" className="billing-notice">{notice}</p>}<div className="billing-document-actions"><button className="btn btn-primary" disabled={busy} onClick={() => invoiceAction(false)}><Download size={16} /> {busy ? 'Preparing...' : 'Download Invoice PDF'}</button><button className="btn btn-secondary" disabled={busy || !job} onClick={() => invoiceAction(true)}><FaWhatsapp /> WhatsApp Invoice</button><Link className="btn btn-secondary" to={`/jobs/${encodeURIComponent(selected.job_id)}`}><ExternalLink size={15} /> Open Job / Update Collection</Link></div>
        </div></aside>
      </div>
      <nav className="billing-pagination" aria-label="Billing pagination"><span role="status">Showing {start+1}-{Math.min(start+pageSize,visible.length)} of {visible.length}</span><label>Rows per page<select className="form-select" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[6,12,24,50].map(size => <option key={size}>{size}</option>)}</select></label><div className="billing-page-buttons"><button className="btn btn-secondary btn-icon" aria-label="Previous page" title="Previous page" disabled={page === 1} onClick={() => goPage(page-1)}><ChevronLeft size={16} /></button>{pageNumbers.map((value,index) => <span key={value}>{index > 0 && value-pageNumbers[index-1] > 1 && <span aria-hidden="true">...</span>}<button className={`btn ${value === page ? 'btn-primary' : 'btn-secondary'}`} aria-label={`Page ${value}`} aria-current={value === page ? 'page' : undefined} onClick={() => goPage(value)}>{value}</button></span>)}<button className="btn btn-secondary btn-icon" aria-label="Next page" title="Next page" disabled={page === pageCount} onClick={() => goPage(page+1)}><ChevronRight size={16} /></button></div><form key={`${page}-${pageCount}`} onSubmit={event => { event.preventDefault(); const target = Number(new FormData(event.currentTarget).get('page')); if (Number.isInteger(target) && target >= 1 && target <= pageCount) goPage(target); }}><label>Jump to page<input className="form-input" name="page" type="number" required min="1" max={pageCount} step="1" defaultValue={page} /></label><span>of {pageCount}</span><button className="btn btn-secondary btn-icon" title="Jump to page" aria-label="Jump to page"><ArrowRight size={16} /></button></form></nav>
    </>}
  </div>;
}
