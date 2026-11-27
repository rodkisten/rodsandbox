import ts from 'typescript';
import { manifestVersions, resolvePackageVersion } from '@/bundler/moduleResolver';
import { readDeclarations, writeDeclarations } from './typeCache';

export type TypeAttempt = { name: string; version: string; status: 'loading' | 'loaded' | 'unavailable'; count: number; durationMs: number };
type Source = { path: string; content: string };
const pending = new Map<string, Promise<Map<string, string>>>();

async function packages(files: Source[]): Promise<Map<string, string>> {
  const versions = new Map(Object.entries(manifestVersions(files)));
  const imports = new Set<string>();
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue;
    for (const item of ts.preProcessFile(file.content, true, true).importedFiles) {
      const match = item.fileName.match(/^(@[\w.-]+\/[\w.-]+|[\w-][\w.-]*)(?:\/|$)/);
      if (match) imports.add(match[1]);
    }
  }
  const requested = new Map([...versions].filter(([name]) => imports.has(name) || name.startsWith('@types/')));
  if (files.some(file => /\.[jt]sx$/.test(file.path)) && versions.has('react')) {
    requested.set('react', versions.get('react')!);
    if (!requested.has('@types/react')) requested.set('@types/react', versions.get('@types/react') ?? 'latest');
  }
  return new Map(await Promise.all([...requested].map(async ([name, range]) => [name, await resolvePackageVersion(name, range)] as const)));
}

async function acquire(name: string, version: string): Promise<Map<string, string>> {
  const key = 'exports-v2:' + name + '@' + version;
  const cached = await readDeclarations(key);
  if (cached) return cached;
  const root = 'https://cdn.jsdelivr.net/npm/' + name + '@' + encodeURIComponent(version) + '/';
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
    const visited = new Set<string>();
    const visit = async (relative: string): Promise<void> => {
      if (visited.size >= 64 || visited.has(relative)) return;
      if (!/^[\w./-]+\.d\.[cm]?ts$/.test(relative) || relative.split('/').includes('..')) return;
      visited.add(relative);
      const declaration = await fetch(root + relative, { signal: controller.signal });
      if (!declaration.ok) return;
      const source = await declaration.text();
      files.set('/node_modules/' + name + '/' + relative, source);
      const refs = ts.preProcessFile(source, true, true);
      const children = [...refs.importedFiles, ...refs.referencedFiles].map(ref => ref.fileName);
      await Promise.all(children.filter(ref => ref.startsWith('.')).map(async ref => {
        const parts = relative.split('/').slice(0, -1);
        for (const part of ref.split('/')) {
          if (part === '..') { if (!parts.length) return; parts.pop(); }
          else if (part !== '.') parts.push(part);
        }
        const target = parts.join('/');
        if (/\.d\.[cm]?ts$/.test(target)) await visit(target);
        else {
          await visit(target.replace(/\.[cm]?js$/, '') + '.d.ts');
          await visit(target + '/index.d.ts');
        }
      }));
    };
    // Include explicit declaration exports (including React JSX runtime).
    const exportPaths = new Set<string>();
    const scanExports = (value: unknown, depth = 0): void => {
      if (depth > 8 || exportPaths.size >= 24) return;
      if (typeof value === 'string') {
        const target = value.replace(/^\.\//, '');
        if (/^[\w./-]+\.d\.[cm]?ts$/.test(target) && !target.split('/').includes('..')) exportPaths.add(target);
      } else if (value && typeof value === 'object') {
        for (const child of Object.values(value)) scanExports(child, depth + 1);
      }
    };
    scanExports(data.exports);
    if (name === '@types/react') {
      exportPaths.add('jsx-runtime.d.ts');
      exportPaths.add('jsx-dev-runtime.d.ts');
    }
    if (name === '@types/react-dom') {
      exportPaths.add('client.d.ts');
      exportPaths.add('server.d.ts');
    }
    await Promise.all([visit(path), ...[...exportPaths].map(visit)]);
    if (!files.size) return files;
    files.set('/node_modules/' + name + '/package.json', manifest);
    await writeDeclarations(key, files);
  } catch { /* Offline or unavailable package. */ }
  finally { clearTimeout(timer); }
  return files;
}

function acquireOnce(name: string, version: string): Promise<Map<string, string>> {
  const key = name + '@' + version;
  let task = pending.get(key);
  if (!task) {
    task = acquire(name, version).then(async result => {
      if (result.size || name.startsWith('@types/')) return result;
      return acquire('@types/' + name.replace(/^@/, '').replace('/', '__'), 'latest');
    }).finally(() => pending.delete(key));
    pending.set(key, task);
  }
  return task;
}

export async function acquireWorkspaceTypes(files: Source[], report?: (attempt: TypeAttempt) => void): Promise<Map<string, string>> {
  const requested = await packages(files);
  const result = new Map<string, string>();
  const visited = new Set<string>();
  let frontier = [...requested].sort(([a], [b]) => Number(!a.startsWith('@types/')) - Number(!b.startsWith('@types/')));
  for (let depth = 0; depth < 3 && frontier.length && visited.size < 24; depth++) {
    const batch = frontier.filter(([name]) => !visited.has(name)).slice(0, 24 - visited.size);
    for (const [name] of batch) visited.add(name);
    const acquired = await Promise.all(batch.map(async ([name, version]) => {
      const started = performance.now();
      report?.({ name, version, status: 'loading', count: 0, durationMs: 0 });
      const entries = await acquireOnce(name, version).catch(() => new Map<string, string>());
      const count = [...entries.keys()].filter(path => /\.d\.[cm]?ts$/.test(path)).length;
      report?.({ name, version, status: count ? 'loaded' : 'unavailable', count, durationMs: Math.round(performance.now() - started) });
      return entries;
    }));
    const next = new Map<string, string>();
    for (const entries of acquired) {
      const declared = new Map<string, string>();
      for (const [path, content] of entries) {
        result.set(path, content);
        if (!path.endsWith('/package.json')) continue;
        try {
          const manifest = JSON.parse(content);
          for (const [name, version] of Object.entries({ ...manifest.peerDependencies, ...manifest.dependencies })) {
            if (typeof version === 'string' && /^(?:[~^]?\d+(?:\.\d+){0,2}(?:-[\w.-]+)?|latest|\*)$/.test(version)) declared.set(name, version);
          }
        } catch { /* Invalid package metadata. */ }
      }
      for (const [path, content] of entries) {
        if (!/\.d\.[cm]?ts$/.test(path)) continue;
        const refs = ts.preProcessFile(content, true, true);
        for (const ref of [...refs.importedFiles, ...refs.typeReferenceDirectives]) {
          const match = ref.fileName.match(/^(@[\w.-]+\/[\w.-]+|[\w-][\w.-]*)(?:\/|$)/);
          if (!match || visited.has(match[1])) continue;
          const name = match[1];
          const version = requested.get(name) ?? declared.get(name);
          if (version) next.set(name, version);
          else if (refs.typeReferenceDirectives.includes(ref)) next.set('@types/' + name.replace(/^@/, '').replace('/', '__'), 'latest');
        }
      }
    }
    frontier = [...next];
  }
  return result;
}
