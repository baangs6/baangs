import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AuthContext } from '../../src/context/auth-context';
import UserManagement from '../../src/pages/Users/UserManagement';
createRoot(document.getElementById('root')).render(<AuthContext.Provider value={{ user: { user_id: 'ADMIN', role: 'admin' } }}><main style={{ padding: 24, background: '#f8f9ff', minHeight: '100vh' }}><UserManagement /></main></AuthContext.Provider>);
