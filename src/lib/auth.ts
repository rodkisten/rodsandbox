/**
 * Placeholder authentication service.
 *
 * Architecture:
 * - All auth state is stored in localStorage under `AUTH_SESSION_LS_KEY`.
 * - The `AuthSession` contains a mock `token` string.
 * - TODO: Replace `mockSignIn` with a real OAuth / credential flow.
 *   e.g. NextAuth.js, Clerk, or a custom JWT endpoint at `/api/auth`.
 * - TODO: Replace localStorage token with an httpOnly cookie issued by the server.
 */

import { User, AuthSession } from '@/types';
import { AUTH_SESSION_LS_KEY } from '@/constants';

// ─── Mock credential store ────────────────────────────────────────────────────

/**
 * Hard-coded demo credential.
 * TODO: Remove once a real auth provider is wired in.
 */
const MOCK_CREDENTIAL = { username: 'demo', password: 'demo' } as const;

function buildMockUser(username: string): User {
  return {
    id: `user-${username}`,
    displayName: username.charAt(0).toUpperCase() + username.slice(1),
    email: `${username}@rodsandbox.local`,
    provider: 'mock',
  };
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_SESSION_LS_KEY, JSON.stringify(session));
}

function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_SESSION_LS_KEY);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the current authenticated session, or `null` if the user is not
 * signed in.
 */
export function getSession(): AuthSession | null {
  return readSession();
}

/**
 * Returns the current user, or `null` if not authenticated.
 */
export function getCurrentUser(): User | null {
  return readSession()?.user ?? null;
}

/**
 * Returns `true` when a valid session exists.
 */
export function isAuthenticated(): boolean {
  return readSession() !== null;
}

export interface SignInResult {
  ok: boolean;
  error?: string;
  session?: AuthSession;
}

/**
 * Attempts to sign in with the provided credentials.
 *
 * @param username - User identifier.
 * @param password - Plain-text password (mock only; never send real passwords over plain HTTP).
 *
 * TODO: Replace this body with a `fetch('/api/auth/signin', { method: 'POST', … })`
 *       call that returns a session cookie or JWT from a real auth provider.
 */
export async function signIn(username: string, password: string): Promise<SignInResult> {
  // Simulate async network call
  await new Promise((r) => setTimeout(r, 300));

  if (
    username.trim().toLowerCase() !== MOCK_CREDENTIAL.username ||
    password !== MOCK_CREDENTIAL.password
  ) {
    return { ok: false, error: 'Invalid credentials. Use demo / demo.' };
  }

  const session: AuthSession = {
    user: buildMockUser(username.trim().toLowerCase()),
    loginAt: new Date().toISOString(),
    token: `mock-token-${Date.now()}`,
  };

  writeSession(session);
  return { ok: true, session };
}

/**
 * Signs out the current user and clears the local session.
 *
 * TODO: Also invalidate the server-side session / revoke the JWT.
 */
export async function signOut(): Promise<void> {
  await new Promise((r) => setTimeout(r, 100));
  clearSession();
}
