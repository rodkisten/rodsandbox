import type { Metadata, Viewport } from 'next';
import './globals.css';
import SwRegister from './sw-register';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'rodsandbox – Cloud IDE',
  description: 'Mobile-first cloud IDE. Edit TypeScript, HTML, and CSS in your browser.',
  manifest: '/manifest.json',
  applicationName: 'RodSandbox',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#020617" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />
      </head>
      <body className="bg-neutral-950 text-neutral-100 antialiased overflow-hidden">
        <AuthProvider>
          <SwRegister />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
