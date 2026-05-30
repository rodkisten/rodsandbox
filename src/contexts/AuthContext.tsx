'use client';

/**
 * AuthContext — provides the current auth state to the React tree.
 *
 * Usage:
 * ```tsx
 * const { user, signIn, signOut, loading } = useAuth();
 * ```
 *
 * Wrap the app root with `<AuthProvider>` in `layout.tsx`.
 */

import React, { createContext, useCallback, useMemo, useState } from 'react';
import * as AuthService from '@/lib/auth';
import { User } from '@/types';

// ─── Context shape ────────────────────────────────────────────────────────────

export interface AuthContextValue {
  /** Currently authenticated user, or `null` if signed out. */
  user: User | null;
  /** `true` while the initial session check is in progress. */
  loading: boolean;
  /** Attempt to sign in. Returns `{ ok, error }`. */
  signIn(username: string, password: string): Promise<{ ok: boolean; error?: string }>;
  /** Sign out and clear the session. */
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer reads the session synchronously from localStorage on the
  // client side, avoiding a setState call inside a useEffect.
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    return AuthService.getSession()?.user ?? null;
  });
  // Session reads are synchronous, so no async loading phase is needed.
  const loading = false;

  const handleSignIn = useCallback(
    async (username: string, password: string) => {
      const result = await AuthService.signIn(username, password);
      if (result.ok && result.session) {
        setUser(result.session.user);
      }
      return { ok: result.ok, error: result.error };
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    await AuthService.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn: handleSignIn, signOut: handleSignOut }),
    [user, loading, handleSignIn, handleSignOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
