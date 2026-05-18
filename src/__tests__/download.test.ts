import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile, downloadWorkspaceAsJson } from '@/lib/download';
import type { Workspace } from '@/types';

const mockObjectURL = 'blob:http://localhost/mock-id';

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => mockObjectURL),
    revokeObjectURL: vi.fn(),
  });

  const anchor = {
    href: '',
    download: '',
    style: { display: '' },
    click: vi.fn(),
  };

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') return anchor as unknown as HTMLElement;
    return document.createElement(tag);
  });
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
  vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadFile', () => {
  it('creates an object URL and triggers a click', () => {
    downloadFile('test.txt', 'hello world', 'text/plain');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(document.body.appendChild).toHaveBeenCalledOnce();
    expect(document.body.removeChild).toHaveBeenCalledOnce();
  });

  it('sets the correct filename', () => {
    const anchor = { href: '', download: '', style: { display: '' }, click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLElement);
    downloadFile('my-file.json', '{}', 'application/json');
    expect(anchor.download).toBe('my-file.json');
  });
});

describe('downloadWorkspaceAsJson', () => {
  it('serializes workspace and triggers download', () => {
    const workspace: Workspace = {
      id: 'ws-1',
      name: 'Test',
      files: {},
      activeFileId: null,
      createdAt: 1000,
      updatedAt: 2000,
    };
    const anchor = { href: '', download: '', style: { display: '' }, click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLElement);
    downloadWorkspaceAsJson(workspace);
    expect(anchor.download).toBe('workspace.json');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
});
