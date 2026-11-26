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
