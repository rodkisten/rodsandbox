import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import '../app/globals.css';

import './mobile-viewport.css';

import { installVisualViewport } from './visualViewport';
installVisualViewport();

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<RouterProvider router={router} />);
