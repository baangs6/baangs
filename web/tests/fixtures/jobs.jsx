import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import Layout from '../../src/components/Layout/Layout';
import JobList from '../../src/pages/Jobs/JobList';
import '../../src/index.css';

history.replaceState(null, '', '/jobs?date_from=2026-10-01&date_to=2026-10-31');
createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: { role: 'admin', full_name: 'Test Administrator' }, logout: async () => {} }}>
    <BrowserRouter><Routes><Route element={<Layout />}><Route path="/jobs" element={<JobList />} /><Route path="*" element={<p>Job destination</p>} /></Route></Routes></BrowserRouter>
  </AuthContext.Provider>,
);
