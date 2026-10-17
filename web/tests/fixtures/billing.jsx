import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import Layout from '../../src/components/Layout/Layout';
import BillingList from '../../src/pages/Billing/BillingList';
import '../../src/index.css';
history.replaceState(null, '', '/billing');
createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: { role: 'admin', full_name: 'Test Administrator' }, logout: async () => {} }}>
    <BrowserRouter><Routes><Route element={<Layout />}><Route path="/billing" element={<BillingList />} /><Route path="*" element={<p>Job destination</p>} /></Route></Routes></BrowserRouter>
  </AuthContext.Provider>,
);
