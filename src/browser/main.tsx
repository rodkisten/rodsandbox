import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import '../app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<RouterProvider router={router} />);
