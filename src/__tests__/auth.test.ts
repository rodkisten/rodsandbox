/**
 * Tests for the mock auth service.
 *
 * @see {@link src/lib/auth.ts}
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock localStorage ────────────────────────────────────────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

vi.stubGlobal('localStorage', localStorageMock);

// Import after stubbing globals.
import * as Auth from '../lib/auth';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth service', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('signIn', () => {
    it('returns ok=true for valid demo credentials', async () => {
      const result = await Auth.signIn('demo', 'demo');
      expect(result.ok).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.user.displayName).toBe('Demo');
    });

    it('returns ok=false for invalid credentials', async () => {
      const result = await Auth.signIn('bad', 'creds');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.session).toBeUndefined();
    });

    it('persists the session to localStorage after sign-in', async () => {
      await Auth.signIn('demo', 'demo');
      const raw = localStorageMock.getItem('rodsandbox:auth-session');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.user.id).toBeTruthy();
    });
  });

  describe('getSession', () => {
    it('returns null when nothing is stored', () => {
      expect(Auth.getSession()).toBeNull();
    });

    it('returns the session after sign-in', async () => {
      await Auth.signIn('demo', 'demo');
      const session = Auth.getSession();
      expect(session).not.toBeNull();
      expect(session?.user.email).toBe('demo@rodsandbox.local');
    });
  });

  describe('getCurrentUser', () => {
    it('returns null when not signed in', () => {
      expect(Auth.getCurrentUser()).toBeNull();
    });

    it('returns the user after sign-in', async () => {
      await Auth.signIn('demo', 'demo');
      const user = Auth.getCurrentUser();
      expect(user?.provider).toBe('mock');
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when not signed in', () => {
      expect(Auth.isAuthenticated()).toBe(false);
    });

    it('returns true after sign-in', async () => {
      await Auth.signIn('demo', 'demo');
      expect(Auth.isAuthenticated()).toBe(true);
    });
  });

  describe('signOut', () => {
    it('clears the session from localStorage', async () => {
      await Auth.signIn('demo', 'demo');
      expect(Auth.isAuthenticated()).toBe(true);
      await Auth.signOut();
      expect(Auth.isAuthenticated()).toBe(false);
      expect(Auth.getSession()).toBeNull();
    });
  });
});
