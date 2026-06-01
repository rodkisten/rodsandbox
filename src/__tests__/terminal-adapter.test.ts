/**
 * Tests for the terminal runtime adapter factory.
 *
 * @see {@link src/services/terminal/adapter.ts}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createTerminalAdapter', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns a VercelFallbackAdapter when VERCEL env is set', async () => {
    vi.stubEnv('VERCEL', '1');
    const { createTerminalAdapter } = await import('../services/terminal/adapter');
    const adapter = createTerminalAdapter();
    expect(adapter.info.supportsExecution).toBe(false);
    expect(adapter.info.label).toContain('Serverless');
  });

  it('returns an adapter with supportsExecution=false when NEXT_RUNTIME is edge', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { createTerminalAdapter } = await import('../services/terminal/adapter');
    const adapter = createTerminalAdapter();
    expect(adapter.info.supportsExecution).toBe(false);
  });

  it('returns a LocalTerminalAdapter when no Vercel env is present', async () => {
    // Ensure env vars are not set.
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NEXT_RUNTIME', '');
    const { createTerminalAdapter } = await import('../services/terminal/adapter');
    const adapter = createTerminalAdapter();
    // Local adapter is a stub pending node-pty; supportsExecution reflects
    // the actual implementation status (false until /api/terminal is wired).
    expect(typeof adapter.info.supportsExecution).toBe('boolean');
    expect(adapter.info.label).toContain('Local');
  });

  it('connect() and disconnect() do not throw on VercelFallbackAdapter', async () => {
    vi.stubEnv('VERCEL', '1');
    const { createTerminalAdapter } = await import('../services/terminal/adapter');
    const adapter = createTerminalAdapter();
    // connect() requires a handlers object with at least an onData callback.
    expect(() => adapter.connect({ onData: () => {} })).not.toThrow();
    expect(() => adapter.disconnect()).not.toThrow();
  });

  it('connect() writes a banner message on VercelFallbackAdapter', async () => {
    vi.stubEnv('VERCEL', '1');
    const { createTerminalAdapter } = await import('../services/terminal/adapter');
    const adapter = createTerminalAdapter();
    const received: string[] = [];
    adapter.connect({ onData: (d) => received.push(d) });
    expect(received.length).toBeGreaterThan(0);
    expect(received.join('')).toMatch(/terminal/i);
  });
});

describe('TerminalAdapter interface', () => {
  it('VercelFallbackAdapter implements the full interface', async () => {
    vi.stubEnv('VERCEL', '1');
    const { createTerminalAdapter } = await import('../services/terminal/adapter');
    const adapter = createTerminalAdapter();
    expect(typeof adapter.connect).toBe('function');
    expect(typeof adapter.disconnect).toBe('function');
    expect(typeof adapter.write).toBe('function');
    expect(typeof adapter.resize).toBe('function');
    expect(adapter.info).toBeDefined();
    expect(typeof adapter.info.label).toBe('string');
    expect(typeof adapter.info.supportsExecution).toBe('boolean');
  });
});
