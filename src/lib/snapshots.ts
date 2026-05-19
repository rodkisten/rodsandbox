import type { FileLanguage, Workspace } from '@/types';

export interface WorkspaceSnapshotFile {
  path: string;
  language: FileLanguage;
  content: string;
}

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  createdAt: number;
  workspaceId: string;
  files: WorkspaceSnapshotFile[];
}

const SNAPSHOT_STORAGE_KEY = 'rodsandbox:snapshots:v1';
const VALID_FILE_LANGUAGES: ReadonlySet<FileLanguage> = new Set(['typescript', 'javascript', 'html', 'css', 'json', 'markdown']);

function isSnapshotFile(value: unknown): value is WorkspaceSnapshotFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceSnapshotFile>;
  return typeof candidate.path === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.language === 'string'
    && VALID_FILE_LANGUAGES.has(candidate.language as FileLanguage);
}

function isSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkspaceSnapshot>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.workspaceId === 'string'
    && typeof candidate.createdAt === 'number'
    && Array.isArray(candidate.files)
    && candidate.files.every(isSnapshotFile);
}

function loadSnapshots(): WorkspaceSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSnapshot) : [];
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots: WorkspaceSnapshot[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
}

export function listWorkspaceSnapshots(workspaceId: string): WorkspaceSnapshot[] {
  return loadSnapshots()
    .filter((snapshot) => snapshot.workspaceId === workspaceId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function createWorkspaceSnapshot(workspace: Workspace, name: string): WorkspaceSnapshot {
  const snapshot: WorkspaceSnapshot = {
    id: `snap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || `Snapshot ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    workspaceId: workspace.id,
    files: Object.values(workspace.files).map((file) => ({
      path: file.path,
      language: file.language,
      content: file.content,
    })),
  };

  const snapshots = loadSnapshots();
  snapshots.push(snapshot);
  saveSnapshots(snapshots);
  return snapshot;
}

export function deleteWorkspaceSnapshot(snapshotId: string): void {
  const snapshots = loadSnapshots().filter((snapshot) => snapshot.id !== snapshotId);
  saveSnapshots(snapshots);
}

export function getWorkspaceSnapshot(snapshotId: string): WorkspaceSnapshot | null {
  return loadSnapshots().find((snapshot) => snapshot.id === snapshotId) ?? null;
}

export function diffSnapshotAgainstWorkspace(snapshot: WorkspaceSnapshot, workspace: Workspace): string[] {
  const workspaceMap = new Map(Object.values(workspace.files).map((file) => [file.path, file.content]));
  const snapshotMap = new Map(snapshot.files.map((file) => [file.path, file.content]));

  const changed = new Set<string>();
  for (const [path, content] of snapshotMap.entries()) {
    if (!workspaceMap.has(path) || workspaceMap.get(path) !== content) changed.add(path);
  }
  for (const [path, content] of workspaceMap.entries()) {
    if (!snapshotMap.has(path) || snapshotMap.get(path) !== content) changed.add(path);
  }
  return Array.from(changed).sort();
}
