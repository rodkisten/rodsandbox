/// <reference lib="webworker" />
import type { Diagnostic } from '@/types';
import type { BundlerBuildRequest, BundlerMessage, WorkerFileInput } from './messages';

interface EsbuildOutputFile { path: string; text: string }
interface EsbuildBuildResult { outputFiles?: EsbuildOutputFile[] }
interface EsbuildPluginBuild {
  onResolve(options: { filter: RegExp }, callback: (args: { path: string; importer: string; resolveDir: string }) => { path: string; namespace?: string } | null): void;
  onLoad(options: { filter: RegExp; namespace?: string }, callback: (args: { path: string }) => { contents: string; loader: 'ts' | 'js' | 'css' | 'text' | 'json' } | null): void;
}
interface EsbuildApi {
  initialize(options: { wasmURL: string; worker: boolean }): Promise<void>;
  build(options: {
    stdin: { contents: string; sourcefile: string; resolveDir: string; loader: 'ts' | 'js' };
    bundle: boolean;
    write: boolean;
    format: 'iife';
    sourcemap: 'inline';
    plugins: Array<{ name: string; setup: (build: EsbuildPluginBuild) => void }>;
  }): Promise<EsbuildBuildResult>;
}

let esbuild: EsbuildApi | null = null;
let latestRequestId = 0;

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolveImportPath(importer: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier;
  const importerSegments = normalizePath(importer).split('/');
  importerSegments.pop();
  for (const segment of specifier.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') importerSegments.pop();
    else importerSegments.push(segment);
  }
  return importerSegments.join('/');
}

function inferLoader(path: string): 'ts' | 'js' | 'css' | 'text' | 'json' {
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.txt') || path.endsWith('.md') || path.endsWith('.html')) return 'text';
  if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.jsx')) return 'js';
  return 'ts';
}

function buildFileLookup(files: WorkerFileInput[]): Map<string, WorkerFileInput> {
  const map = new Map<string, WorkerFileInput>();
  for (const file of files) map.set(normalizePath(file.path), file);
  return map;
}

async function ensureEsbuild(): Promise<EsbuildApi> {
  if (esbuild) return esbuild;
  // @ts-expect-error Remote ESM module is intentionally resolved in worker runtime.
  const loaded = (await import('https://esm.sh/esbuild-wasm@0.27.0')) as EsbuildApi;
  await loaded.initialize({ wasmURL: 'https://esm.sh/esbuild-wasm@0.27.0/esbuild.wasm', worker: false });
  esbuild = loaded;
  return loaded;
}

function normalizeBuildError(error: unknown, fileId: string): Diagnostic {
  return {
    id: `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    fileId,
    severity: 'error',
    message: error instanceof Error ? error.message : 'Build failed',
    line: 1,
    column: 1,
    source: 'typescript',
  };
}

self.onmessage = async (event: MessageEvent<BundlerMessage>) => {
  const message = event.data;
  if (message.type !== 'BUNDLE_BUILD') return;

  latestRequestId = message.requestId;
  const req = message as BundlerBuildRequest;
  const fileLookup = buildFileLookup(req.files);
  const entryFile = normalizePath(req.entryFile);

  try {
    const buildApi = await ensureEsbuild();
    const entryContent = fileLookup.get(entryFile)?.content ?? '';

    const result = await buildApi.build({
      stdin: {
        contents: entryContent,
        sourcefile: entryFile,
        resolveDir: '/',
        loader: inferLoader(entryFile) === 'js' ? 'js' : 'ts',
      },
      bundle: true,
      write: false,
      format: 'iife',
      sourcemap: 'inline',
      plugins: [{
        name: 'rodsandbox-virtual-fs',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const candidate = args.importer
              ? resolveImportPath(args.importer, args.path)
              : normalizePath(args.path);
            const withExt = [candidate, `${candidate}.ts`, `${candidate}.js`, `${candidate}.css`, `${candidate}.json`]
              .find((path) => fileLookup.has(path));

            if (withExt) return { path: withExt, namespace: 'virtual' };
            return null;
          });

          build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
            const file = fileLookup.get(normalizePath(args.path));
            if (!file) return null;
            return { contents: file.content, loader: inferLoader(file.path) };
          });
        },
      }],
    });

    if (req.requestId !== latestRequestId) return;
    const code = result.outputFiles?.find((file) => file.path.endsWith('.js'))?.text ?? '';
    const cssText = result.outputFiles?.find((file) => file.path.endsWith('.css'))?.text ?? '';
    self.postMessage({ type: 'BUNDLE_RESULT', requestId: req.requestId, success: true, code, cssText });
  } catch (error) {
    if (req.requestId !== latestRequestId) return;
    self.postMessage({
      type: 'BUNDLE_RESULT',
      requestId: req.requestId,
      success: false,
      errors: [normalizeBuildError(error, entryFile)],
    });
  }
};
