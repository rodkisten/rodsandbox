/// <reference lib="webworker" />
import { resolveManifestVersions, moduleUrl } from '@/bundler/moduleResolver';
import type { Diagnostic } from '@/types';
import type { BundlerBuildRequest, BundlerMessage, WorkerFileInput } from './messages';
import { inferVirtualLoader, normalizeVirtualPath, resolveVirtualImportPath, resolveWithKnownExtensions } from '@/bundler/pathResolver';

interface EsbuildOutputFile { path: string; text: string }
interface EsbuildBuildResult { outputFiles?: EsbuildOutputFile[] }
type EsbuildLoader = 'ts' | 'tsx' | 'js' | 'jsx' | 'css' | 'text' | 'json';
interface EsbuildPluginBuild {
  onResolve(options: { filter: RegExp }, callback: (args: { path: string; importer: string; resolveDir: string }) => { path: string; namespace?: string; external?: boolean } | null): void;
  onLoad(options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => { contents: string; loader: EsbuildLoader } | null): void;
}
interface EsbuildApi {
  initialize(options: { wasmURL: string; worker: boolean }): Promise<void>;
  build(options: {
    stdin: { contents: string; sourcefile: string; resolveDir: string; loader: 'ts' | 'tsx' | 'js' | 'jsx' };
    bundle: boolean;
    write: boolean;
    format: 'esm';
    sourcemap: 'inline';
    plugins: Array<{ name: string; setup: (build: EsbuildPluginBuild) => void }>;
  }): Promise<EsbuildBuildResult>;
}

let esbuild: EsbuildApi | null = null;
let latestRequestId = 0;
const ESBUILD_VERSION = '0.27.0';
const ESBUILD_WASM_URL = `https://esm.sh/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;

// ─── package.json helpers ─────────────────────────────────────────────────────

function extractDependencies(files: WorkerFileInput[]): string[] {
  const deps = new Set<string>();
  const importRegex = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]*?from\s+|import\()\s*['"]([^'"]+)['"]/g;
  for (const file of files) {
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(file.content)) !== null) {
      const specifier = match[1];
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) continue;
      deps.add(specifier);
    }
  }
  return Array.from(deps).sort();
}


function buildFileLookup(files: WorkerFileInput[]): Map<string, WorkerFileInput> {
  const map = new Map<string, WorkerFileInput>();
  for (const file of files) map.set(normalizeVirtualPath(file.path), file);
  return map;
}

async function ensureEsbuild(): Promise<EsbuildApi> {
  if (esbuild) return esbuild;
  try {
    // @ts-expect-error Remote ESM module is resolved in worker runtime.
    const loaded = (await import('https://esm.sh/esbuild-wasm@0.27.0')) as EsbuildApi;
    await loaded.initialize({ wasmURL: ESBUILD_WASM_URL, worker: false });
    esbuild = loaded;
    return loaded;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Failed to initialize esbuild-wasm from https://esm.sh/esbuild-wasm@0.27.0. Check network/CSP availability. ${reason}`);
  }
}

function normalizeBuildError(error: unknown, fileId: string): Diagnostic {
  return {
    id: `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    fileId,
    severity: 'error',
    message: error instanceof Error ? error.message : 'Build failed',
    line: 1,
    column: 1,
    source: 'build',
  };
}

self.onmessage = async (event: MessageEvent<BundlerMessage>) => {
  const message = event.data;
  if (message.type !== 'BUNDLE_BUILD') return;

  latestRequestId = message.requestId;
  const req = message as BundlerBuildRequest;
  const fileLookup = buildFileLookup(req.files);
  const entryFile = normalizeVirtualPath(req.entryFile);
  const dependencies = extractDependencies(req.files);
  const pkgDeps = await resolveManifestVersions(req.files);
  const importMap: Record<string, string> = Object.create(null);

  try {
    if (req.requestId !== latestRequestId) return;
    const buildApi = await ensureEsbuild();
    const entryContent = fileLookup.get(entryFile)?.content ?? '';
    const inferredEntryLoader = inferVirtualLoader(entryFile);
    const entryLoader: 'ts' | 'tsx' | 'js' | 'jsx' = inferredEntryLoader === 'js' || inferredEntryLoader === 'jsx' || inferredEntryLoader === 'tsx'
      ? inferredEntryLoader
      : 'ts';

    const result = await buildApi.build({
      stdin: {
        contents: entryContent,
        sourcefile: entryFile,
        resolveDir: '/',
        loader: entryLoader,
      },
      bundle: true,
      write: false,
      format: 'esm',
      sourcemap: 'inline',
      plugins: [{
        name: 'rodsandbox-virtual-fs',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const candidate = args.importer
              ? resolveVirtualImportPath(args.importer, args.path)
              : normalizeVirtualPath(args.path);
            const withExt = resolveWithKnownExtensions(candidate, (path) => fileLookup.has(path));

            if (withExt) return { path: withExt, namespace: 'virtual' };

            // Bare module import not found in virtual FS → resolve via esm.sh.
            // Skip relative / absolute paths and skip specifiers starting with
            // a known CDN URL (already fully qualified).
            const p = args.path;
            if (!p.startsWith('.') && !p.startsWith('/') && !p.startsWith('https://') && !p.startsWith('http://')) {
              const url = moduleUrl(p, pkgDeps);
              if (url) { importMap[p] = url; return { path: p, external: true }; }
            }
            if (/^https:\/\//.test(p)) return { path: p, external: true };
            return null;
          });

          build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
            const file = fileLookup.get(normalizeVirtualPath(args.path));
            if (!file) return null;
            return { contents: file.content, loader: inferVirtualLoader(file.path) };
          });
        },
      }],
    });

    if (req.requestId === latestRequestId) {
      const code = result.outputFiles?.find((file) => file.path.endsWith('.js'))?.text ?? '';
      const cssText = result.outputFiles?.find((file) => file.path.endsWith('.css'))?.text ?? '';
      self.postMessage({ type: 'BUNDLE_RESULT', requestId: req.requestId, success: true, code, cssText, dependencies, importMap });
    }
  } catch (error) {
    if (req.requestId === latestRequestId) {
      self.postMessage({
        type: 'BUNDLE_RESULT',
        requestId: req.requestId,
        success: false,
        errors: [normalizeBuildError(error, entryFile)],
      });
    }
  }
};
