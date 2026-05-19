import type { FileLanguage, Workspace } from '@/types';

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
  const files = payload.files.filter((file): file is WorkspaceJsonFile => Boolean(file && typeof file.path === 'string' && typeof file.language === 'string' && typeof file.content === 'string'));
  if (files.length === 0) throw new Error('Workspace JSON has no valid files');
  return { version: 1, name: payload.name, files };
}
