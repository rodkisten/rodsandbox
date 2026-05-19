import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultWorkspace } from '@/filesystem/defaults';
import {
  createWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  diffSnapshotAgainstWorkspace,
  getWorkspaceSnapshot,
  listWorkspaceSnapshots,
} from '@/lib/snapshots';

describe('snapshots', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates and lists snapshots', () => {
    const ws = createDefaultWorkspace('ws-1');
    const snap = createWorkspaceSnapshot(ws, 'first');
    const list = listWorkspaceSnapshots(ws.id);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(snap.id);
  });

  it('diffs snapshots against workspace', () => {
    const ws = createDefaultWorkspace('ws-2');
    const snap = createWorkspaceSnapshot(ws, 'base');
    ws.files[ws.activeFileId!].content += '\nconsole.log(1);';
    const loaded = getWorkspaceSnapshot(snap.id);
    expect(loaded).not.toBeNull();
    const changed = diffSnapshotAgainstWorkspace(loaded!, ws);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('deletes snapshots', () => {
    const ws = createDefaultWorkspace('ws-3');
    const snap = createWorkspaceSnapshot(ws, 'to-delete');
    deleteWorkspaceSnapshot(snap.id);
    expect(getWorkspaceSnapshot(snap.id)).toBeNull();
  });

  it('ignores malformed snapshots in localStorage', () => {
    const ws = createDefaultWorkspace('ws-4');
    localStorage.setItem('rodsandbox:snapshots:v1', JSON.stringify([
      { id: 'broken', files: 'not-an-array' },
      { id: 'valid', name: 'ok', createdAt: 1, workspaceId: ws.id, files: [{ path: 'main.ts', language: 'typescript', content: 'export {};' }] },
    ]));

    const listed = listWorkspaceSnapshots(ws.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe('valid');
  });
});
