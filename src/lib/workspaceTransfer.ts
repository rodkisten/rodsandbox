import type { FileLanguage, Workspace } from '@/types';
import { inferLanguageFromPath } from '@/filesystem/virtualFs';

export interface WorkspaceJsonFile {
  path: string;
  language: FileLanguage;
  content: string;
}

export interface WorkspaceJsonPayload {
  version: 1;
  name: string;
  files: WorkspaceJsonFile[];
}

const VALID_FILE_LANGUAGES = new Set<FileLanguage>(['typescript', 'javascript', 'html', 'css', 'json', 'markdown']);

export function exportWorkspaceJson(workspace: Workspace): string {
  const payload: WorkspaceJsonPayload = {
    version: 1,
    name: workspace.name,
    files: Object.values(workspace.files).map((file) => ({
      path: file.path,
      language: file.language,
      content: file.content,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function importWorkspaceJson(input: string): WorkspaceJsonPayload {
  const parsed: unknown = JSON.parse(input);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid workspace JSON');
  const payload = parsed as Partial<WorkspaceJsonPayload>;
  if (payload.version !== 1 || typeof payload.name !== 'string' || !Array.isArray(payload.files)) {
    throw new Error('Unsupported workspace JSON schema');
  }
  const files = payload.files.flatMap((file): WorkspaceJsonFile[] => {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') return [];
    const language = typeof file.language === 'string' && VALID_FILE_LANGUAGES.has(file.language as FileLanguage)
      ? (file.language as FileLanguage)
      : inferLanguageFromPath(file.path);
    return [{ path: file.path, language, content: file.content }];
  });
  if (files.length === 0) throw new Error('Workspace JSON has no valid files');
  return { version: 1, name: payload.name, files };
}
