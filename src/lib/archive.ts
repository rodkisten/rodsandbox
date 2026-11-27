import JSZip from 'jszip';
import type { FileLanguage, Workspace } from '@/types';
import { downloadFile } from '@/lib/download';

export interface ImportedFile {
  path: string;
  content: string;
  language: FileLanguage;
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

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/');
}

export async function importZipFile(file: File): Promise<ImportedFile[]> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const imported = await Promise.all(entries.map(async (entry) => {
    const path = normalizePath(entry.name);
    const content = await entry.async('string');
    return {
      path,
      content,
      language: inferLanguageFromPath(path),
    };
  }));
  return imported.filter((entry) => Boolean(entry.path));
}

export async function importFileList(files: FileList): Promise<ImportedFile[]> {
  const imported = await Promise.all(Array.from(files).map(async (file) => {
    const anyFile = file as File & { webkitRelativePath?: string };
    const path = normalizePath(anyFile.webkitRelativePath || file.name);
    const content = await file.text();
    return {
      path,
      content,
      language: inferLanguageFromPath(path),
    };
  }));
  return imported.filter((entry) => Boolean(entry.path));
}

export async function exportWorkspaceAsZip(workspace: Workspace, selectedIds?: ReadonlySet<string>): Promise<void> {
  const zip = new JSZip();
  for (const file of Object.values(workspace.files)) {
    if (file.name === '.keep' || (selectedIds && !selectedIds.has(file.id))) continue;
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadFile(`${workspace.name || 'workspace'}${selectedIds ? '-selection' : ''}.zip`, blob, 'application/zip');
}
