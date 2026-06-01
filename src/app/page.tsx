import type { Metadata } from 'next';
import RootPageClient from './RootPageClient';

export const metadata: Metadata = {
  title: 'RodSandbox',
  description: 'Mobile-first cloud IDE. Edit TypeScript, HTML, and CSS in your browser.',
};

export default function RootPage() {
  return <RootPageClient />;
}

