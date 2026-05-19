/**
 * Normalize a virtual file path to POSIX style and strip leading slash.
 * @param path Input path.
 * @returns Normalized path.
 * @example
 * normalizeVirtualPath('/src\\main.ts') // 'src/main.ts'
 */
export function normalizeVirtualPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Resolve a relative import against an importer path in virtual FS.
 * @param importer Importer file path.
 * @param specifier Import specifier.
 * @returns Resolved path or original specifier for bare imports.
 */
export function resolveVirtualImportPath(importer: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier;
  const importerSegments = normalizeVirtualPath(importer).split('/');
  importerSegments.pop();

  for (const segment of specifier.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') importerSegments.pop();
    else importerSegments.push(segment);
  }

  return importerSegments.join('/');
}

/**
 * Infer esbuild loader from a file path.
 */
export function inferVirtualLoader(path: string): 'ts' | 'tsx' | 'js' | 'jsx' | 'css' | 'text' | 'json' {
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.txt') || path.endsWith('.md') || path.endsWith('.html')) return 'text';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs')) return 'js';
  return 'ts';
}

export function resolveWithKnownExtensions(candidate: string, hasFile: (path: string) => boolean): string | null {
  const probe = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.js`,
    `${candidate}.jsx`,
    `${candidate}.mjs`,
    `${candidate}.cjs`,
    `${candidate}.css`,
    `${candidate}.json`,
  ];
  return probe.find((path) => hasFile(path)) ?? null;
}
