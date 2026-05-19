import { describe, expect, it } from 'vitest';
import { createDefaultWorkspace } from '@/filesystem/defaults';
import { exportWorkspaceJson, importWorkspaceJson } from '@/lib/workspaceTransfer';

describe('workspaceTransfer', () => {
  it('exports and imports workspace JSON', () => {
    const ws = createDefaultWorkspace('ws-1');
    const json = exportWorkspaceJson(ws);
    const restored = importWorkspaceJson(json);
    expect(restored.version).toBe(1);
    expect(restored.files.length).toBeGreaterThan(0);
    expect(restored.files.some((file) => file.path === 'main.ts')).toBe(true);
  });

  it('rejects invalid payloads', () => {
    expect(() => importWorkspaceJson('{"version":2}')).toThrow();
  });

  it('normalizes invalid languages from imported payloads', () => {
    const restored = importWorkspaceJson(JSON.stringify({
      version: 1,
      name: 'demo',
      files: [{ path: 'src/main.tsx', language: 'not-real', content: 'export const a = 1;' }],
    }));

    expect(restored.files[0]?.language).toBe('typescript');
  });
});
