import { Workspace, VirtualFile, FileId, FileLanguage, TreeNode } from '@/types';

const FOLDER_KEEP_FILE = '.keep';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createFile(
  workspace: Workspace,
  name: string,
  path: string,
  language: FileLanguage,
  content: string
): Workspace {
  const now = Date.now();
  const id: FileId = `file-${generateId()}`;
  const file: VirtualFile = { id, name, path, language, content, dirty: false, createdAt: now, updatedAt: now };
  return { ...workspace, files: { ...workspace.files, [id]: file }, updatedAt: now };
}

export function inferLanguageFromPath(path: string): FileLanguage {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return 'typescript';
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return 'typescript';
}

export function createFolder(workspace: Workspace, folderPath: string): Workspace {
  const normalized = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return workspace;
  const keepPath = `${normalized}/${FOLDER_KEEP_FILE}`;
  const existing = Object.values(workspace.files).find((file) => file.path === keepPath);
  if (existing) return workspace;
  return createFile(workspace, FOLDER_KEEP_FILE, keepPath, 'markdown', '');
}

export function updateFileContent(workspace: Workspace, fileId: FileId, content: string): Workspace {
  const file = workspace.files[fileId];
  if (!file) return workspace;
  const now = Date.now();
  return {
    ...workspace,
    files: { ...workspace.files, [fileId]: { ...file, content, dirty: true, updatedAt: now } },
    updatedAt: now,
  };
}

export function renameFile(workspace: Workspace, fileId: FileId, newName: string, newPath: string): Workspace {
  const file = workspace.files[fileId];
  if (!file) return workspace;
  const now = Date.now();
  return {
    ...workspace,
    files: { ...workspace.files, [fileId]: { ...file, name: newName, path: newPath, dirty: true, updatedAt: now } },
    updatedAt: now,
  };
}

export function duplicateFile(workspace: Workspace, fileId: FileId): Workspace {
  const file = workspace.files[fileId];
  if (!file) return workspace;
  const dot = file.name.lastIndexOf('.');
  const baseName = dot > 0 ? file.name.slice(0, dot) : file.name;
  const ext = dot > 0 ? file.name.slice(dot) : '';
  const duplicatedName = `${baseName}.copy${ext}`;
  const duplicatedPath = file.path.replace(file.name, duplicatedName);
  return createFile(workspace, duplicatedName, duplicatedPath, file.language, file.content);
}

export function moveFile(workspace: Workspace, fileId: FileId, newPath: string): Workspace {
  const file = workspace.files[fileId];
  if (!file) return workspace;
  const normalizedPath = newPath.replace(/^\/+/, '');
  const newName = normalizedPath.split('/').pop() || file.name;
  return renameFile(workspace, fileId, newName, normalizedPath);
}

export function deleteFile(workspace: Workspace, fileId: FileId): Workspace {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [fileId]: _removed, ...rest } = workspace.files;
  const now = Date.now();
  return {
    ...workspace,
    files: rest,
    activeFileId: workspace.activeFileId === fileId ? null : workspace.activeFileId,
    updatedAt: now,
  };
}

export function deleteFolder(workspace: Workspace, folderPath: string): Workspace {
  const normalized = folderPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return workspace;
  const prefix = `${normalized}/`;
  const files = Object.values(workspace.files)
    .filter((file) => !file.path.startsWith(prefix));
  const nextFiles = Object.fromEntries(files.map((file) => [file.id, file]));
  const activeFileStillExists = workspace.activeFileId ? Boolean(nextFiles[workspace.activeFileId]) : true;
  return {
    ...workspace,
    files: nextFiles,
    activeFileId: activeFileStillExists ? workspace.activeFileId : null,
    updatedAt: Date.now(),
  };
}

export function renameFolder(workspace: Workspace, oldPath: string, newPath: string): Workspace {
  const normalizedOld = oldPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const normalizedNew = newPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalizedOld || !normalizedNew) return workspace;
  const now = Date.now();
  const nextFiles = Object.fromEntries(
    Object.values(workspace.files).map((file) => {
      if (file.path === normalizedOld || file.path.startsWith(`${normalizedOld}/`)) {
        const suffix = file.path.slice(normalizedOld.length);
        const updatedPath = `${normalizedNew}${suffix}`;
        const updatedName = updatedPath.split('/').pop() || file.name;
        return [file.id, { ...file, path: updatedPath, name: updatedName, dirty: true, updatedAt: now }];
      }
      return [file.id, file];
    }),
  );
  return {
    ...workspace,
    files: nextFiles,
    updatedAt: now,
  };
}

export function upsertFiles(
  workspace: Workspace,
  filesToUpsert: Array<{ path: string; content: string; language?: FileLanguage }>,
): Workspace {
  let nextWorkspace = workspace;
  for (const entry of filesToUpsert) {
    const normalizedPath = entry.path.replace(/^\/+/, '');
    if (!normalizedPath) continue;
    const existing = getFileByPath(nextWorkspace, normalizedPath);
    const language = entry.language ?? inferLanguageFromPath(normalizedPath);
    if (existing) {
      nextWorkspace = renameFile(nextWorkspace, existing.id, existing.name, normalizedPath);
      nextWorkspace = updateFileContent(nextWorkspace, existing.id, entry.content);
    } else {
      const name = normalizedPath.split('/').pop() || 'file.ts';
      nextWorkspace = createFile(nextWorkspace, name, normalizedPath, language, entry.content);
    }
  }
  return nextWorkspace;
}

export function getFileById(workspace: Workspace, fileId: FileId): VirtualFile | undefined {
  return workspace.files[fileId];
}

export function getFileByPath(workspace: Workspace, path: string): VirtualFile | undefined {
  return Object.values(workspace.files).find((f) => f.path === path);
}

export function listFiles(workspace: Workspace): VirtualFile[] {
  return Object.values(workspace.files);
}

export function markFileDirty(workspace: Workspace, fileId: FileId): Workspace {
  const file = workspace.files[fileId];
  if (!file || file.dirty) return workspace;
  return { ...workspace, files: { ...workspace.files, [fileId]: { ...file, dirty: true } } };
}

export function markFileClean(workspace: Workspace, fileId: FileId): Workspace {
  const file = workspace.files[fileId];
  if (!file || !file.dirty) return workspace;
  return { ...workspace, files: { ...workspace.files, [fileId]: { ...file, dirty: false } } };
}

export function buildFileTree(workspace: Workspace): TreeNode[] {
  const files = listFiles(workspace).filter((file) => file.name !== FOLDER_KEEP_FILE);
  const root: TreeNode[] = [];
  const folders: Record<string, TreeNode> = {};

  const sorted = [...files].sort((a, b) => {
    const aParts = a.path.split('/');
    const bParts = b.path.split('/');
    if (aParts.length !== bParts.length) return bParts.length - aParts.length;
    return a.name.localeCompare(b.name);
  });

  for (const file of sorted) {
    const parts = file.path.split('/');
    if (parts.length === 1) {
      root.push({ id: file.id, name: file.name, path: file.path, type: 'file', language: file.language, dirty: file.dirty });
    } else {
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const segment = parts[i];
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        if (!folders[currentPath]) {
          const folderNode: TreeNode = { id: `folder-${currentPath}`, name: segment, path: currentPath, type: 'folder', children: [] };
          folders[currentPath] = folderNode;
          if (i === 0) root.push(folderNode);
          else {
            const parentPath = parts.slice(0, i).join('/');
            folders[parentPath]?.children?.push(folderNode);
          }
        }
      }
      const parentPath = parts.slice(0, -1).join('/');
      const fileNode: TreeNode = { id: file.id, name: file.name, path: file.path, type: 'file', language: file.language, dirty: file.dirty };
      if (folders[parentPath]) {
        folders[parentPath].children?.push(fileNode);
      } else {
        root.push(fileNode);
      }
    }
  }

  return root;
}
