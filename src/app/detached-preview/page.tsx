import type { Metadata } from 'next';
import DetachedPreviewShell from '@/components/layout/DetachedPreviewShell';

export const metadata: Metadata = {
  title: 'Detached Preview — RodSandbox',
};

export default function DetachedPreviewPage() {
  return <DetachedPreviewShell />;
}
