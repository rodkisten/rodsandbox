/**
 * Tests for GitService helper functions.
 *
 * GitService relies on isomorphic-git + LightningFS (an IndexedDB-backed
 * virtual filesystem). Both are mocked here so the tests run in Node/Vitest
 * without a real browser environment.
 *
 * Tests cover:
 * - `syncWorkspaceToFs` — directory creation and file writing
 * - `readFsToWorkspace` — reading files back from the virtual FS
 *
 * @see {@link src/services/git/gitService.ts}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workspace, VirtualFile } from '../types';

// ─── Shared mock state (hoisted so vi.mock factories can reference it) ────────

const { mockPfs } = vi.hoisted(() => {
  const mockPfs = {
    mkdir: vi.fn(async (_path: string) => {}),
    writeFile: vi.fn(async (_path: string, _content: string, _enc: string) => {}),
    readFile: vi.fn(async (_path: string, _enc: string) => ''),
    readdir: vi.fn(async (_path: string): Promise<string[]> => []),
    stat: vi.fn(async (_path: string) => ({
      isFile: () => false,
      isDirectory: () => true,
    })),
  };
  return { mockPfs };
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@isomorphic-git/lightning-fs', () => {
  // Must use a regular function (not an arrow function) so `new` works.
  function LightningFS(_name: string) {
    return { promises: mockPfs };
  }
  return { default: LightningFS };
});

vi.mock('isomorphic-git', () => ({
  default: {
    init: vi.fn(async () => {}),
    statusMatrix: vi.fn(async () => []),
    add: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    commit: vi.fn(async () => 'abc1234'),
    log: vi.fn(async () => []),
    listBranches: vi.fn(async () => ['main']),
    currentBranch: vi.fn(async () => 'main'),
    branch: vi.fn(async () => {}),
    checkout: vi.fn(async () => {}),
    listRemotes: vi.fn(async () => []),
    addRemote: vi.fn(async () => {}),
  },
}));

// Import after mocks are in place.
import { syncWorkspaceToFs, readFsToWorkspace } from '../services/git/gitService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(path: string, content: string): VirtualFile {
  return {
    id: path,
    name: path.split('/').pop()!,
    path,
    content,
    language: 'typescript',
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeWorkspace(files: VirtualFile[]): Workspace {
  return {
    id: 'test-ws',
    name: 'Test',
    files: Object.fromEntries(files.map((f) => [f.id, f])),
    createdAt: 0,
    updatedAt: 0,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('syncWorkspaceToFs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a flat file to the correct path', async () => {
    const ws = makeWorkspace([makeFile('index.ts', 'export {}')]);
    await syncWorkspaceToFs(ws);
    expect(mockPfs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('index.ts'),
      'export {}',
      'utf8',
    );
  });

  it('creates the workspace root directory before writing', async () => {
    const ws = makeWorkspace([makeFile('main.ts', '// main')]);
    await syncWorkspaceToFs(ws);
    expect(mockPfs.mkdir).toHaveBeenCalledWith(expect.stringContaining('test-ws'));
  });

  it('creates parent directories for nested files', async () => {
    const ws = makeWorkspace([makeFile('src/utils/helpers.ts', '// helpers')]);
    await syncWorkspaceToFs(ws);
    const mkdirPaths: string[] = mockPfs.mkdir.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(mkdirPaths.some((p) => p.includes('/src'))).toBe(true);
  });

  it('writes multiple files', async () => {
    const ws = makeWorkspace([
      makeFile('a.ts', '// a'),
      makeFile('b.ts', '// b'),
    ]);
    await syncWorkspaceToFs(ws);
    expect(mockPfs.writeFile).toHaveBeenCalledTimes(2);
  });
});

describe('readFsToWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array when the directory is empty', async () => {
    mockPfs.readdir.mockResolvedValueOnce([]);
    const result = await readFsToWorkspace('test-ws');
    expect(result).toEqual([]);
  });
});
