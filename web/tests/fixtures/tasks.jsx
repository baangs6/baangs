import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import Tasks from '../../src/pages/Tasks/Tasks';
createRoot(document.getElementById('root')).render(<main style={{ padding: 24, background: '#f8f9ff', minHeight: '100vh' }}><Tasks /></main>);
