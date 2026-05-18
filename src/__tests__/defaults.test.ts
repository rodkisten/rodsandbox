import { describe, it, expect } from 'vitest';
import { createDefaultWorkspace } from '@/filesystem/defaults';
import { listFiles } from '@/filesystem/virtualFs';

describe('createDefaultWorkspace', () => {
  it('creates a workspace with 3 files', () => {
    const ws = createDefaultWorkspace('default-test');
    const files = listFiles(ws);
    expect(files).toHaveLength(3);
  });

  it('has index.html', () => {
    const ws = createDefaultWorkspace('default-test');
    const files = listFiles(ws);
    expect(files.some((f) => f.name === 'index.html')).toBe(true);
  });

  it('has main.ts', () => {
    const ws = createDefaultWorkspace('default-test');
    const files = listFiles(ws);
    expect(files.some((f) => f.name === 'main.ts')).toBe(true);
  });

  it('has styles.css', () => {
    const ws = createDefaultWorkspace('default-test');
    const files = listFiles(ws);
    expect(files.some((f) => f.name === 'styles.css')).toBe(true);
  });

  it('sets an active file', () => {
    const ws = createDefaultWorkspace('default-test');
    expect(ws.activeFileId).not.toBeNull();
  });
});
