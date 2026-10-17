import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import Layout from '../../src/components/Layout/Layout';
import Quotations from '../../src/pages/Quotations/Quotations';
import '../../src/index.css';
history.replaceState(null, '', '/quotations');
createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: { role: 'admin', full_name: 'Test Administrator' }, logout: async () => {} }}>
    <BrowserRouter><Routes><Route element={<Layout />}><Route path="*" element={<Quotations />} /></Route></Routes></BrowserRouter>
  </AuthContext.Provider>,
);
