import React from 'react';
import { createRoot } from 'react-dom/client';
import Playground from '@/components/layout/Playground';
import '../app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');

// Local browser workspaces are not remote authentication credentials.
function BrowserApp() {
  const match = /^\/w\/([a-zA-Z0-9_-]+)\/?$/.exec(window.location.pathname);
  const workspaceId = match?.[1] ?? 'default-workspace';
  return <Playground key={workspaceId} workspaceId={workspaceId} />;
}

createRoot(root).render(<BrowserApp />);
