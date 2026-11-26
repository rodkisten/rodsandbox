export type ModuleSource = { path: string; content: string };
export const packageName = (specifier: string): string | undefined =>
  /^(?:(@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]*))(?:\/|$)/i.exec(specifier)?.[1];
export function manifestVersions(files: ModuleSource[]): Record<string, string> {
  const file = files.find(f => f.path.replace(/^\//, '') === 'package.json');
  const result: Record<string, string> = Object.create(null);
  try {
    const manifest = JSON.parse(file?.content ?? '{}');
    for (const [name, version] of Object.entries({ ...manifest.devDependencies, ...manifest.dependencies })) {
      if (packageName(name) === name && typeof version === 'string' && /^(?:[~^]?\d+(?:\.\d+){0,2}(?:-[\w.-]+)?|latest|\*)$/.test(version)) result[name] = version;
    }
  } catch { /* Manifest may be incomplete during editing. */ }
  return result;
}
export function moduleUrl(specifier: string, versions: Record<string, string>): string | undefined {
  const name = packageName(specifier);
  if (!name || !/^[\w@./-]+$/.test(specifier) || specifier.split('/').includes('..')) return undefined;
  const version = versions[name];
  return 'https://esm.sh/' + name + (version ? '@' + version : '') + specifier.slice(name.length);
}

const exactVersion = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const inFlight = new Map<string, Promise<string>>();
export async function resolvePackageVersion(name: string, range: string): Promise<string> {
  if (exactVersion.test(range)) return range;
  if (packageName(name) !== name) return range;
  const key = name + '@' + range;
  const url = 'https://cdn.jsdelivr.net/npm/' + name + '@' + encodeURIComponent(range) + '/package.json';
  try {
    const cache = await caches.open('rodsandbox-module-versions-v1');
    const hit = await cache.match(url);
    if (hit) {
      const data = await hit.json() as { version: string; expires: number };
      if (data.expires > Date.now() && exactVersion.test(data.version)) return data.version;
    }
  } catch { /* Cache storage may be unavailable. */ }
  let task = inFlight.get(key);
  if (!task) {
    task = (async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) return range;
        const data = await response.json() as { version?: string };
        if (!data.version || !exactVersion.test(data.version)) return range;
        try {
          const cache = await caches.open('rodsandbox-module-versions-v1');
          await cache.put(url, new Response(JSON.stringify({ version: data.version, expires: Date.now() + 3600000 }), { headers: { 'Content-Type': 'application/json' } }));
        } catch { /* Resolution works without persistent cache. */ }
        return data.version;
      } catch { return range; }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
  }
  return task;
}
export async function resolveManifestVersions(files: ModuleSource[]): Promise<Record<string, string>> {
  const versions = manifestVersions(files);
  const entries = await Promise.all(Object.entries(versions).map(async ([name, range]) => [name, await resolvePackageVersion(name, range)] as const));
  return Object.assign(Object.create(null), Object.fromEntries(entries));
}
