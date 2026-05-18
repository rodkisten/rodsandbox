import { Workspace, VirtualFile, FileId, FileLanguage, TreeNode } from '@/types';

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
  const files = listFiles(workspace);
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
