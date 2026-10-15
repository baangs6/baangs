import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import JobItemsEditor from '../../src/components/JobItemsEditor';
import { AuthContext } from '../../src/context/auth-context';

function Fixture() {
  const [saved, setSaved] = useState(false);
  const role = new URLSearchParams(location.search).get('role') || 'admin';
  return <AuthContext.Provider value={{ user: { role } }}>
    <JobItemsEditor job={{ job_id: 'TEST', inventory_used: [] }} onSaved={() => setSaved(true)} />
    {saved && <p role="status">Saved</p>}
  </AuthContext.Provider>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
