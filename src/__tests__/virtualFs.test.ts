import { describe, it, expect } from 'vitest';
import { createFile, updateFileContent, deleteFile, renameFile, buildFileTree, listFiles } from '@/filesystem/virtualFs';
import { createDefaultWorkspace } from '@/filesystem/defaults';

const baseWorkspace = createDefaultWorkspace('test-ws');

describe('virtualFs', () => {
  it('createFile adds a new file', () => {
    const ws = createFile(baseWorkspace, 'test.ts', 'test.ts', 'typescript', '// test');
    const files = listFiles(ws);
    expect(files.some((f) => f.name === 'test.ts')).toBe(true);
  });

  it('updateFileContent marks file dirty', () => {
    const files = listFiles(baseWorkspace);
    const file = files[0];
    const updated = updateFileContent(baseWorkspace, file.id, 'new content');
    expect(updated.files[file.id].content).toBe('new content');
    expect(updated.files[file.id].dirty).toBe(true);
  });

  it('deleteFile removes the file', () => {
    const files = listFiles(baseWorkspace);
    const file = files[0];
    const updated = deleteFile(baseWorkspace, file.id);
    expect(updated.files[file.id]).toBeUndefined();
  });

  it('renameFile updates name and path', () => {
    const files = listFiles(baseWorkspace);
    const file = files[0];
    const updated = renameFile(baseWorkspace, file.id, 'renamed.ts', 'renamed.ts');
    expect(updated.files[file.id].name).toBe('renamed.ts');
    expect(updated.files[file.id].path).toBe('renamed.ts');
  });

  it('buildFileTree returns array', () => {
    const tree = buildFileTree(baseWorkspace);
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);
  });

  it('deleteFile sets activeFileId to null if deleted file was active', () => {
    const ws = { ...baseWorkspace, activeFileId: 'file-index-html' };
    const updated = deleteFile(ws, 'file-index-html');
    expect(updated.activeFileId).toBeNull();
  });
});
