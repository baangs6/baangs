import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../src/context/auth-context';
import '../../src/index.css';
import InventoryDashboard from '../../src/pages/Inventory/InventoryDashboard';
const role = new URLSearchParams(window.location.search).get('role') || 'admin';
createRoot(document.getElementById('root')).render(<AuthContext.Provider value={{ user: { user_id: 'ADMIN', role } }}><MemoryRouter><main style={{ padding: 24, background: '#f8f9ff', minHeight: '100vh' }}><InventoryDashboard /></main></MemoryRouter></AuthContext.Provider>);
