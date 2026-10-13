import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quotationsApi } from '../api';
import { formatDate } from '../utils/dateFormat';

export default function CustomerQuotations({ customerId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    quotationsApi.customerHistory(customerId).then(({data}) => { if (active) { setRows(data); setError(''); } })
      .catch(() => { if (active) setError('Unable to load quotations.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerId]);
  return <section style={{ margin: '24px 0' }}><h3>Quotations Given</h3>
    {loading ? <p role="status">Loading quotations...</p> : error ? <p role="alert">{error}</p> : !rows.length ? <p>No quotations given to this customer.</p> :
      <div className="table-wrapper"><table className="table"><thead><tr><th>Estimation No.</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.quote_id}>
        <td><Link to={`/quotations?quote=${encodeURIComponent(row.quote_id)}`}>{row.estimation_no || row.quote_id}</Link></td><td>{formatDate(row.quote_date)}</td><td>Rs {Math.round(row.total).toLocaleString('en-IN')}</td><td>{row.status}</td>
      </tr>)}</tbody></table></div>}
  </section>;
}
