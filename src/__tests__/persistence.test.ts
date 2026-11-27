import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDB } from 'idb';
import { createDefaultWorkspace } from '@/filesystem/defaults';

// Mock idb
vi.mock('idb', () => {
  const store = new Map<string, unknown>();
  const mockDb = {
    put: vi.fn(async (_storeName: string, value: unknown, key?: string) => {
      const k = key ?? (value as { id?: string }).id ?? key;
      store.set(String(k), value);
    }),
    get: vi.fn(async (_storeName: string, key: string) => store.get(key)),
    getAll: vi.fn(async () => Array.from(store.values())),
    delete: vi.fn(async (_storeName: string, key: string) => store.delete(key)),
  };
  return {
    openDB: vi.fn(async () => mockDb),
  };
});

describe('persistence', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('saveWorkspace and loadWorkspace round-trip', async () => {
    const { saveWorkspace, loadWorkspace } = await import('@/persistence/db');
    const ws = createDefaultWorkspace('test-persist');
    await saveWorkspace(ws);
    const loaded = await loadWorkspace('test-persist');
    expect(loaded?.id).toBe('test-persist');
    expect(loaded?.name).toBe(ws.name);
  });

  it('isolates database names for concurrent users/workspaces', async () => {
    const { createPersistence } = await import('@/persistence/db');
    const a = createPersistence('manage:alice:project-a');
    const b = createPersistence('manage:bob:project-a');
    await Promise.all([a.openDb(), b.openDb()]);
    const names = vi.mocked(openDB).mock.calls.map(call => call[0]);
    expect(names).toContain('rodsandbox:manage%3Aalice%3Aproject-a');
    expect(names).toContain('rodsandbox:manage%3Abob%3Aproject-a');
  });

  it('saveReplHistory and loadReplHistory round-trip', async () => {
    const { saveReplHistory, loadReplHistory } = await import('@/persistence/db');
    await saveReplHistory(['one', 'two']);
    const history = await loadReplHistory();
    expect(history).toEqual(['one', 'two']);
  });
});
