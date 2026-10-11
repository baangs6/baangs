import { useEffect, useState } from 'react';
import { amcApi } from '../api';

export default function AmcIndicator({ coverage, customer, location }) {
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setContracts([]);
    setError(false);
    if (customer?.customer_id) amcApi.list(customer.customer_id).then(({ data }) => {
      if (active) setContracts(data.contracts || data || []);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [customer?.customer_id]);
  const normalize = value => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const contract = coverage || contracts.find(c => c.status === 'active' && normalize(c.location) === normalize(location));
  if (error) return <p role="status">Unable to check AMC coverage.</p>;
  if (!contract) return null;
  return <div role="status" style={{ background: '#e7f8ef', color: '#14532d', border: '1px solid #86cfaa', borderRadius: 6, padding: '10px 14px', margin: '8px 0', whiteSpace: 'normal' }}>
    <strong>AMC Customer</strong> | {contract.free_visits_used}/4 free visits used | <strong>{contract.free_visits_remaining} remaining</strong>
    {contract.free_visits_remaining === 0 && <span> | Extra visit charges apply</span>}
  </div>;
}
