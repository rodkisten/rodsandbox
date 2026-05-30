'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_REDIRECT_PATH } from '@/constants';
import { Loader2 } from 'lucide-react';

/**
 * Root page — redirects to the workspace picker when authenticated,
 * or to the login page when not.
 */
export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? LOGIN_REDIRECT_PATH : '/login');
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-950">
      <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
    </div>
  );
}

