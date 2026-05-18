import { openDB, IDBPDatabase } from 'idb';
import { Workspace, AppSettings } from '@/types';
import { DB_NAME, DB_VERSION, WORKSPACE_STORE, SETTINGS_STORE, SETTINGS_KEY } from '@/constants';

type RodSandboxDB = {
  workspaces: { key: string; value: Workspace };
  settings: { key: string; value: AppSettings };
};

let dbPromise: Promise<IDBPDatabase<RodSandboxDB>> | null = null;

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

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await openDb();
  await db.put(WORKSPACE_STORE, workspace);
}

export async function loadWorkspace(id: string): Promise<Workspace | undefined> {
  const db = await openDb();
  return db.get(WORKSPACE_STORE, id);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await openDb();
  await db.put(SETTINGS_STORE, settings, SETTINGS_KEY);
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  const db = await openDb();
  return db.get(SETTINGS_STORE, SETTINGS_KEY);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await openDb();
  return db.getAll(WORKSPACE_STORE);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await openDb();
  await db.delete(WORKSPACE_STORE, id);
}
