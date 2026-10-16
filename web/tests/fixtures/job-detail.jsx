import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import Layout from '../../src/components/Layout/Layout';
import JobDetail from '../../src/pages/Jobs/JobDetail';
import '../../src/index.css';
import '../../src/pages/Jobs/JobList.css';

history.replaceState(null, '', '/jobs/JOB-TEST');
createRoot(document.getElementById('root')).render(
  <AuthContext.Provider value={{ user: { role: 'admin', full_name: 'Test Administrator' }, logout: async () => {} }}>
    <BrowserRouter><Routes><Route element={<Layout />}><Route path="/jobs/:jobId" element={<JobDetail />} /><Route path="*" element={<p>Jobs destination</p>} /></Route></Routes></BrowserRouter>
  </AuthContext.Provider>,
);
