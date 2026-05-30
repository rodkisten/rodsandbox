'use client';

import { useContext } from 'react';
import { AuthContext, AuthContextValue } from '@/contexts/AuthContext';

/**
 * Returns the current auth context value.
 *
 * Must be called inside a component that is a descendant of `<AuthProvider>`.
 *
 * @throws {Error} When used outside of `AuthProvider`.
 *
 * @example
 * ```tsx
 * const { user, signOut } = useAuth();
 * ```
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
