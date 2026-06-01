import type { Metadata } from 'next';
import DetachedEditorShell from '@/components/layout/DetachedEditorShell';

export const metadata: Metadata = {
  title: 'Detached Editor — RodSandbox',
};

export default function DetachedEditorPage() {
  return <DetachedEditorShell />;
}
