'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LOGIN_REDIRECT_PATH } from '@/constants';
import { Code2, Loader2 } from 'lucide-react';

/**
 * Login page — placeholder auth screen.
 *
 * Demo credentials: `demo` / `demo`.
 *
 * TODO: Replace the form body with a real OAuth provider (GitHub, Google, etc.)
 *       or a credential API call to `/api/auth/signin`.
 */
export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, skip to the app.
  useEffect(() => {
    if (!loading && user) {
      router.replace(LOGIN_REDIRECT_PATH);
    }
  }, [user, loading, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await signIn(username, password);
      if (result.ok) {
        router.replace(LOGIN_REDIRECT_PATH);
      } else {
        setError(result.error ?? 'Sign in failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      {/* Brand mark */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-700/60 bg-neutral-900 shadow-lg">
          <Code2 className="h-7 w-7 text-sky-400" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">RodSandbox</h1>
          <p className="mt-1 text-sm text-neutral-500">Mobile-first cloud IDE</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-2xl backdrop-blur-sm">
        <h2 className="mb-6 text-lg font-medium text-neutral-200">Sign in</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-xs font-medium text-neutral-400">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="demo"
              required
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-neutral-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-sky-400 active:bg-sky-600 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </button>
        </form>

        {/* Demo hint */}
        <p className="mt-5 text-center text-xs text-neutral-600">
          Demo credentials:{' '}
          <span className="font-mono text-neutral-500">demo</span>
          {' / '}
          <span className="font-mono text-neutral-500">demo</span>
        </p>

        {/* TODO: Add OAuth buttons (GitHub, Google) here once a real provider is configured. */}
      </div>
    </div>
  );
}
