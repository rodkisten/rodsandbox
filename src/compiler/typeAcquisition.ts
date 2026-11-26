import ts from 'typescript';
import { readDeclarations, writeDeclarations } from './typeCache';

type Source = { path: string; content: string };
const pending = new Map<string, Promise<Map<string, string>>>();

function packages(files: Source[]): Map<string, string> {
  const manifest = files.find(f => f.path.replace(/^\//, '') === 'package.json');
  const versions = new Map<string, string>();
  if (!manifest) return versions;
  try {
    const data = JSON.parse(manifest.content);
    for (const section of ['dependencies', 'devDependencies']) {
      for (const [name, version] of Object.entries(data[section] ?? {})) {
        if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) versions.set(name, version);
      }
    }
  } catch { /* Invalid manifest while editing. */ }
  const imports = new Set<string>();
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue;
    for (const item of ts.preProcessFile(file.content, true, true).importedFiles) {
      const match = item.fileName.match(/^(@[\w.-]+\/[\w.-]+|[\w-][\w.-]*)(?:\/|$)/);
      if (match) imports.add(match[1]);
    }
  }
  return new Map([...versions].filter(([name]) => imports.has(name)));
}

async function acquire(name: string, version: string): Promise<Map<string, string>> {
  const key = name + '@' + version;
  const cached = await readDeclarations(key);
  if (cached) return cached;
  const root = 'https://cdn.jsdelivr.net/npm/' + key + '/';
  const files = new Map<string, string>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(root + 'package.json', { signal: controller.signal });
    if (!response.ok) return files;
    const manifest = await response.text();
    const data = JSON.parse(manifest);
    const entry = data.types ?? data.typings ?? 'index.d.ts';
    if (typeof entry !== 'string') return files;
    const path = entry.replace(/^\.\//, '');
    if (!/^[\w./-]+\.d\.[cm]?ts$/.test(path) || path.split('/').includes('..')) return files;
    const declaration = await fetch(root + path, { signal: controller.signal });
    if (!declaration.ok) return files;
    files.set('/node_modules/' + name + '/package.json', manifest);
    files.set('/node_modules/' + name + '/' + path, await declaration.text());
    await writeDeclarations(key, files);
  } catch { /* Offline or unavailable package. */ }
  finally { clearTimeout(timer); }
  return files;
}

export async function acquireWorkspaceTypes(files: Source[]): Promise<Map<string, string>> {
  const results = await Promise.all([...packages(files)].slice(0, 24).map(([name, version]) => {
    const key = name + '@' + version;
    let task = pending.get(key);
    if (!task) {
      task = acquire(name, version).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    return task;
  }));
  return new Map(results.flatMap(result => [...result]));
}
