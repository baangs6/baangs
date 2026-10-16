import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import Layout from '../../src/components/Layout/Layout';
import CustomerDetail from '../../src/pages/Customers/CustomerDetail';
import Quotations from '../../src/pages/Quotations/Quotations';
import '../../src/index.css';
import '../../src/pages/Customers/CustomerList.css';

export function Destination() { const { state } = useLocation(); return <p data-testid="destination">{JSON.stringify(state?.customer || {})}</p>; }
history.replaceState(null, '', '/customers/CUS-1');
createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: { role: 'admin', full_name: 'Test Administrator' }, logout: async () => {} }}>
    <BrowserRouter><Routes><Route element={<Layout />}><Route path="/customers/:customerId" element={<CustomerDetail />} /><Route path="/quotations" element={<Quotations />} /><Route path="*" element={<Destination />} /></Route></Routes></BrowserRouter>
  </AuthContext.Provider>,
);
