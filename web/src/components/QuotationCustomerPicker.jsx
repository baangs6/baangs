import { useId, useMemo, useState } from 'react';
import { formatDate } from '../utils/dateFormat';

const identity = row => `${(row.customer_name || '').trim().toLowerCase()}|${(row.phone_number || '').replace(/[ -]/g, '')}`;
const amount = value => `Rs ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function QuotationCustomerPicker({ customers, quotations, value, onSelect }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(() => {
    const records = customers.map(customer => ({ ...customer, address: customer.location || '', quotes: [] }));
    for (const quote of quotations) {
      let record = quote.customer_id
        ? records.find(row => row.customer_id === quote.customer_id)
        : records.find(row => identity(row) === identity(quote));
      if (!record) {
        record = { ...quote, quotes: [] };
        records.push(record);
      }
      record.quotes.push(quote);
    }
    for (const record of records) record.quotes.sort((a, b) => b.quote_date.localeCompare(a.quote_date));
    return records;
  }, [customers, quotations]);
  const selected = entries.find(row => value.customer_id ? row.customer_id === value.customer_id : identity(row) === identity(value));
  const matches = entries.filter(row => `${row.customer_name} ${row.nickname || ''} ${row.phone_number} ${row.address || ''} ${row.quotes.map(q => q.estimation_no || q.quote_id).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="form-group quote-wide quote-customer-picker" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
  }}>
    <label htmlFor={id}>Search customer</label>
    <input id={id} className="form-input" autoComplete="off" placeholder="Name, nickname, phone or location"
      value={search} aria-expanded={expanded} aria-controls={`${id}-results`}
      onFocus={() => setExpanded(true)} onChange={event => { setSearch(event.target.value); setExpanded(true); }}
      onKeyDown={event => {
        if (event.key === 'Escape') setExpanded(false);
        if (event.key === 'Enter') { event.preventDefault(); if (expanded && matches.length === 1) { onSelect(matches[0]); setSearch(''); setExpanded(false); } }
      }} />
    {expanded && <div id={`${id}-results`} className="quote-customer-results" aria-label="Customer search results">
      {matches.map((row, index) => <button type="button" key={row.customer_id || `${identity(row)}-${index}`} className="quote-customer-result" onClick={() => { onSelect(row); setSearch(''); setExpanded(false); }}>
        <strong>{row.customer_name}{row.nickname ? ` (${row.nickname})` : ''}</strong>
        <span>{row.phone_number} {row.address ? ` - ${row.address}` : ''}</span>
        <small>{row.customer_id ? 'Saved customer' : 'Quotation only'} · {row.quotes.length} quotations</small>
        {row.quotes.map(quote => <small key={quote.quote_id}>{quote.estimation_no || quote.quote_id} · {formatDate(quote.quote_date)} · {amount(quote.total)} · {quote.status}</small>)}
      </button>)}
      {!matches.length && <p>No matching customers.</p>}
    </div>}
    {selected && <div className="quote-customer-history">
      <strong>{selected.customer_name} - {selected.quotes.length} previous quotations</strong>
      {selected.quotes.length > 0 && <div className="table-wrapper"><table className="table"><thead><tr><th>Estimate</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        {selected.quotes.map(quote => <tr key={quote.quote_id}><td>{quote.estimation_no || quote.quote_id}</td><td>{formatDate(quote.quote_date)}</td><td>{amount(quote.total)}</td><td>{quote.status}</td></tr>)}
      </tbody></table></div>}
    </div>}
  </div>;
}
