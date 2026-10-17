import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../src/index.css';
import LearningLog from '../../src/pages/Staff/LearningLog';
createRoot(document.getElementById('root')).render(<MemoryRouter><main style={{ padding: 24, background: '#f8f9ff', minHeight: '100vh' }}><LearningLog /></main></MemoryRouter>);
