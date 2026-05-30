import { openDB, IDBPDatabase } from 'idb';
import { Workspace, AppSettings, WorkspaceSummary, LogEntry } from '@/types';
import { DB_NAME, DB_VERSION, WORKSPACE_STORE, SETTINGS_STORE, SETTINGS_KEY, REPL_HISTORY_KEY, TERMINAL_HISTORY_KEY, CONSOLE_LOGS_KEY } from '@/constants';

type RodSandboxDB = {
  workspaces: { key: string; value: Workspace };
  settings: { key: string; value: AppSettings | string[] | LogEntry[] };
};

let dbPromise: Promise<IDBPDatabase<RodSandboxDB>> | null = null;
const LS_WORKSPACE_PREFIX = 'rodsandbox:workspace:';
const LS_SETTINGS_KEY = 'rodsandbox:settings';
const LS_REPL_HISTORY_KEY = 'rodsandbox:repl-history';
const LS_TERMINAL_HISTORY_KEY = 'rodsandbox:terminal-history';
const LS_CONSOLE_LOGS_KEY = 'rodsandbox:console-logs';

export function openDb(): Promise<IDBPDatabase<RodSandboxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RodSandboxDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
            db.createObjectStore(WORKSPACE_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
            db.createObjectStore(SETTINGS_STORE);
          }
        }
        // v2: no schema change — ownerId was added as an optional field
      },
    });
  }
  return dbPromise;
}

function safeLocalStorageGet<T>(key: string): T | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function safeLocalStorageSet<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op fallback
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  } catch {
    // no-op fallback
  }
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  try {
    const db = await openDb();
    await db.put(WORKSPACE_STORE, workspace);
  } catch {
    safeLocalStorageSet(`${LS_WORKSPACE_PREFIX}${workspace.id}`, workspace);
  }
}

export async function loadWorkspace(id: string): Promise<Workspace | undefined> {
  try {
    const db = await openDb();
    return db.get(WORKSPACE_STORE, id);
  } catch {
    return safeLocalStorageGet<Workspace>(`${LS_WORKSPACE_PREFIX}${id}`);
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const db = await openDb();
    await db.put(SETTINGS_STORE, settings, SETTINGS_KEY);
  } catch {
    safeLocalStorageSet(LS_SETTINGS_KEY, settings);
  }
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  try {
    const db = await openDb();
    const value = await db.get(SETTINGS_STORE, SETTINGS_KEY);
    return Array.isArray(value) ? undefined : value;
  } catch {
    return safeLocalStorageGet<AppSettings>(LS_SETTINGS_KEY);
  }
}

export async function listWorkspaces(): Promise<Workspace[]> {
  try {
    const db = await openDb();
    return db.getAll(WORKSPACE_STORE);
  } catch {
    if (typeof window === 'undefined') return [];
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(LS_WORKSPACE_PREFIX))
      .map((key) => safeLocalStorageGet<Workspace>(key))
      .filter((value): value is Workspace => Boolean(value));
  }
}

/**
 * Returns lightweight summaries for all workspaces owned by `ownerId`,
 * without loading full file contents.
 *
 * @param ownerId - User ID to filter by. Pass `undefined` to return all workspaces.
 */
export async function listWorkspaceSummaries(ownerId?: string): Promise<WorkspaceSummary[]> {
  const all = await listWorkspaces();
  return all
    .filter((ws) => !ownerId || !ws.ownerId || ws.ownerId === ownerId)
    .map((ws) => ({
      id: ws.id,
      name: ws.name,
      ownerId: ws.ownerId,
      fileCount: Object.keys(ws.files).length,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteWorkspace(id: string): Promise<void> {
  try {
    const db = await openDb();
    await db.delete(WORKSPACE_STORE, id);
  } catch {
    safeLocalStorageRemove(`${LS_WORKSPACE_PREFIX}${id}`);
  }
}

export async function saveReplHistory(history: string[]): Promise<void> {
  try {
    const db = await openDb();
    await db.put(SETTINGS_STORE, history, REPL_HISTORY_KEY);
  } catch {
    safeLocalStorageSet(LS_REPL_HISTORY_KEY, history);
  }
}

export async function loadReplHistory(): Promise<string[]> {
  try {
    const db = await openDb();
    const history = await db.get(SETTINGS_STORE, REPL_HISTORY_KEY);
    return Array.isArray(history) ? history.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return safeLocalStorageGet<string[]>(LS_REPL_HISTORY_KEY) ?? [];
  }
}

export async function saveTerminalHistory(history: string[]): Promise<void> {
  try {
    const db = await openDb();
    await db.put(SETTINGS_STORE, history, TERMINAL_HISTORY_KEY);
  } catch {
    safeLocalStorageSet(LS_TERMINAL_HISTORY_KEY, history);
  }
}

export async function loadTerminalHistory(): Promise<string[]> {
  try {
    const db = await openDb();
    const history = await db.get(SETTINGS_STORE, TERMINAL_HISTORY_KEY);
    return Array.isArray(history) ? history.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return safeLocalStorageGet<string[]>(LS_TERMINAL_HISTORY_KEY) ?? [];
  }
}

export async function saveConsoleLogs(logs: LogEntry[]): Promise<void> {
  try {
    const db = await openDb();
    await db.put(SETTINGS_STORE, logs, CONSOLE_LOGS_KEY);
  } catch {
    safeLocalStorageSet(LS_CONSOLE_LOGS_KEY, logs);
  }
}

export async function loadConsoleLogs(): Promise<LogEntry[]> {
  try {
    const db = await openDb();
    const logs = await db.get(SETTINGS_STORE, CONSOLE_LOGS_KEY);
    return Array.isArray(logs) ? (logs as LogEntry[]) : [];
  } catch {
    return safeLocalStorageGet<LogEntry[]>(LS_CONSOLE_LOGS_KEY) ?? [];
  }
}
