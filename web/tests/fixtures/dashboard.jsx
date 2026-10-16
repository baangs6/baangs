import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import Layout from '../../src/components/Layout/Layout';
import Dashboard from '../../src/pages/Dashboard';
import '../../src/index.css';

history.replaceState(null, '', '/dashboard');
createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: { role: 'admin', full_name: 'Test Administrator' }, logout: async () => {} }}>
    <BrowserRouter><Routes><Route element={<Layout />}><Route path="*" element={<Dashboard />} /></Route></Routes></BrowserRouter>
  </AuthContext.Provider>,
);
