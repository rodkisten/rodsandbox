import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import '../app/globals.css';

import './mobile-viewport.css';

// Safari can ignore viewport scale restrictions for gestures.
for (const event of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(event, e => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<RouterProvider router={router} />);
