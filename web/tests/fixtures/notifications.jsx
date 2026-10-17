import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import Layout from '../../src/components/Layout/Layout';
import '../../src/index.css';
createRoot(document.getElementById('root')).render(<AuthContext.Provider value={{ user: { user_id: 'A', role: 'admin', full_name: 'Sahil Satheesh' }, logout: async () => {} }}><MemoryRouter initialEntries={['/dashboard']}><Routes><Route element={<Layout />}><Route path="dashboard" element={<h1>Operations Dashboard</h1>} /><Route path="jobs/:jobId" element={<h1>Linked Job Opened</h1>} /><Route path="tasks" element={<h1>Tasks Opened</h1>} /></Route></Routes></MemoryRouter></AuthContext.Provider>);
