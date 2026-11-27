import { openDB, IDBPDatabase } from "idb";
import { Workspace, AppSettings, WorkspaceSummary, LogEntry } from "@/types";
import {
  DB_NAME,
  DB_VERSION,
  WORKSPACE_STORE,
  SETTINGS_STORE,
  SETTINGS_KEY,
  REPL_HISTORY_KEY,
  TERMINAL_HISTORY_KEY,
  CONSOLE_LOGS_KEY,
} from "@/constants";

type RodSandboxDB = {
  workspaces: { key: string; value: Workspace };
  settings: { key: string; value: AppSettings | string[] | LogEntry[] };
};

export function createPersistence(scope = "") {
  const prefix = scope
    ? `rodsandbox:${encodeURIComponent(scope)}:`
    : "rodsandbox:";
  let disposed = false;
  let dbPromise: Promise<IDBPDatabase<RodSandboxDB>> | null = null;
  const LS_WORKSPACE_PREFIX = prefix + "workspace:";
  const LS_SETTINGS_KEY = prefix + "settings";
  const LS_REPL_HISTORY_KEY = prefix + "repl-history";
  const LS_TERMINAL_HISTORY_KEY = prefix + "terminal-history";
  const LS_CONSOLE_LOGS_KEY = prefix + "console-logs";

  function openDb(): Promise<IDBPDatabase<RodSandboxDB>> {
    if (disposed)
      return Promise.reject(new Error("Sandbox persistence disposed"));
    if (!dbPromise) {
      dbPromise = openDB<RodSandboxDB>(
        scope ? `${DB_NAME}:${encodeURIComponent(scope)}` : DB_NAME,
        DB_VERSION,
        {
          upgrade(db, oldVersion) {
            if (oldVersion < 1) {
              if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
                db.createObjectStore(WORKSPACE_STORE, { keyPath: "id" });
              }
              if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE);
              }
            }
            // v2: no schema change — ownerId was added as an optional field
          },
        },
      );
    }
    return dbPromise;
  }

  function safeLocalStorageGet<T>(key: string): T | undefined {
    try {
      if (typeof window === "undefined") return undefined;
      const raw = window.localStorage.getItem(key);
      if (!raw) return undefined;
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  function safeLocalStorageSet<T>(key: string, value: T): void {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // no-op fallback
    }
  }

  function safeLocalStorageRemove(key: string): void {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
    } catch {
      // no-op fallback
    }
  }

  async function saveWorkspace(workspace: Workspace): Promise<void> {
    try {
      const db = await openDb();
      await db.put(WORKSPACE_STORE, workspace);
    } catch {
      safeLocalStorageSet(`${LS_WORKSPACE_PREFIX}${workspace.id}`, workspace);
    }
  }

  async function loadWorkspace(id: string): Promise<Workspace | undefined> {
    try {
      const db = await openDb();
      return db.get(WORKSPACE_STORE, id);
    } catch {
      return safeLocalStorageGet<Workspace>(`${LS_WORKSPACE_PREFIX}${id}`);
    }
  }

  async function saveSettings(settings: AppSettings): Promise<void> {
    try {
      const db = await openDb();
      await db.put(SETTINGS_STORE, settings, SETTINGS_KEY);
    } catch {
      safeLocalStorageSet(LS_SETTINGS_KEY, settings);
    }
  }

  async function loadSettings(): Promise<AppSettings | undefined> {
    try {
      const db = await openDb();
      const value = await db.get(SETTINGS_STORE, SETTINGS_KEY);
      return Array.isArray(value) ? undefined : value;
    } catch {
      return safeLocalStorageGet<AppSettings>(LS_SETTINGS_KEY);
    }
  }

  async function listWorkspaces(): Promise<Workspace[]> {
    try {
      const db = await openDb();
      return db.getAll(WORKSPACE_STORE);
    } catch {
      if (typeof window === "undefined") return [];
      const keys = Object.keys(window.localStorage);
      const result: Workspace[] = [];
      for (const key of keys) {
        if (!key.startsWith(LS_WORKSPACE_PREFIX)) continue;
        const ws = safeLocalStorageGet<Workspace>(key);
        if (ws) result.push(ws);
      }
      return result;
    }
  }

  /**
   * Returns lightweight summaries for all workspaces owned by `ownerId`,
   * without loading full file contents.
   *
   * @param ownerId - User ID to filter by. Pass `undefined` to return all workspaces.
   */
  async function listWorkspaceSummaries(
    ownerId?: string,
  ): Promise<WorkspaceSummary[]> {
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

  async function deleteWorkspace(id: string): Promise<void> {
    try {
      const db = await openDb();
      await db.delete(WORKSPACE_STORE, id);
    } catch {
      safeLocalStorageRemove(`${LS_WORKSPACE_PREFIX}${id}`);
    }
  }

  async function saveReplHistory(history: string[]): Promise<void> {
    try {
      const db = await openDb();
      await db.put(SETTINGS_STORE, history, REPL_HISTORY_KEY);
    } catch {
      safeLocalStorageSet(LS_REPL_HISTORY_KEY, history);
    }
  }

  async function loadReplHistory(): Promise<string[]> {
    try {
      const db = await openDb();
      const history = await db.get(SETTINGS_STORE, REPL_HISTORY_KEY);
      return Array.isArray(history)
        ? history.filter((entry) => typeof entry === "string")
        : [];
    } catch {
      return safeLocalStorageGet<string[]>(LS_REPL_HISTORY_KEY) ?? [];
    }
  }

  async function saveTerminalHistory(history: string[]): Promise<void> {
    try {
      const db = await openDb();
      await db.put(SETTINGS_STORE, history, TERMINAL_HISTORY_KEY);
    } catch {
      safeLocalStorageSet(LS_TERMINAL_HISTORY_KEY, history);
    }
  }

  async function loadTerminalHistory(): Promise<string[]> {
    try {
      const db = await openDb();
      const history = await db.get(SETTINGS_STORE, TERMINAL_HISTORY_KEY);
      return Array.isArray(history)
        ? history.filter((entry) => typeof entry === "string")
        : [];
    } catch {
      return safeLocalStorageGet<string[]>(LS_TERMINAL_HISTORY_KEY) ?? [];
    }
  }

  async function saveConsoleLogs(logs: LogEntry[]): Promise<void> {
    try {
      const db = await openDb();
      await db.put(SETTINGS_STORE, logs, CONSOLE_LOGS_KEY);
    } catch {
      safeLocalStorageSet(LS_CONSOLE_LOGS_KEY, logs);
    }
  }

  async function loadConsoleLogs(): Promise<LogEntry[]> {
    try {
      const db = await openDb();
      const logs = await db.get(SETTINGS_STORE, CONSOLE_LOGS_KEY);
      return Array.isArray(logs) ? (logs as LogEntry[]) : [];
    } catch {
      return safeLocalStorageGet<LogEntry[]>(LS_CONSOLE_LOGS_KEY) ?? [];
    }
  }

  return {
    openDb,
    saveWorkspace,
    loadWorkspace,
    saveSettings,
    loadSettings,
    listWorkspaces,
    listWorkspaceSummaries,
    deleteWorkspace,
    saveReplHistory,
    loadReplHistory,
    saveTerminalHistory,
    loadTerminalHistory,
    saveConsoleLogs,
    loadConsoleLogs,
    close: async () => {
      disposed = true;
      const pending = dbPromise;
      dbPromise = null;
      (await pending)?.close();
    },
  };
}
export const {
  openDb,
  saveWorkspace,
  loadWorkspace,
  saveSettings,
  loadSettings,
  listWorkspaces,
  listWorkspaceSummaries,
  deleteWorkspace,
  saveReplHistory,
  loadReplHistory,
  saveTerminalHistory,
  loadTerminalHistory,
  saveConsoleLogs,
  loadConsoleLogs,
} = createPersistence();
