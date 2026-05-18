import { openDB, IDBPDatabase } from 'idb';
import { Workspace, AppSettings } from '@/types';
import { DB_NAME, DB_VERSION, WORKSPACE_STORE, SETTINGS_STORE, SETTINGS_KEY, REPL_HISTORY_KEY } from '@/constants';

type RodSandboxDB = {
  workspaces: { key: string; value: Workspace };
  settings: { key: string; value: AppSettings | string[] };
};

let dbPromise: Promise<IDBPDatabase<RodSandboxDB>> | null = null;
const LS_WORKSPACE_PREFIX = 'rodsandbox:workspace:';
const LS_SETTINGS_KEY = 'rodsandbox:settings';
const LS_REPL_HISTORY_KEY = 'rodsandbox:repl-history';

export function openDb(): Promise<IDBPDatabase<RodSandboxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RodSandboxDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
          db.createObjectStore(WORKSPACE_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE);
        }
      },
    });
  }
  return dbPromise;
}

function safeLocalStorageGet<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function safeLocalStorageSet<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op fallback
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
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
