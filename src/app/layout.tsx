import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'rodsandbox – Code Playground',
  description: 'Offline-first PWA code playground. Edit TypeScript, HTML, and CSS in your browser.',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-gray-950 text-gray-100 antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
