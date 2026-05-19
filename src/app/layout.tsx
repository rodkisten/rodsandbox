import type { Metadata, Viewport } from 'next';
import './globals.css';
import SwRegister from './sw-register';

export const metadata: Metadata = {
  title: 'rodsandbox – Code Playground',
  description: 'Offline-first PWA code playground. Edit TypeScript, HTML, and CSS in your browser.',
  manifest: '/manifest.json',
  applicationName: 'RodSandbox',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className="bg-neutral-950 text-gray-100 antialiased overflow-hidden">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
