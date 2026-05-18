import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
