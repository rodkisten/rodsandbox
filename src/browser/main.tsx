import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/contexts/AuthContext';
import '../app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');

function MigrationShell() {
  return <main className="flex min-h-screen items-center justify-center">
    <div role="status">RodSandbox · Browser migration foundation</div>
  </main>;
}

createRoot(root).render(<React.StrictMode><AuthProvider><MigrationShell /></AuthProvider></React.StrictMode>);
