import { openDB } from 'idb';

const database = () => openDB('rodsandbox-type-cache', 1, {
  upgrade(db) { db.createObjectStore('declarations'); },
});

type CachedDeclarations = { expiresAt: number; files: Array<[string, string]> };

export async function readDeclarations(key: string): Promise<Map<string, string> | undefined> {
  try {
    const db = await database();
    try {
      const value = await db.get('declarations', key) as CachedDeclarations | undefined;
      if (value && value.expiresAt > Date.now()) return new Map(value.files);
    } finally { db.close(); }
  } catch { /* Cache is optional in restricted browser contexts. */ }
}

export async function writeDeclarations(key: string, files: ReadonlyMap<string, string>): Promise<void> {
  try {
    const db = await database();
    try {
      await db.put('declarations', { expiresAt: Date.now() + 86400000, files: [...files] }, key);
    } finally { db.close(); }
  } catch { /* Cache failure must not prevent editing. */ }
}
