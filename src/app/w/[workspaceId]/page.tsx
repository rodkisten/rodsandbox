'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Playground from '@/components/layout/Playground';
import { Loader2 } from 'lucide-react';

/**
 * Workspace IDE page — renders the full Playground for a specific workspace.
 *
 * Route: `/w/[workspaceId]`
 */
export default function WorkspaceIdePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const workspaceId = typeof params?.workspaceId === 'string' ? params.workspaceId : '';

  // Redirect unauthenticated users once auth has resolved.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  // Derive readiness — avoids storing derived state in a separate useState.
  const ready = !authLoading && !!user;

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  return <Playground workspaceId={workspaceId} />;
}
